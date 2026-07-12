import {
	keyText,
	type AgentSessionEvent,
	type ExtensionContext,
	type KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import type { Component, Focusable, OverlayHandle, TUI } from "@earendil-works/pi-tui";
import { Container, Input, Key, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { AdviceDeliveryResult, AdvisorContextUsage, AskContext, WatchRunState } from "./types";
import {
	appendAskContext,
	appendTranscriptNotice,
	applyTranscriptEvent,
	buildAdvisorOverlayTranscript,
	createEmptyTranscriptState,
	type AdvisorTranscriptState,
} from "./transcript-state";

const ADVISOR_OVERLAY_CHROME_LINES = 4;

export interface AdvisorOverlayCallbacks {
	onSubmit: (value: string) => void;
	onDismiss: () => void;
}

export class AdvisorOverlayState {
	private transcriptState: AdvisorTranscriptState = createEmptyTranscriptState();
	private status = "idle";
	private watchRunState: WatchRunState = "idle";
	private contextUsage: AdvisorContextUsage | undefined;
	private pullBlocksExpanded = false;

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

	togglePullBlocksExpanded(): void {
		this.pullBlocksExpanded = !this.pullBlocksExpanded;
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
		pullBlocksExpanded: boolean;
		transcriptState: AdvisorTranscriptState;
	} {
		return {
			status: this.status,
			watchRunState: this.watchRunState,
			contextUsage: this.contextUsage,
			pullBlocksExpanded: this.pullBlocksExpanded,
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
		this.pullBlocksExpanded = false;
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

export class AdvisorOverlayComponent extends Container implements Focusable {
	private readonly input = new Input();
	private readonly tui: TUI;
	private readonly theme: ExtensionContext["ui"]["theme"];
	private readonly state: AdvisorOverlayState;
	private readonly keybindings: Pick<KeybindingsManager, "getKeys" | "matches"> | undefined;
	private readonly expandKeyText: string | null;
	private readonly onSubmitCallback: (value: string) => void;
	private readonly onDismissCallback: () => void;
	private transcriptComponent: Component;
	private transcriptScrollOffset = 0;
	private transcriptViewportHeight = 8;
	private followTranscript = true;
	private headerTextValue = "Advisor · idle · ctx ?";
	private _focused = false;
	private mouseReportingEnabled = false;

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.input.focused = value;
		if (this.mouseReportingEnabled === value) {
			return;
		}
		this.tui.terminal?.write?.(value ? "\x1b[?1000h\x1b[?1006h" : "\x1b[?1000l\x1b[?1006l");
		this.mouseReportingEnabled = value;
	}

	constructor(
		tui: TUI,
		theme: ExtensionContext["ui"]["theme"],
		state: AdvisorOverlayState,
		keybindings?: Pick<KeybindingsManager, "getKeys" | "matches">,
		onSubmit: (value: string) => void = () => {},
		onDismiss: () => void = () => {},
	) {
		super();
		this.tui = tui;
		this.theme = theme;
		this.state = state;
		this.keybindings = keybindings;
		this.expandKeyText = keybindings
			? keybindings.getKeys("app.tools.expand").join("/") || null
			: keyText("app.tools.expand") || "ctrl+o";
		this.onSubmitCallback = onSubmit;
		this.onDismissCallback = onDismiss;
		this.input.onSubmit = (value) => {
			this.followTranscript = true;
			this.onSubmitCallback(value);
		};
		this.input.onEscape = () => {
			if (this.focused) {
				this.onDismissCallback();
			}
		};
		this.transcriptComponent = buildAdvisorOverlayTranscript([], this.theme, false, this.expandKeyText);
		this.refresh();
	}

	invalidate(): void {
		this.refresh();
	}

	refresh(): void {
		const snapshot = this.state.snapshot();
		this.headerTextValue = `Advisor · ${snapshot.status} · ${formatContextUsage(snapshot.contextUsage)}`;
		this.transcriptComponent = buildAdvisorOverlayTranscript(
			snapshot.transcriptState.entries,
			this.theme,
			snapshot.pullBlocksExpanded,
			this.expandKeyText,
		);
		this.tui.requestRender();
	}

	dispose(): void {
		if (this.mouseReportingEnabled) {
			this.tui.terminal?.write?.("\x1b[?1000l\x1b[?1006l");
			this.mouseReportingEnabled = false;
		}
	}

	handleInput(data: string): void {
		if (matchesKey(data, ADVISOR_OVERLAY_SHORTCUT)) {
			this.onDismissCallback();
			return;
		}
		if (this.focused && matchesKey(data, Key.escape)) {
			this.onDismissCallback();
			return;
		}
		if (this.keybindings?.matches(data, "app.tools.expand") || (!this.keybindings && matchesKey(data, Key.ctrl("o")))) {
			this.state.togglePullBlocksExpanded();
			this.followTranscript = true;
			this.refresh();
			return;
		}
		const mouseScrollDelta = this.getMouseScrollDelta(data);
		if (mouseScrollDelta !== null) {
			this.scrollTranscript(mouseScrollDelta);
			return;
		}
		if (matchesKey(data, Key.pageUp) || matchesKey(data, Key.up)) {
			const step = matchesKey(data, Key.pageUp) ? Math.max(1, this.transcriptViewportHeight - 1) : 1;
			this.scrollTranscript(-step);
			return;
		}
		if (matchesKey(data, Key.pageDown) || matchesKey(data, Key.down)) {
			const step = matchesKey(data, Key.pageDown) ? Math.max(1, this.transcriptViewportHeight - 1) : 1;
			this.scrollTranscript(step);
			return;
		}
		this.input.handleInput(data);
	}

	override render(width: number): string[] {
		const dialogWidth = Math.max(3, width);
		const innerWidth = Math.max(1, dialogWidth - 2);
		const dialogHeight = this.getDialogHeight();
		const transcriptHeight = Math.max(0, dialogHeight - ADVISOR_OVERLAY_CHROME_LINES);
		this.transcriptViewportHeight = transcriptHeight;
		const transcriptLines = this.transcriptComponent.render(innerWidth);

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
		lines.push(this.theme.fg("border", `├${"─".repeat(innerWidth)}┤`));
		lines.push(this.inputFrameLine(dialogWidth));
		lines.push(this.borderLine(innerWidth, "bottom"));

		return lines.map((line) => this.fitRenderedLine(line, width));
	}

	setDraft(value: string): void {
		this.input.setValue(value);
		this.tui.requestRender();
	}

	getDraft(): string {
		return this.input.getValue();
	}

	private frameLine(line: string, innerWidth: number): string {
		const truncated = truncateToWidth(line, innerWidth, "");
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

	private getDialogHeight(): number {
		const terminalRows = process.stdout.rows ?? 30;
		return Math.max(4, terminalRows);
	}

	private getMouseScrollDelta(data: string): number | null {
		const match = data.match(/^\x1b\[<(\d+);\d+;\d+[Mm]$/);
		if (!match) {
			return null;
		}
		const button = Number(match[1]);
		if ((button & 64) !== 64) {
			return null;
		}
		return (button & 1) === 0 ? -3 : 3;
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

	private inputFrameLine(dialogWidth: number): string {
		const targetWidth = Math.max(1, dialogWidth - 2);
		const renderedInputLine = (this.input.render(targetWidth + 2)[0] ?? "").slice(2);
		const cursorAwareInputLine = this.focused
			? renderedInputLine
			: renderedInputLine.replace("\x1b[7m", "").replace("\x1b[27m", "");
		const inputLine = truncateToWidth(cursorAwareInputLine, targetWidth, "");
		const padding = Math.max(0, targetWidth - visibleWidth(inputLine));
		return `${this.theme.fg("border", "│")}${inputLine}${" ".repeat(padding)}${this.theme.fg("border", "│")}`;
	}
}

export class AdvisorOverlayController {
	private component: AdvisorOverlayComponent | undefined;
	private handle: OverlayHandle | undefined;
	private callbacks: AdvisorOverlayCallbacks | undefined;
	private finish: (() => void) | undefined;
	private draft = "";
	private openRequested = false;
	private pullElapsedTimer: ReturnType<typeof setInterval> | undefined;
	readonly state = new AdvisorOverlayState();

	get isOpen(): boolean {
		return this.openRequested;
	}

	constructor(private readonly readContextUsage: () => AdvisorContextUsage | undefined = () => undefined) {}

	open(ctx: ExtensionContext, callbacks: AdvisorOverlayCallbacks): void {
		if (!ctx.hasUI) {
			return;
		}
		this.openRequested = true;
		this.callbacks = callbacks;
		this.state.setContextUsage(this.readContextUsage());
		if (this.handle) {
			this.handle.setHidden(false);
			this.handle.focus();
			if (this.component) {
				this.component.focused = true;
			}
			this.refresh();
			return;
		}
		void ctx.ui
			.custom<void>(
				async (tui, theme, keybindings, done) => {
					this.finish = done;
					this.component = new AdvisorOverlayComponent(
						tui,
						theme,
						this.state,
						keybindings,
						(value) => this.callbacks?.onSubmit(value),
						() => this.callbacks?.onDismiss(),
					);
					this.component.focused = this.handle?.isFocused() ?? this.openRequested;
					this.component.setDraft(this.draft);
					return this.component;
				},
				{
					overlay: true,
					overlayOptions: {
						width: "78%",
						minWidth: 72,
						maxHeight: "100%",
						anchor: "top-center",
						margin: { top: 0, left: 2, right: 2 },
						nonCapturing: true,
					},
					onHandle: (handle) => {
						this.handle = handle;
						if (!this.openRequested) {
							this.component?.dispose();
							handle.hide();
							this.finish?.();
							this.handle = undefined;
							this.component = undefined;
							this.finish = undefined;
							return;
						}
						handle.setHidden(false);
						handle.focus();
						if (this.component) {
							this.component.focused = true;
						}
						this.refresh();
					},
				},
			)
			.catch((error) => {
				this.state.recordError(error);
				this.openRequested = false;
				this.handle = undefined;
				this.component = undefined;
				this.finish = undefined;
			});
	}

	setDraft(value: string): void {
		this.draft = value;
		this.component?.setDraft(value);
	}

	getDraft(): string {
		return this.component?.getDraft() ?? this.draft;
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

	close(): void {
		this.openRequested = false;
		if (this.pullElapsedTimer) {
			clearInterval(this.pullElapsedTimer);
			this.pullElapsedTimer = undefined;
		}
		this.draft = this.component?.getDraft() ?? this.draft;
		this.component?.dispose();
		this.handle?.hide();
		this.finish?.();
		this.handle = undefined;
		this.component = undefined;
		this.finish = undefined;
	}
}

const ADVISOR_OVERLAY_SHORTCUT = Key.alt("/");

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
