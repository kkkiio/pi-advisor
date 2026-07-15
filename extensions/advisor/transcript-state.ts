import type { AgentSessionEvent, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AssistantMessage, UserMessage } from "@earendil-works/pi-ai";
import { Box, type Component, Container, Spacer, Text } from "@earendil-works/pi-tui";
import { PULL_ELAPSED_VISIBLE_MS } from "./constants";
import type { AskContextPayload, PullTranscriptDetails, PullTranscriptDisplayItem } from "./types";

const PRIMARY_TRANSCRIPT_PREVIEW_LINES = 5;

export type AdvisorTranscriptEntry =
	| { id: number; turnId: number; type: "turn-boundary"; phase: "start" | "end" }
	| { id: number; turnId: number; type: "user-message"; text: string }
	| {
			id: number;
			turnId: number;
			type: "ask-context";
			userText: string | null;
			assistantTexts: string[];
			content: string;
	  }
	| { id: number; turnId: number; type: "thinking"; text: string; streaming: boolean }
	| { id: number; turnId: number; type: "assistant-text"; text: string; streaming: boolean }
	| {
			id: number;
			turnId: number;
			type: "tool-call";
			toolCallId: string;
			toolName: string;
			args: string;
			rawArgs: unknown;
			startedAt: number | null;
	  }
	| {
			id: number;
			turnId: number;
			type: "tool-result";
			toolCallId: string;
			toolName: string;
			content: string;
			rawContent?: string;
			lineCount: number;
			details: unknown;
			truncated: boolean;
			isError: boolean;
			streaming: boolean;
	  }
	| { id: number; turnId: number; type: "notice"; level: "status" | "advice" | "error"; text: string };

export type AdvisorTranscript = AdvisorTranscriptEntry[];
type AdvisorTranscriptEntryInput = AdvisorTranscriptEntry extends infer Entry
	? Entry extends { id: number }
		? Omit<Entry, "id">
		: never
	: never;

export type AdvisorTranscriptState = {
	entries: AdvisorTranscript;
	nextEntryId: number;
	nextTurnId: number;
	currentTurnId: number | null;
	lastTurnId: number | null;
	toolCalls: Map<string, { turnId: number; callEntryId: number; resultEntryId?: number }>;
};

export function createEmptyTranscriptState(): AdvisorTranscriptState {
	return {
		entries: [],
		nextEntryId: 1,
		nextTurnId: 1,
		currentTurnId: null,
		lastTurnId: null,
		toolCalls: new Map(),
	};
}

export function appendTranscriptNotice(
	state: AdvisorTranscriptState,
	level: "status" | "advice" | "error",
	text: string,
): void {
	const turnId = ensureTranscriptTurn(state);
	appendTranscriptEntry(state, { turnId, type: "notice", level, text });
}

export function appendAskContext(state: AdvisorTranscriptState, payload: AskContextPayload): void {
	const turnId = ensureTranscriptTurn(state);
	appendTranscriptEntry(state, {
		turnId,
		type: "ask-context",
		userText: payload.askContext?.userText ?? null,
		assistantTexts: [...(payload.askContext?.assistantTexts ?? [])],
		content: payload.text,
	});
}

export function applyTranscriptEvent(state: AdvisorTranscriptState, event: AgentSessionEvent): void {
	if (event.type === "turn_start") {
		ensureTranscriptTurn(state);
		return;
	}
	if (event.type === "turn_end") {
		applyAssistantMessageToTranscript(state, event.message);
		finishTranscriptTurn(state, state.currentTurnId);
		return;
	}
	if (event.type === "message_update" && event.message.role === "assistant") {
		applyAssistantMessageToTranscript(state, event.message);
		return;
	}
	if (event.type === "message_end") {
		if (event.message.role === "assistant") {
			applyAssistantMessageToTranscript(state, event.message);
			return;
		}
		if (event.message.role === "toolResult") {
			upsertToolResultEntry(
				state,
				event.message.toolCallId,
				event.message.toolName,
				event.message,
				false,
				event.message.isError,
			);
		}
	}
	if (event.type === "tool_execution_start") {
		ensureToolCallEntry(state, event.toolCallId, event.toolName, event.args ?? {}, Date.now());
		return;
	}
	if (event.type === "tool_execution_update") {
		upsertToolResultEntry(state, event.toolCallId, event.toolName, event.partialResult, true);
		return;
	}
	if (event.type === "tool_execution_end") {
		upsertToolResultEntry(state, event.toolCallId, event.toolName, event.result, false, event.isError);
	}
}

export function hasStreamingTranscriptEntry(entries: AdvisorTranscript): boolean {
	return entries.some((entry) => "streaming" in entry && entry.streaming);
}

export function getCompletedExchangeCount(entries: AdvisorTranscript): number {
	const turns = new Set<number>();
	for (const entry of entries) {
		if (entry.type === "assistant-text" && !entry.streaming && entry.text.trim()) {
			turns.add(entry.turnId);
		}
	}
	return turns.size;
}

export function buildAdvisorOverlayTranscript(
	entries: AdvisorTranscript,
	theme: ExtensionContext["ui"]["theme"],
	primaryContextExpanded = false,
	expandKeyText: string | null = "ctrl+o",
): Component {
	const transcript = new Container();
	let hasVisibleContent = false;
	for (const entry of entries) {
		if (entry.type === "turn-boundary") {
			continue;
		}
		if (entry.type === "user-message") {
			if (hasVisibleContent) {
				transcript.addChild(new Spacer(1));
			}
			const box = new Box(1, 1, (text) => theme.bg("userMessageBg", text));
			box.addChild(new Text(theme.fg("userMessageText", entry.text), 0, 0));
			transcript.addChild(box);
			hasVisibleContent = true;
			continue;
		}
		if (entry.type === "ask-context") {
			if (hasVisibleContent) {
				transcript.addChild(new Spacer(1));
			}
			const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));
			const messageCount = entry.userText === null ? 0 : 1 + entry.assistantTexts.length;
			box.addChild(
				new Text(
					`${theme.fg("customMessageLabel", theme.bold("Context"))} ${theme.fg(
						"customMessageText",
						`· ${messageCount} ${messageCount === 1 ? "msg" : "msgs"}`,
					)}`,
					0,
					0,
				),
			);
			if (primaryContextExpanded) {
				box.addChild(new Text(theme.fg("text", entry.content), 0, 0));
			} else if (entry.userText !== null) {
				const items: PullTranscriptDisplayItem[] = [
					{ kind: "user", text: entry.userText },
					...entry.assistantTexts.map((text) => ({ kind: "agent" as const, text })),
				];
				box.addChild(new PrimaryTranscriptPreview(items, theme, "context", expandKeyText));
			}
			transcript.addChild(box);
			hasVisibleContent = true;
			continue;
		}
		if (entry.type === "thinking") {
			if (hasVisibleContent) {
				transcript.addChild(new Spacer(1));
			}
			transcript.addChild(new Text(theme.italic(theme.fg("thinkingText", entry.text)), 1, 0));
			hasVisibleContent = true;
			continue;
		}
		if (entry.type === "assistant-text") {
			if (hasVisibleContent) {
				transcript.addChild(new Spacer(1));
			}
			transcript.addChild(new Text(theme.fg("text", entry.text), 1, 0));
			hasVisibleContent = true;
			continue;
		}
		if (entry.type === "tool-call") {
			if (hasVisibleContent) {
				transcript.addChild(new Spacer(1));
			}
			const result = entries.find(
				(candidate) => candidate.type === "tool-result" && candidate.toolCallId === entry.toolCallId,
			);
			const summary = formatToolSummary(entry, result);
			const background =
				summary.status === "pending"
					? "toolPendingBg"
					: summary.status === "error" || summary.kind === "advice"
						? "toolErrorBg"
						: "toolSuccessBg";
			const box = new Box(1, 1, (text) => theme.bg(background, text));
			const titleColor = summary.kind === "advice" ? "text" : "toolTitle";
			const outputColor = summary.kind === "advice" ? "text" : "toolOutput";
			box.addChild(
				new Text(
					`${theme.fg(titleColor, theme.bold(summary.title))}${
						summary.output ? ` ${theme.fg(outputColor, summary.output)}` : ""
					}`,
					0,
					0,
				),
			);
			if (summary.kind === "pull" && primaryContextExpanded && summary.content !== undefined) {
				box.addChild(new Text(theme.fg("text", summary.content), 0, 0));
			} else if (summary.kind === "pull" && summary.items) {
				box.addChild(new PrimaryTranscriptPreview(summary.items, theme, "pull", expandKeyText));
			}
			transcript.addChild(box);
			hasVisibleContent = true;
			continue;
		}
		if (entry.type === "notice" && entry.level === "error") {
			if (hasVisibleContent) {
				transcript.addChild(new Spacer(1));
			}
			const box = new Box(1, 1, (text) => theme.bg("toolErrorBg", text));
			box.addChild(
				new Text(`${theme.fg("toolTitle", theme.bold("Error"))} ${theme.fg("toolOutput", entry.text)}`, 0, 0),
			);
			transcript.addChild(box);
			hasVisibleContent = true;
			continue;
		}
	}
	if (!hasVisibleContent) {
		transcript.addChild(new Text(theme.fg("dim", "No Advisor chat yet."), 1, 0));
	}
	return transcript;
}

class PrimaryTranscriptPreview implements Component {
	private cachedWidth: number | undefined;
	private cachedLines: string[] | undefined;

	constructor(
		private readonly items: PullTranscriptDisplayItem[],
		private readonly theme: ExtensionContext["ui"]["theme"],
		private readonly variant: "context" | "pull",
		private readonly expandKeyText: string | null,
	) {}

	render(width: number): string[] {
		if (this.cachedLines !== undefined && this.cachedWidth === width) {
			return this.cachedLines;
		}
		const styledText = this.items
			.map((item) => {
				if (this.variant === "pull" && item.kind === "tool") {
					const match = item.text.match(/^(→\s+[^\s(]+)([\s\S]*)$/);
					const title = match?.[1] ?? "→";
					const output = match?.[2] ?? item.text;
					return `${this.theme.fg("toolTitle", title)}${this.theme.fg("toolOutput", output)}`;
				}
				return `${this.theme.fg("dim", `${item.kind}:`)} ${this.theme.fg("text", item.text)}`;
			})
			.join("\n");
		const visualLines = new Text(styledText, 0, 0).render(width);
		const hiddenLineCount = Math.max(0, visualLines.length - PRIMARY_TRANSCRIPT_PREVIEW_LINES);
		const visibleLines = visualLines.slice(0, PRIMARY_TRANSCRIPT_PREVIEW_LINES);
		if (hiddenLineCount > 0) {
			const hint = this.expandKeyText
				? `... (${hiddenLineCount} more lines, ${this.expandKeyText} to expand)`
				: `... (${hiddenLineCount} more lines)`;
			visibleLines.push(this.theme.italic(this.theme.fg("dim", hint)));
		}
		this.cachedWidth = width;
		this.cachedLines = visibleLines;
		return visibleLines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}
}

function appendTranscriptEntry(
	state: AdvisorTranscriptState,
	entry: AdvisorTranscriptEntryInput,
): AdvisorTranscriptEntry {
	const fullEntry = { ...entry, id: state.nextEntryId++ } as AdvisorTranscriptEntry;
	state.entries.push(fullEntry);
	return fullEntry;
}

function ensureTranscriptTurn(state: AdvisorTranscriptState): number {
	if (state.currentTurnId !== null) {
		return state.currentTurnId;
	}
	const turnId = state.nextTurnId++;
	state.currentTurnId = turnId;
	state.lastTurnId = turnId;
	appendTranscriptEntry(state, { turnId, type: "turn-boundary", phase: "start" });
	return turnId;
}

function finishTranscriptTurn(state: AdvisorTranscriptState, turnId?: number | null): void {
	const resolvedTurnId = turnId ?? state.currentTurnId;
	if (resolvedTurnId === null) {
		return;
	}
	for (const entry of state.entries) {
		if (entry.turnId === resolvedTurnId && "streaming" in entry) {
			entry.streaming = false;
		}
	}
	if (
		!state.entries.some(
			(entry) => entry.type === "turn-boundary" && entry.turnId === resolvedTurnId && entry.phase === "end",
		)
	) {
		appendTranscriptEntry(state, { turnId: resolvedTurnId, type: "turn-boundary", phase: "end" });
	}
	state.currentTurnId = null;
	state.lastTurnId = resolvedTurnId;
}

function findLatestTranscriptEntry<TType extends AdvisorTranscriptEntry["type"]>(
	state: AdvisorTranscriptState,
	turnId: number,
	type: TType,
): Extract<AdvisorTranscriptEntry, { type: TType }> | undefined {
	for (let index = state.entries.length - 1; index >= 0; index--) {
		const entry = state.entries[index];
		if (entry.turnId === turnId && entry.type === type) {
			return entry as Extract<AdvisorTranscriptEntry, { type: TType }>;
		}
	}
	return undefined;
}

function extractMessageText(message: {
	content?: string | AssistantMessage["content"] | UserMessage["content"];
}): string {
	const content = message.content;
	if (typeof content === "string") {
		return content;
	}
	if (!Array.isArray(content)) {
		return "";
	}
	return content
		.map((part) => {
			if (part.type === "text") return part.text ?? "";
			if (part.type === "thinking") return part.thinking ?? "";
			if (part.type === "toolCall") return `${part.name}(${formatToolPreview(part.arguments)})`;
			return "[image]";
		})
		.filter(Boolean)
		.join("\n");
}

function upsertTranscriptTextEntry(
	state: AdvisorTranscriptState,
	turnId: number,
	type: "thinking" | "assistant-text",
	text: string,
	streaming: boolean,
): void {
	const existing = findLatestTranscriptEntry(state, turnId, type);
	if (existing) {
		existing.text = text;
		existing.streaming = streaming;
		return;
	}
	appendTranscriptEntry(state, { turnId, type, text, streaming });
}

function ensureToolCallEntry(
	state: AdvisorTranscriptState,
	toolCallId: string,
	toolName: string,
	args: unknown,
	startedAt?: number,
): void {
	const tracked = state.toolCalls.get(toolCallId);
	if (tracked) {
		const existing = state.entries.find((entry) => entry.id === tracked.callEntryId && entry.type === "tool-call");
		if (existing?.type === "tool-call") {
			existing.toolName = toolName;
			existing.args = formatToolPreview(args);
			existing.rawArgs = args;
			if (startedAt !== undefined) {
				existing.startedAt = startedAt;
			}
		}
		return;
	}
	const turnId = ensureTranscriptTurn(state);
	const entry = appendTranscriptEntry(state, {
		turnId,
		type: "tool-call",
		toolCallId,
		toolName,
		args: formatToolPreview(args),
		rawArgs: args,
		startedAt: startedAt ?? null,
	});
	state.toolCalls.set(toolCallId, { turnId, callEntryId: entry.id });
}

function upsertToolResultEntry(
	state: AdvisorTranscriptState,
	toolCallId: string,
	toolName: string,
	value: unknown,
	streaming: boolean,
	isError = false,
): void {
	const tracked = state.toolCalls.get(toolCallId);
	const turnId = tracked?.turnId ?? ensureTranscriptTurn(state);
	const summary = summarizeToolResult(value);
	if (tracked?.resultEntryId) {
		const existing = state.entries.find((entry) => entry.id === tracked.resultEntryId && entry.type === "tool-result");
		if (existing?.type === "tool-result") {
			existing.content = summary.content;
			existing.rawContent = toolName === "pull_transcript" ? summary.rawContent : undefined;
			existing.lineCount = summary.lineCount;
			existing.details = summary.details;
			existing.truncated = summary.truncated;
			existing.streaming = streaming;
			existing.isError = isError;
			existing.toolName = toolName;
			return;
		}
	}
	const entry = appendTranscriptEntry(state, {
		turnId,
		type: "tool-result",
		toolCallId,
		toolName,
		content: summary.content,
		...(toolName === "pull_transcript" ? { rawContent: summary.rawContent } : {}),
		lineCount: summary.lineCount,
		details: summary.details,
		truncated: summary.truncated,
		isError,
		streaming,
	});
	state.toolCalls.set(toolCallId, {
		turnId,
		callEntryId: tracked?.callEntryId ?? entry.id,
		resultEntryId: entry.id,
	});
}

function applyAssistantMessageToTranscript(state: AdvisorTranscriptState, message: unknown): void {
	if (!message || typeof message !== "object" || (message as { role?: string }).role !== "assistant") {
		return;
	}
	const assistant = message as AssistantMessage;
	const turnId = state.currentTurnId ?? state.lastTurnId ?? ensureTranscriptTurn(state);
	const thinking = extractMessageText({ content: assistant.content.filter((part) => part.type === "thinking") });
	const text = extractMessageText({ content: assistant.content.filter((part) => part.type === "text") });
	if (thinking) {
		upsertTranscriptTextEntry(state, turnId, "thinking", thinking, assistant.stopReason === "toolUse");
	}
	if (text) {
		upsertTranscriptTextEntry(state, turnId, "assistant-text", text, assistant.stopReason === "toolUse");
	}
	for (const part of assistant.content) {
		if (part.type === "toolCall") {
			ensureToolCallEntry(state, part.id, part.name, part.arguments);
		}
	}
}

function summarizeToolResult(
	value: unknown,
	maxLength = 400,
): { content: string; rawContent: string; lineCount: number; details: unknown; truncated: boolean } {
	let text = "";
	let details: unknown;
	if (typeof value === "string") {
		text = value;
	} else if (value && typeof value === "object") {
		const result = value as { content?: unknown; details?: unknown };
		const maybeContent = result.content;
		details = result.details;
		if (Array.isArray(maybeContent)) {
			text = maybeContent
				.map((part) => {
					if (part && typeof part === "object" && (part as { type?: string }).type === "text") {
						return String((part as { text?: unknown }).text ?? "");
					}
					return "";
				})
				.filter(Boolean)
				.join("\n");
		} else if (typeof maybeContent === "string") {
			text = maybeContent;
		} else {
			try {
				text = JSON.stringify(value);
			} catch {
				text = String(value);
			}
		}
	} else {
		text = String(value ?? "");
	}
	const flat = text.replace(/\s+/g, " ").trim();
	const lineCount = text ? text.split("\n").length : 0;
	if (flat.length > maxLength) {
		return {
			content: `${flat.slice(0, maxLength - 1)}…`,
			rawContent: text,
			lineCount,
			details,
			truncated: true,
		};
	}
	return { content: flat || "(empty)", rawContent: text, lineCount, details, truncated: false };
}

function formatToolPreview(value: unknown): string {
	if (value === undefined || value === null) {
		return "";
	}
	if (typeof value === "string") {
		return oneLine(value, 120);
	}
	try {
		return oneLine(JSON.stringify(value), 120);
	} catch {
		return String(value);
	}
}

function formatToolSummary(
	call: Extract<AdvisorTranscriptEntry, { type: "tool-call" }>,
	result: AdvisorTranscriptEntry | undefined,
): {
	kind: "pull" | "advice" | "tool";
	title: string;
	output: string;
	status: "pending" | "success" | "error";
	items?: PullTranscriptDisplayItem[];
	content?: string;
} {
	const toolResult = result?.type === "tool-result" ? result : undefined;
	if (call.toolName === "pull_transcript") {
		if (!toolResult || toolResult.streaming) {
			const elapsedMs = call.startedAt === null ? 0 : Math.max(0, Date.now() - call.startedAt);
			return {
				kind: "pull",
				title: "Pulling…",
				output:
					call.startedAt !== null && elapsedMs >= PULL_ELAPSED_VISIBLE_MS ? `${Math.floor(elapsedMs / 1_000)}s` : "",
				status: "pending",
			};
		}
		if (toolResult.isError) {
			return {
				kind: "pull",
				title: "Pull",
				output: `error · ${oneLine(toolResult.content, 160)}`,
				status: "error",
			};
		}
		const details = toolResult.details as Partial<PullTranscriptDetails> | undefined;
		const start = typeof details?.start === "number" ? details.start : 0;
		const end = typeof details?.end === "number" ? details.end : start;
		const waitedMs = typeof details?.waitedMs === "number" ? details.waitedMs : 0;
		const items = Array.isArray(details?.displayItems) ? details.displayItems : [];
		return {
			kind: "pull",
			title: "Pull",
			output: `[${start}, ${end}) → ${items.length} ${items.length === 1 ? "msg" : "msgs"} · ${(
				waitedMs / 1_000
			).toFixed(1)}s`,
			status: "success",
			items,
			content: toolResult.rawContent ?? "",
		};
	}
	if (call.toolName === "advise") {
		const args =
			call.rawArgs && typeof call.rawArgs === "object"
				? (call.rawArgs as { kind?: unknown; advice?: unknown })
				: undefined;
		const label = args?.kind === "hint" ? "Hint" : args?.kind === "concern" ? "Concern" : "Advise";
		const advice = typeof args?.advice === "string" ? oneLine(args.advice, 160) : "delivery failed";
		const status = !toolResult || toolResult.streaming ? "pending" : toolResult.isError ? "error" : "success";
		const suffix = status === "pending" ? " ⇒ pending" : status === "error" ? " ⇒ error" : "";
		return { kind: "advice", title: `${label}:`, output: `${advice}${suffix}`, status };
	}
	const args = call.args ? `${call.args} ` : "";
	if (!toolResult || toolResult.streaming) {
		return { kind: "tool", title: call.toolName, output: `${args}⇒ pending`, status: "pending" };
	}
	const count = `${toolResult.lineCount} ${toolResult.lineCount === 1 ? "line" : "lines"}`;
	if (toolResult.isError) {
		const error = oneLine(toolResult.content, 160);
		return {
			kind: "tool",
			title: call.toolName,
			output: `${args}⇒ error · ${count}${error ? ` — ${error}` : ""}`,
			status: "error",
		};
	}
	return { kind: "tool", title: call.toolName, output: `${args}⇒ ok · ${count}`, status: "success" };
}

function oneLine(text: string, max: number): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
