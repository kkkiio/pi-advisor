import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ImageContent, TextContent, ToolCall } from "@earendil-works/pi-ai";
import type { ExtensionContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import { ADVISOR_ADVICE_CUSTOM_TYPE, ADVISOR_OMITTED_CUSTOM_TYPE } from "./types";
import type {
	AdvisorAdviceDetails,
	PrimaryAgentLoopState,
	PrimaryTranscriptView,
	PullTranscriptDetails,
	PullTranscriptRequest,
	PullWaitResult,
} from "./types";
import { formatSessionHistoryMarkdown } from "./session-history-format";

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

export function buildPrimaryTranscriptView(ctx: Pick<ExtensionContext, "sessionManager">): PrimaryTranscriptView {
	const branch = ctx.sessionManager.getBranch();
	const rawMessages = branch.flatMap((entry) => {
		const message = sessionEntryToMessage(entry);
		return message ? [message] : [];
	});
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
		messages.push(redactMessage(message));
	}
	return {
		messages,
		rawMessageCount: rawMessages.length,
		viewMessageCount: messages.length,
		omittedAdvisorAdviceCount,
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
	const body = messages.length
		? formatSessionHistoryMarkdown(messages, {
				watchedRoles: true,
				includeToolIntent: true,
				expandPrimaryContext: true,
				expandEditDiffs: true,
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
	};
	const flags = [
		`[${start}, ${end})`,
		`primary_agent_loop_state=${state}`,
		`wait_result=${waitResult}`,
		`waited_ms=${waitedMs}`,
		`total=${view.messages.length}`,
	];
	if (normalized.outOfBounds) {
		flags.push("since_index_out_of_bounds=true");
	}
	if (view.omittedAdvisorAdviceCount > 0) {
		flags.push(`omitted_advisor_advice=${view.omittedAdvisorAdviceCount}`);
	}
	return {
		text: `${flags.join(" ")}\n\n${body}\n`,
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

function redactMessage<T extends AgentMessage>(message: T): T {
	const cloned = structuredClone(message) as AgentMessage;
	if (cloned.role === "user") {
		cloned.content = redactContent(cloned.content);
	} else if (cloned.role === "assistant") {
		cloned.content = cloned.content.map((block) => {
			if (block.type === "text") {
				return { ...block, text: redactText(block.text) };
			}
			if (block.type === "thinking") {
				return { ...block, thinking: redactText(block.thinking) };
			}
			return { ...block, arguments: redactUnknown(block.arguments) as ToolCall["arguments"] };
		});
	} else if (cloned.role === "toolResult") {
		cloned.content = cloned.content.map((part) =>
			part.type === "text" ? { ...part, text: redactText(part.text) } : part,
		);
		cloned.details = redactUnknown(cloned.details);
	} else if (cloned.role === "custom") {
		cloned.content = redactContent(cloned.content);
		cloned.details = redactUnknown(cloned.details);
	} else if (cloned.role === "bashExecution") {
		cloned.command = redactText(cloned.command);
		cloned.output = redactText(cloned.output);
	} else if (cloned.role === "pythonExecution") {
		cloned.code = redactText(cloned.code);
		cloned.output = redactText(cloned.output);
	}
	return cloned as T;
}

function redactContent(content: string | (TextContent | ImageContent)[]): string | (TextContent | ImageContent)[] {
	if (typeof content === "string") {
		return redactText(content);
	}
	return content.map((part) => (part.type === "text" ? { ...part, text: redactText(part.text) } : part));
}

function redactUnknown(value: unknown): unknown {
	if (typeof value === "string") {
		return redactText(value);
	}
	if (Array.isArray(value)) {
		return value.map((item) => redactUnknown(item));
	}
	if (value && typeof value === "object") {
		const entries = Object.entries(value).map(([key, nested]) => [key, redactUnknown(nested)]);
		return Object.fromEntries(entries);
	}
	return value;
}

function redactText(text: string): string {
	return text
		.replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[REDACTED_OPENAI_KEY]")
		.replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, "[REDACTED_GITHUB_TOKEN]")
		.replace(/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, "[REDACTED_GITHUB_TOKEN]")
		.replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED_AWS_KEY]")
		.replace(/((?:api[_-]?key|token|secret|password)\s*[:=]\s*)(["']?)[^\s"',;]+/gi, "$1$2[REDACTED]");
}
