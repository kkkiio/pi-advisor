import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ImageContent, TextContent } from "@earendil-works/pi-ai";
import type { ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import { ADVISOR_ADVICE_CUSTOM_TYPE, ADVISOR_OMITTED_CUSTOM_TYPE } from "./types";
import type {
	AdvisorAdviceDetails,
	AskContext,
	PrimaryAgentLoopState,
	PrimaryTranscriptView,
	PullTranscriptDetails,
	PullTranscriptDisplayItem,
	PullTranscriptRequest,
	PullWaitResult,
} from "./types";
import { escapeXmlText, formatSessionHistoryMarkdown } from "./session-history-format";

const DEFAULT_PULL_COUNT = 100;
const MAX_PULL_COUNT = 200;

export function messageContentToText(content: string | readonly (TextContent | ImageContent)[]): string {
	if (typeof content === "string") {
		return content;
	}
	return content.map((part) => (part.type === "text" ? part.text : "[image]")).join("\n");
}

export function isAdvisorAdviceMessage(message: AgentMessage): boolean {
	if (message.role !== "custom") {
		return false;
	}
	const details = message.details as Partial<AdvisorAdviceDetails> | undefined;
	return message.customType === ADVISOR_ADVICE_CUSTOM_TYPE && details?.origin === "advisor";
}

export function isAdvisorCommandMessage(message: AgentMessage): boolean {
	if (message.role !== "user") {
		return false;
	}
	const text = messageContentToText(message.content).trim();
	return /^\/advisor(?::[a-z-]+)?(?:\s|$)/.test(text);
}

export function buildPrimaryTranscriptView(
	ctx: Pick<ExtensionContext, "sessionManager">,
	liveAssistant?: AgentMessage,
): PrimaryTranscriptView {
	const branch = ctx.sessionManager.getBranch();
	const rawMessages = branch.flatMap((entry) => {
		const message = sessionEntryToMessage(entry);
		return message ? [message] : [];
	});
	if (liveAssistant?.role === "assistant") {
		let existingLiveIndex = -1;
		for (let index = rawMessages.length - 1; index >= 0; index--) {
			const candidate = rawMessages[index];
			if (candidate.role === "assistant" && candidate.timestamp === liveAssistant.timestamp) {
				existingLiveIndex = index;
				break;
			}
		}
		if (existingLiveIndex >= 0) {
			rawMessages[existingLiveIndex] = liveAssistant;
		} else {
			rawMessages.push(liveAssistant);
		}
	}
	const messages: AgentMessage[] = [];
	let omittedAdvisorAdviceCount = 0;
	for (const message of rawMessages) {
		if (isAdvisorCommandMessage(message)) {
			continue;
		}
		if (isAdvisorAdviceMessage(message)) {
			const marker = createOmittedAdviceMarker(message);
			if (marker) {
				messages.push(marker);
			}
			omittedAdvisorAdviceCount++;
			continue;
		}
		if (message.role === "custom" && message.customType.startsWith("advisor:")) {
			continue;
		}
		messages.push(message);
	}
	return {
		messages,
		rawMessageCount: rawMessages.length,
		viewMessageCount: messages.length,
		omittedAdvisorAdviceCount,
	};
}

export function selectAskContext(
	view: PrimaryTranscriptView,
	lastInjectedPrimaryUserIndex: number | undefined,
): AskContext | undefined {
	let primaryUserMessageIndex = -1;
	let userText = "";
	for (let index = view.messages.length - 1; index >= 0; index--) {
		const message = view.messages[index];
		if (message.role !== "user") {
			continue;
		}
		const text =
			typeof message.content === "string"
				? message.content
				: message.content
						.filter((part) => part.type === "text" && part.text.trim())
						.map((part) => (part.type === "text" ? part.text : ""))
						.join("\n");
		if (text.trim()) {
			primaryUserMessageIndex = index;
			userText = text;
			break;
		}
	}
	if (primaryUserMessageIndex < 0 || primaryUserMessageIndex === lastInjectedPrimaryUserIndex) {
		return undefined;
	}
	const assistantTexts: string[] = [];
	for (const message of view.messages.slice(primaryUserMessageIndex + 1)) {
		if (message.role !== "assistant") {
			continue;
		}
		const text = message.content
			.filter((part) => part.type === "text" && part.text.trim())
			.map((part) => (part.type === "text" ? part.text : ""))
			.join("\n\n");
		if (text.trim()) {
			assistantTexts.push(text);
		}
	}
	return {
		primaryUserMessageIndex,
		userText,
		assistantTexts,
	};
}

export function renderPrimaryTranscriptSlice(
	view: PrimaryTranscriptView,
	request: PullTranscriptRequest,
	state: PrimaryAgentLoopState,
	waitResult: PullWaitResult,
	waitedMs: number,
): { text: string; details: PullTranscriptDetails } {
	const count = normalizeCount(request.count);
	const normalized = normalizeStartIndex(request.sinceIndex, view.messages.length);
	const start = normalized.outOfBounds ? 0 : normalized.start;
	const end = Math.min(view.messages.length, start + count);
	const messages = view.messages.slice(start, end);
	const displayItems: PullTranscriptDisplayItem[] = [];
	const body = messages.length
		? formatSessionHistoryMarkdown(messages, {
				watchedRoles: true,
				includeToolIntent: true,
				expandPrimaryContext: true,
				expandEditDiffs: true,
				displayItems,
			}).trim()
		: "(no primary transcript entries)";
	const details: PullTranscriptDetails = {
		start,
		end,
		total: view.messages.length,
		primaryAgentLoopState: state,
		waitResult,
		waitedMs,
		sinceIndexOutOfBounds: normalized.outOfBounds,
		omittedAdvisorAdviceCount: view.omittedAdvisorAdviceCount,
		displayItems,
	};
	const attributes = [
		`start="${start}"`,
		`end="${end}"`,
		`total="${view.messages.length}"`,
		`state="${state}"`,
		`wait="${waitResult}"`,
		`waited-ms="${waitedMs}"`,
	];
	if (normalized.outOfBounds) {
		attributes.push('since-index-out-of-bounds="true"');
	}
	if (view.omittedAdvisorAdviceCount > 0) {
		attributes.push(`omitted-advisor-advice="${view.omittedAdvisorAdviceCount}"`);
	}
	return {
		text: `<primary-transcript ${attributes.join(" ")}>\n${escapeXmlText(body)}\n</primary-transcript>\n`,
		details,
	};
}

export function hasNewTranscriptEntries(view: PrimaryTranscriptView, request: PullTranscriptRequest): boolean {
	const normalized = normalizeStartIndex(request.sinceIndex, view.messages.length);
	const start = normalized.outOfBounds ? 0 : normalized.start;
	return start < view.messages.length;
}

function normalizeCount(count: number | undefined): number {
	if (typeof count !== "number" || !Number.isFinite(count)) {
		return DEFAULT_PULL_COUNT;
	}
	return Math.max(1, Math.min(MAX_PULL_COUNT, Math.floor(count)));
}

function normalizeStartIndex(sinceIndex: number | undefined, total: number): { start: number; outOfBounds: boolean } {
	if (typeof sinceIndex !== "number" || !Number.isFinite(sinceIndex)) {
		return { start: 0, outOfBounds: false };
	}
	const integer = Math.trunc(sinceIndex);
	if (integer < 0) {
		return { start: Math.max(0, total + integer), outOfBounds: false };
	}
	if (integer > total) {
		return { start: 0, outOfBounds: true };
	}
	return { start: integer, outOfBounds: false };
}

function sessionEntryToMessage(entry: SessionEntry): AgentMessage | undefined {
	const timestamp = Date.parse(entry.timestamp);
	const numericTimestamp = Number.isFinite(timestamp) ? timestamp : Date.now();
	if (entry.type === "message") {
		return entry.message;
	}
	if (entry.type === "custom_message") {
		return {
			role: "custom",
			customType: entry.customType,
			content: entry.content,
			display: entry.display,
			details: entry.details,
			timestamp: numericTimestamp,
		} as AgentMessage;
	}
	if (entry.type === "compaction") {
		return {
			role: "compactionSummary",
			summary: entry.summary,
			tokensBefore: entry.tokensBefore,
			timestamp: numericTimestamp,
		} as AgentMessage;
	}
	if (entry.type === "branch_summary") {
		return {
			role: "branchSummary",
			summary: entry.summary,
			fromId: entry.fromId,
			timestamp: numericTimestamp,
		} as AgentMessage;
	}
	return undefined;
}

function createOmittedAdviceMarker(message: AgentMessage): AgentMessage | undefined {
	if (message.role !== "custom") {
		return undefined;
	}
	const details = message.details as Partial<AdvisorAdviceDetails> | undefined;
	const kind = details?.advisorAdviceKind ?? "hint";
	const deliverAs = details?.deliverAs ?? "steer";
	return {
		role: "custom",
		customType: ADVISOR_OMITTED_CUSTOM_TYPE,
		content: `[advisor ${kind} omitted: deliverAs=${deliverAs}]`,
		display: false,
		details: {
			origin: "advisor",
			omitted: true,
			advisorAdviceKind: kind,
			deliverAs,
		},
		timestamp: message.timestamp,
	} as AgentMessage;
}
