import type { AgentSessionEvent, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Focusable, OverlayHandle, TUI } from "@earendil-works/pi-tui";
import {
	Container,
	Input,
	Key,
	matchesKey,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import type { AdviceDeliveryResult, AdvisorContextUsage, AskContext, TranscriptLine, WatchRunState } from "./types";
import {
	appendAskContext,
	appendTranscriptNotice,
	applyTranscriptEvent,
	buildAdvisorOverlayTranscript,
	createEmptyTranscriptState,
	type AdvisorTranscriptState,
} from "./transcript-state";

const ADVISOR_OVERLAY_CHROME_LINES = 3;

export interface AdvisorOverlayCallbacks {
	onSubmit: (value: string) => void;
	onDismiss: () => void;
	onUnfocus: () => void;
}

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

export class AdvisorOverlayComponent extends Container implements Focusable {
	private readonly input = new Input();
	private readonly tui: TUI;
	private readonly theme: ExtensionContext["ui"]["theme"];
	private readonly state: AdvisorOverlayState;
	private readonly onSubmitCallback: (value: string) => void;
	private readonly onDismissCallback: () => void;
	private readonly onUnfocusCallback: () => void;
	private transcriptLines: TranscriptLine[] = [];
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
		onSubmit: (value: string) => void = () => {},
		onDismiss: () => void = () => {},
		onUnfocus: () => void = () => {},
	) {
		super();
		this.tui = tui;
		this.theme = theme;
		this.state = state;
		this.onSubmitCallback = onSubmit;
		this.onDismissCallback = onDismiss;
		this.onUnfocusCallback = onUnfocus;
		this.input.onSubmit = (value) => {
			this.followTranscript = true;
			this.onSubmitCallback(value);
		};
		this.input.onEscape = () => {
			if (this.focused) {
				this.onDismissCallback();
			}
		};
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

	dispose(): void {
		if (this.mouseReportingEnabled) {
			this.tui.terminal?.write?.("\x1b[?1000l\x1b[?1006l");
			this.mouseReportingEnabled = false;
		}
	}

	handleInput(data: string): void {
		if (ADVISOR_FOCUS_SHORTCUTS.some((shortcut) => matchesKey(data, shortcut))) {
			this.onUnfocusCallback();
			return;
		}
		if (this.focused && matchesKey(data, Key.escape)) {
			this.onDismissCallback();
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
		const dialogWidth = Math.max(36, width);
		const innerWidth = Math.max(34, dialogWidth - 2);
		const dialogHeight = this.getDialogHeight();
		const transcriptHeight = Math.max(8, dialogHeight - ADVISOR_OVERLAY_CHROME_LINES);
		this.transcriptViewportHeight = transcriptHeight;
		const transcriptLines = this.wrapTranscript(innerWidth);

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

	private frameLine(line: TranscriptLine, innerWidth: number): string {
		const text = typeof line === "string" ? line : line.text;
		const bg = typeof line === "string" ? undefined : line.bg;
		const truncated = truncateToWidth(text, innerWidth, "");
		const padding = Math.max(0, innerWidth - visibleWidth(truncated));
		if (bg) {
			const fullContent = `${truncated}${" ".repeat(padding)}`;
			return `${this.theme.fg("border", "│")}${this.theme.bg(bg, fullContent)}${this.theme.fg("border", "│")}`;
		}
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

	private wrapTranscript(innerWidth: number): TranscriptLine[] {
		const wrapped: TranscriptLine[] = [];
		for (const line of this.transcriptLines) {
			const text = typeof line === "string" ? line : line.text;
			const bg = typeof line === "string" ? undefined : line.bg;
			if (!text) {
				wrapped.push("");
				continue;
			}
			const indent = text.match(/^\s+/)?.[0] ?? "";
			if (!indent) {
				for (const t of wrapTextWithAnsi(text, Math.max(1, innerWidth))) {
					wrapped.push(bg ? { text: t, bg } : t);
				}
				continue;
			}
			const availableWidth = Math.max(1, innerWidth - visibleWidth(indent));
			const bodyLines = wrapTextWithAnsi(text.slice(indent.length), availableWidth);
			for (const bodyLine of bodyLines) {
				const fullLine = `${indent}${bodyLine}`;
				wrapped.push(bg ? { text: fullLine, bg } : fullLine);
			}
		}
		return wrapped;
	}

	private getDialogHeight(): number {
		const terminalRows = process.stdout.rows ?? 30;
		return Math.max(12, terminalRows);
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
		const renderedInputLine = this.input.render(targetWidth)[0] ?? "";
		const inputLine = truncateToWidth(renderedInputLine, targetWidth, "");
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
	private pendingFocus = false;
	private pullElapsedTimer: ReturnType<typeof setInterval> | undefined;
	readonly state = new AdvisorOverlayState();

	constructor(private readonly readContextUsage: () => AdvisorContextUsage | undefined = () => undefined) {}

	open(ctx: ExtensionContext, callbacks: AdvisorOverlayCallbacks): void {
		if (!ctx.hasUI) {
			return;
		}
		this.callbacks = callbacks;
		this.state.setContextUsage(this.readContextUsage());
		if (this.handle) {
			this.handle.setHidden(false);
			this.refresh();
			return;
		}
		void ctx.ui
			.custom<void>(
				async (tui, theme, _keybindings, done) => {
					this.finish = done;
					this.component = new AdvisorOverlayComponent(
						tui,
						theme,
						this.state,
						(value) => this.callbacks?.onSubmit(value),
						() => this.callbacks?.onDismiss(),
						() => this.callbacks?.onUnfocus(),
					);
					this.component.focused = this.handle?.isFocused() ?? this.pendingFocus;
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
						handle.setHidden(false);
						if (this.pendingFocus) {
							handle.focus();
						} else if (handle.isFocused()) {
							handle.unfocus();
						}
						if (this.component) {
							this.component.focused = handle.isFocused();
						}
						this.refresh();
					},
				},
			)
			.catch((error) => {
				this.state.recordError(error);
				this.handle = undefined;
				this.component = undefined;
				this.finish = undefined;
			});
	}

	focus(): void {
		this.pendingFocus = true;
		this.handle?.setHidden(false);
		this.handle?.focus();
		if (this.component) {
			this.component.focused = true;
			this.component.refresh();
		}
	}

	unfocus(): void {
		this.pendingFocus = false;
		this.handle?.unfocus();
		if (this.component) {
			this.component.focused = false;
			this.component.refresh();
		}
	}

	toggleFocus(): void {
		if (!this.handle) {
			return;
		}
		if (this.handle.isFocused()) {
			this.unfocus();
			return;
		}
		this.focus();
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

	hide(): void {
		this.close();
	}

	close(): void {
		if (this.pullElapsedTimer) {
			clearInterval(this.pullElapsedTimer);
			this.pullElapsedTimer = undefined;
		}
		this.draft = this.component?.getDraft() ?? this.draft;
		this.component?.dispose();
		this.handle?.hide();
		this.finish?.();
		this.pendingFocus = false;
		this.handle = undefined;
		this.component = undefined;
		this.finish = undefined;
	}
}

const ADVISOR_FOCUS_SHORTCUTS = [Key.alt("/"), Key.ctrlAlt("w")] as const;

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
