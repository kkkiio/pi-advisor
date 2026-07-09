import type { AgentSessionEvent, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AssistantMessage, UserMessage } from "@earendil-works/pi-ai";
import type { PullTranscriptDetails } from "./types";

export type AdvisorTranscriptEntry =
	| { id: number; turnId: number; type: "turn-boundary"; phase: "start" | "end" }
	| { id: number; turnId: number; type: "user-message"; text: string }
	| { id: number; turnId: number; type: "context-summary"; text: string }
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

export function appendPrimaryContextSummary(state: AdvisorTranscriptState, details: PullTranscriptDetails): void {
	const turnId = ensureTranscriptTurn(state);
	appendTranscriptEntry(state, {
		turnId,
		type: "context-summary",
		text: `primary transcript [${details.start}, ${details.end}) total=${details.total} state=${details.primaryAgentLoopState} wait=${details.waitResult}${
			details.omittedAdvisorAdviceCount > 0 ? ` omitted_advice=${details.omittedAdvisorAdviceCount}` : ""
		}${details.sinceIndexOutOfBounds ? " since_out_of_bounds=true" : ""}`,
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
	const promptBadge = buildTranscriptBadge(theme, "Prompt", "userMessageBg", "accent");
	const contextBadge = buildTranscriptBadge(theme, "Context", "customMessageBg", "accent");
	const toolBadge = buildTranscriptBadge(theme, "Tool", "toolPendingBg", "warning");
	const advisorBadge = buildTranscriptBadge(theme, "Advisor", "customMessageBg", "success");
	const errorBadge = buildTranscriptBadge(theme, "Error", "customMessageBg", "error");
	const blockIndent = "    ";

	const pushBlankLine = () => {
		if (lines.length > 0 && lines[lines.length - 1] !== "") {
			lines.push("");
		}
	};

	const pushInlineBlock = (
		header: string,
		text: string,
		options: { blankBefore?: boolean; style?: (value: string) => string } = {},
	) => {
		const bodyLines = text.split("\n");
		const style = options.style ?? ((value: string) => value);
		if (options.blankBefore !== false) {
			pushBlankLine();
		}

		const firstLine = bodyLines.shift() ?? "";
		lines.push(`${header}${firstLine ? ` ${style(firstLine)}` : ""}`);
		for (const line of bodyLines) {
			lines.push(`${blockIndent}${style(line)}`);
		}
	};

	const pushStackedBlock = (
		header: string,
		text: string,
		options: { blankBefore?: boolean; style?: (value: string) => string } = {},
	) => {
		const bodyLines = text.split("\n");
		const style = options.style ?? ((value: string) => value);
		if (options.blankBefore !== false) {
			pushBlankLine();
		}

		lines.push(header);
		for (const line of bodyLines) {
			lines.push(`${blockIndent}${style(line)}`);
		}
	};

	for (const entry of entries) {
		if (entry.type === "turn-boundary") {
			continue;
		}
		if (entry.type === "user-message") {
			pushInlineBlock(promptBadge, entry.text, { blankBefore: false });
			continue;
		}
		if (entry.type === "context-summary") {
			pushInlineBlock(contextBadge, entry.text, { style: (line) => theme.fg("dim", line) });
			continue;
		}
		if (entry.type === "assistant-text") {
			pushStackedBlock(entry.streaming ? `${advisorBadge} ${theme.fg("warning", "▍")}` : advisorBadge, entry.text);
			continue;
		}
		if (entry.type === "tool-call") {
			const result = entries.find(
				(candidate) => candidate.type === "tool-result" && candidate.toolCallId === entry.toolCallId,
			);
			const summary = formatToolSummary(entry, result);
			pushInlineBlock(toolBadge, theme.fg("warning", theme.bold(summary.call)));
			if (summary.result) {
				const arrow = summary.isError ? theme.fg("error", "↳ error") : theme.fg("dim", "↳");
				const resultStyle = summary.isError
					? (line: string) => theme.fg("error", line)
					: (line: string) => theme.fg("dim", line);
				pushInlineBlock(arrow, summary.result, { blankBefore: false, style: resultStyle });
			}
			continue;
		}
		if (entry.type === "notice" && entry.level === "error") {
			pushInlineBlock(errorBadge, entry.text);
			continue;
		}
	}
	return lines.length > 0 ? lines : [theme.fg("dim", "No Advisor chat yet.")];
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

function formatToolSummary(
	call: Extract<AdvisorTranscriptEntry, { type: "tool-call" }>,
	result: AdvisorTranscriptEntry | undefined,
): { call: string; result?: string; isError: boolean } {
	if (call.toolName === "pull_transcript") {
		let since = "";
		let count = "";
		let timeout = "";
		let pulled =
			result?.type === "tool-result" ? (result.streaming ? "running" : result.isError ? "error" : "ok") : "running";
		try {
			const args = JSON.parse(call.args) as { since_index?: unknown; count?: unknown; timeout_ms?: unknown };
			if (typeof args.since_index === "number") {
				since = ` since=${args.since_index}`;
			}
			if (typeof args.count === "number") {
				count = ` count=${args.count}`;
			}
			if (typeof args.timeout_ms === "number") {
				timeout = ` wait=${args.timeout_ms}ms`;
			}
		} catch {
			// Keep the summary readable even when Pi changes argument formatting.
		}
		if (result?.type === "tool-result") {
			const match = result.content.match(/\[(\d+),\s*(\d+)\).*?wait_result=([a-z_]+).*?waited_ms=(\d+).*?total=(\d+)/);
			pulled = match ? `[${match[1]}, ${match[2]}) total=${match[5]} ${match[3]}` : pulled;
		}
		return {
			call: `pull_transcript${since || " since=0"}${count}${timeout}`,
			result: pulled,
			isError: result?.type === "tool-result" ? result.isError : false,
		};
	}
	if (call.toolName === "advise") {
		try {
			const args = JSON.parse(call.args) as { kind?: unknown; advice?: unknown };
			const kind = typeof args.kind === "string" ? args.kind : "advice";
			const delivered =
				result?.type === "tool-result" ? result.content.match(/delivered \w+ as (\w+)/)?.[1] : undefined;
			const advice = typeof args.advice === "string" ? oneLine(args.advice, 160) : "";
			return {
				call: `advise ${kind}`,
				result: delivered
					? `${delivered}${advice ? `: ${advice}` : ""}`
					: result?.type === "tool-result"
						? "ok"
						: "running",
				isError: result?.type === "tool-result" ? result.isError : false,
			};
		} catch {
			return {
				call: "advise",
				result: result?.type === "tool-result" ? (result.isError ? "error" : "ok") : "running",
				isError: result?.type === "tool-result" ? result.isError : false,
			};
		}
	}
	if (result?.type === "tool-result") {
		return {
			call: `${call.toolName}${call.args ? ` ${call.args}` : ""}`,
			result: result.isError ? "error" : result.streaming ? "running" : "ok",
			isError: result.isError,
		};
	}
	return { call: `${call.toolName}${call.args ? ` ${call.args}` : ""}`, result: "running", isError: false };
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
