import type { AgentSessionEvent, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AssistantMessage, UserMessage } from "@earendil-works/pi-ai";

export type AdvisorTranscriptEntry =
	| { id: number; turnId: number; type: "turn-boundary"; phase: "start" | "end" }
	| { id: number; turnId: number; type: "user-message"; text: string }
	| { id: number; turnId: number; type: "thinking"; text: string; streaming: boolean }
	| { id: number; turnId: number; type: "assistant-text"; text: string; streaming: boolean }
	| { id: number; turnId: number; type: "tool-call"; toolCallId: string; toolName: string; args: string }
	| {
			id: number;
			turnId: number;
			type: "tool-result";
			toolCallId: string;
			toolName: string;
			content: string;
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
	if (event.type === "message_start" && event.message.role === "user") {
		const turnId = ensureTranscriptTurnForUserMessage(state);
		upsertUserMessageEntry(state, turnId, extractMessageText(event.message));
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
			upsertToolResultEntry(state, event.message.toolCallId, event.message.toolName, event.message, false);
		}
	}
	if (event.type === "tool_execution_start") {
		ensureToolCallEntry(state, event.toolCallId, event.toolName, event.args ?? {});
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
): string[] {
	const lines: string[] = [];
	for (const entry of entries) {
		if (entry.type === "turn-boundary") {
			if (entry.phase === "start") {
				lines.push(theme.fg("dim", `turn ${entry.turnId}`));
			}
			continue;
		}
		if (entry.type === "user-message") {
			lines.push(`${buildTranscriptBadge(theme, "task", "userMessageBg", "accent")} ${entry.text}`);
			continue;
		}
		if (entry.type === "thinking") {
			lines.push(`${buildTranscriptBadge(theme, "thinking", "customMessageBg", "accent")} ${entry.text}`);
			continue;
		}
		if (entry.type === "assistant-text") {
			lines.push(`${buildTranscriptBadge(theme, "advisor", "customMessageBg", "success")} ${entry.text}`);
			continue;
		}
		if (entry.type === "tool-call") {
			lines.push(`${buildTranscriptBadge(theme, "tool", "toolPendingBg", "warning")} ${entry.toolName}(${entry.args})`);
			continue;
		}
		if (entry.type === "tool-result") {
			const label = entry.isError ? "tool error" : entry.streaming ? "tool..." : "tool ok";
			const color = entry.isError ? "error" : entry.streaming ? "warning" : "success";
			lines.push(`${buildTranscriptBadge(theme, label, "toolPendingBg", color)} ${entry.toolName}: ${entry.content}`);
			continue;
		}
		const badge =
			entry.level === "error"
				? buildTranscriptBadge(theme, "error", "toolPendingBg", "error")
				: entry.level === "advice"
					? buildTranscriptBadge(theme, "advice", "toolPendingBg", "warning")
					: buildTranscriptBadge(theme, "status", "customMessageBg", "accent");
		lines.push(`${badge} ${entry.text}`);
	}
	return lines.length > 0 ? lines : [theme.fg("dim", "Advisor has not produced transcript entries yet.")];
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

function ensureTranscriptTurnForUserMessage(state: AdvisorTranscriptState): number {
	if (state.currentTurnId !== null) {
		return state.currentTurnId;
	}
	if (state.lastTurnId !== null) {
		const latestUser = findLatestTranscriptEntry(state, state.lastTurnId, "user-message");
		if (!latestUser) {
			return state.lastTurnId;
		}
	}
	return ensureTranscriptTurn(state);
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

function upsertUserMessageEntry(state: AdvisorTranscriptState, turnId: number, text: string): void {
	const existing = findLatestTranscriptEntry(state, turnId, "user-message");
	if (existing) {
		existing.text = text;
		return;
	}
	appendTranscriptEntry(state, { turnId, type: "user-message", text });
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

function ensureToolCallEntry(state: AdvisorTranscriptState, toolCallId: string, toolName: string, args: unknown): void {
	const tracked = state.toolCalls.get(toolCallId);
	if (tracked) {
		const existing = state.entries.find((entry) => entry.id === tracked.callEntryId && entry.type === "tool-call");
		if (existing?.type === "tool-call") {
			existing.toolName = toolName;
			existing.args = formatToolPreview(args);
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

function summarizeToolResult(value: unknown, maxLength = 400): { content: string; truncated: boolean } {
	let text = "";
	if (typeof value === "string") {
		text = value;
	} else if (value && typeof value === "object") {
		const maybeContent = (value as { content?: unknown }).content;
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
	return flat.length > maxLength
		? { content: `${flat.slice(0, maxLength - 1)}…`, truncated: true }
		: { content: flat || "(empty)", truncated: false };
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

function buildTranscriptBadge(
	theme: ExtensionContext["ui"]["theme"],
	label: string,
	background: "userMessageBg" | "toolPendingBg" | "customMessageBg",
	foreground: "accent" | "warning" | "success" | "error",
): string {
	return theme.bg(background, theme.fg(foreground, theme.bold(` ${label} `)));
}

function oneLine(text: string, max: number): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
