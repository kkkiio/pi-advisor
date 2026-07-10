import type { AgentSessionEvent, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Component, OverlayHandle, TUI } from "@earendil-works/pi-tui";
import { Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { AdviceDeliveryResult, AdvisorContextUsage, AskContext, WatchRunState } from "./types";
import {
	appendAskContext,
	appendTranscriptNotice,
	applyTranscriptEvent,
	buildAdvisorOverlayTranscript,
	createEmptyTranscriptState,
	type AdvisorTranscriptState,
} from "./transcript-state";

const ADVISOR_OVERLAY_CHROME_LINES = 2;

export class AdvisorOverlayState {
	private transcriptState: AdvisorTranscriptState = createEmptyTranscriptState();
	private status = "idle";
	private watchRunState: WatchRunState = "idle";
	private contextUsage: AdvisorContextUsage | undefined;

	setStatus(status: string): void {
		this.status = status;
		appendTranscriptNotice(this.transcriptState, "status", status);
	}

	setWatchRunState(state: WatchRunState): void {
		this.watchRunState = state;
		this.status = `watch ${state}`;
		appendTranscriptNotice(this.transcriptState, "status", `Watch Run ${state}`);
	}

	recordUserMessage(text: string): void {
		const turnId = this.transcriptState.currentTurnId ?? this.transcriptState.nextTurnId++;
		this.transcriptState.currentTurnId = turnId;
		this.transcriptState.lastTurnId = turnId;
		if (!this.transcriptState.entries.some((entry) => entry.type === "turn-boundary" && entry.turnId === turnId)) {
			this.transcriptState.entries.push({
				id: this.transcriptState.nextEntryId++,
				turnId,
				type: "turn-boundary",
				phase: "start",
			});
		}
		const existing = [...this.transcriptState.entries]
			.reverse()
			.find((entry) => entry.type === "user-message" && entry.turnId === turnId);
		if (existing?.type === "user-message") {
			existing.text = text;
			return;
		}
		this.transcriptState.entries.push({
			id: this.transcriptState.nextEntryId++,
			turnId,
			type: "user-message",
			text,
		});
	}

	recordContext(context: AskContext): void {
		appendAskContext(this.transcriptState, context);
	}

	recordAdvice(result: AdviceDeliveryResult): void {
		this.status = `${result.kind} delivered`;
	}

	recordError(error: unknown): void {
		appendTranscriptNotice(this.transcriptState, "error", error instanceof Error ? error.message : String(error));
	}

	setContextUsage(usage: AdvisorContextUsage | undefined): void {
		this.contextUsage = usage;
	}

	applyAgentEvent(event: AgentSessionEvent): void {
		if (event.type === "tool_execution_start") {
			this.status = event.toolName === "pull_transcript" ? "pulling" : `running ${event.toolName}`;
		} else if (event.type === "turn_start") {
			this.status = "thinking";
		} else if (event.type === "turn_end") {
			this.status = "idle";
		} else if (event.type === "agent_end") {
			this.status = "idle";
			const failure = event.messages.find(
				(message) => message.role === "assistant" && typeof message.errorMessage === "string",
			);
			if (failure?.role === "assistant" && failure.errorMessage) {
				appendTranscriptNotice(this.transcriptState, "error", failure.errorMessage);
			}
		}
		applyTranscriptEvent(this.transcriptState, event);
	}

	snapshot(): {
		status: string;
		watchRunState: WatchRunState;
		contextUsage: AdvisorContextUsage | undefined;
		transcriptState: AdvisorTranscriptState;
	} {
		return {
			status: this.status,
			watchRunState: this.watchRunState,
			contextUsage: this.contextUsage,
			transcriptState: {
				...this.transcriptState,
				entries: this.transcriptState.entries.map((entry) => ({ ...entry })),
				toolCalls: new Map(this.transcriptState.toolCalls),
			},
		};
	}

	clear(): void {
		this.transcriptState = createEmptyTranscriptState();
		this.status = "idle";
		this.watchRunState = "idle";
		this.contextUsage = undefined;
	}

	isPulling(): boolean {
		if (this.status !== "pulling") {
			return false;
		}
		for (const entry of this.transcriptState.entries) {
			if (entry.type !== "tool-call" || entry.toolName !== "pull_transcript") {
				continue;
			}
			const result = this.transcriptState.entries.find(
				(candidate) => candidate.type === "tool-result" && candidate.toolCallId === entry.toolCallId,
			);
			if (!result || (result.type === "tool-result" && result.streaming)) {
				return true;
			}
		}
		return false;
	}
}

export class AdvisorOverlayComponent implements Component {
	private readonly tui: TUI;
	private readonly theme: ExtensionContext["ui"]["theme"];
	private readonly state: AdvisorOverlayState;
	private transcriptLines: string[] = [];
	private transcriptScrollOffset = 0;
	private transcriptViewportHeight = 8;
	private followTranscript = true;
	private headerTextValue = "Advisor · idle · ctx ?";

	constructor(tui: TUI, theme: ExtensionContext["ui"]["theme"], state: AdvisorOverlayState) {
		this.tui = tui;
		this.theme = theme;
		this.state = state;
		this.refresh();
	}

	invalidate(): void {
		this.refresh();
	}

	refresh(): void {
		const snapshot = this.state.snapshot();
		this.headerTextValue = `Advisor · ${snapshot.status} · ${formatContextUsage(snapshot.contextUsage)}`;
		this.transcriptLines = buildAdvisorOverlayTranscript(snapshot.transcriptState.entries, this.theme);
		this.tui.requestRender();
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.pageUp) || matchesKey(data, Key.up)) {
			const step = matchesKey(data, Key.pageUp) ? Math.max(1, this.transcriptViewportHeight - 1) : 1;
			this.scrollTranscript(-step);
			return;
		}
		if (matchesKey(data, Key.pageDown) || matchesKey(data, Key.down)) {
			const step = matchesKey(data, Key.pageDown) ? Math.max(1, this.transcriptViewportHeight - 1) : 1;
			this.scrollTranscript(step);
		}
	}

	render(width: number): string[] {
		const dialogWidth = Math.max(36, width);
		const innerWidth = Math.max(34, dialogWidth - 2);
		const transcriptLines = this.wrapTranscript(innerWidth);
		const dialogHeight = this.getDialogHeight();
		const transcriptHeight = Math.max(8, dialogHeight - ADVISOR_OVERLAY_CHROME_LINES);
		this.transcriptViewportHeight = transcriptHeight;

		const maxScroll = Math.max(0, transcriptLines.length - transcriptHeight);
		if (this.followTranscript) {
			this.transcriptScrollOffset = maxScroll;
		} else {
			this.transcriptScrollOffset = Math.max(0, Math.min(this.transcriptScrollOffset, maxScroll));
			if (this.transcriptScrollOffset >= maxScroll) {
				this.followTranscript = true;
			}
		}

		const visibleTranscript = transcriptLines.slice(
			this.transcriptScrollOffset,
			this.transcriptScrollOffset + transcriptHeight,
		);
		const transcriptPadCount = Math.max(0, transcriptHeight - visibleTranscript.length);
		const hiddenAbove = this.transcriptScrollOffset;
		const hiddenBelow = Math.max(0, maxScroll - this.transcriptScrollOffset);
		const header =
			hiddenAbove || hiddenBelow
				? `${this.headerTextValue.trim()} · ↑${hiddenAbove} ↓${hiddenBelow}`
				: this.headerTextValue.trim();

		const lines = [this.borderLine(innerWidth, "top", header)];
		for (const line of visibleTranscript) {
			lines.push(this.frameLine(line, innerWidth));
		}
		for (let i = 0; i < transcriptPadCount; i++) {
			lines.push(this.frameLine("", innerWidth));
		}
		lines.push(this.borderLine(innerWidth, "bottom"));

		return lines.map((line) => this.fitRenderedLine(line, width));
	}

	private frameLine(content: string, innerWidth: number): string {
		const truncated = truncateToWidth(content, innerWidth, "");
		const padding = Math.max(0, innerWidth - visibleWidth(truncated));
		return `${this.theme.fg("border", "│")}${truncated}${" ".repeat(padding)}${this.theme.fg("border", "│")}`;
	}

	private borderLine(innerWidth: number, edge: "top" | "bottom", title = ""): string {
		const left = edge === "top" ? "╭" : "╰";
		const right = edge === "top" ? "╮" : "╯";
		if (edge === "bottom" || !title.trim()) {
			return this.theme.fg("border", `${left}${"─".repeat(innerWidth)}${right}`);
		}
		const titleWidth = Math.max(0, innerWidth - 1);
		const clippedTitle = truncateToWidth(` ${title.trim()} `, titleWidth, "");
		const titlePadding = Math.max(0, innerWidth - visibleWidth(clippedTitle));
		return (
			this.theme.fg("border", left) +
			this.theme.fg("accent", this.theme.bold(clippedTitle)) +
			this.theme.fg("border", `${"─".repeat(titlePadding)}${right}`)
		);
	}

	private wrapTranscript(innerWidth: number): string[] {
		const wrapped: string[] = [];
		for (const line of this.transcriptLines) {
			if (!line) {
				wrapped.push("");
				continue;
			}
			const indent = line.match(/^\s+/)?.[0] ?? "";
			if (!indent) {
				wrapped.push(...wrapTextWithAnsi(line, Math.max(1, innerWidth)));
				continue;
			}
			const availableWidth = Math.max(1, innerWidth - visibleWidth(indent));
			const bodyLines = wrapTextWithAnsi(line.slice(indent.length), availableWidth);
			for (const bodyLine of bodyLines) {
				wrapped.push(`${indent}${bodyLine}`);
			}
		}
		return wrapped;
	}

	private getDialogHeight(): number {
		const terminalRows = process.stdout.rows ?? 30;
		return Math.max(12, terminalRows);
	}

	private scrollTranscript(delta: number): void {
		if (delta < 0) {
			this.followTranscript = false;
		}
		this.transcriptScrollOffset = Math.max(0, this.transcriptScrollOffset + delta);
		this.tui.requestRender();
	}

	private fitRenderedLine(line: string, width: number): string {
		return visibleWidth(line) > width ? truncateToWidth(line, width, "") : line;
	}
}

export class AdvisorOverlayController {
	private component: AdvisorOverlayComponent | undefined;
	private handle: OverlayHandle | undefined;
	private pullElapsedTimer: ReturnType<typeof setInterval> | undefined;
	readonly state = new AdvisorOverlayState();

	constructor(private readonly readContextUsage: () => AdvisorContextUsage | undefined = () => undefined) {}

	open(ctx: ExtensionContext): void {
		if (!ctx.hasUI) {
			return;
		}
		this.state.setContextUsage(this.readContextUsage());
		if (this.handle) {
			this.handle.setHidden(false);
			this.refresh();
			return;
		}
		void ctx.ui
			.custom<void>(
				(tui, theme, _keybindings, _done) => {
					this.component = new AdvisorOverlayComponent(tui, theme, this.state);
					return this.component;
				},
				{
					overlay: true,
					overlayOptions: {
						width: "50%",
						minWidth: 44,
						maxHeight: "100%",
						anchor: "right-center",
						margin: { top: 0, right: 0, bottom: 0 },
						nonCapturing: true,
					},
					onHandle: (handle) => {
						this.handle = handle;
						handle.setHidden(false);
						if (handle.isFocused()) {
							handle.unfocus();
						}
						this.refresh();
					},
				},
			)
			.catch((error) => {
				this.state.recordError(error);
				this.handle = undefined;
				this.component = undefined;
			});
	}

	refresh(): void {
		this.state.setContextUsage(this.readContextUsage());
		this.component?.refresh();
		if (this.component && this.state.isPulling() && !this.pullElapsedTimer) {
			this.pullElapsedTimer = setInterval(() => this.component?.refresh(), 1_000);
			return;
		}
		if (!this.state.isPulling() && this.pullElapsedTimer) {
			clearInterval(this.pullElapsedTimer);
			this.pullElapsedTimer = undefined;
		}
	}

	applyAgentEvent(event: AgentSessionEvent): void {
		this.state.applyAgentEvent(event);
		this.refresh();
	}

	hide(): void {
		this.close();
	}

	close(): void {
		if (this.pullElapsedTimer) {
			clearInterval(this.pullElapsedTimer);
			this.pullElapsedTimer = undefined;
		}
		this.handle?.hide();
		this.handle = undefined;
		this.component = undefined;
	}
}

function formatContextUsage(usage: AdvisorContextUsage | undefined): string {
	if (!usage) {
		return "ctx ?";
	}
	const windowText = formatTokenCount(usage.contextWindow);
	if (usage.percent === null) {
		return `ctx ?/${windowText}`;
	}
	return `ctx ${usage.percent.toFixed(1)}%/${windowText}`;
}

function formatTokenCount(tokens: number): string {
	if (tokens >= 1_000_000) {
		return `${Number((tokens / 1_000_000).toFixed(1))}m`;
	}
	if (tokens >= 1_000) {
		return `${Number((tokens / 1_000).toFixed(1))}k`;
	}
	return String(tokens);
}
