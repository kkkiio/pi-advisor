import type { AgentSessionEvent, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Component, OverlayHandle, TUI } from "@earendil-works/pi-tui";
import { Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { AdviceDeliveryResult, WatchRunState } from "./types";
import {
	appendTranscriptNotice,
	applyTranscriptEvent,
	buildAdvisorOverlayTranscript,
	createEmptyTranscriptState,
	getCompletedExchangeCount,
	hasStreamingTranscriptEntry,
	type AdvisorTranscriptState,
} from "./transcript-state";

const ADVISOR_OVERLAY_CHROME_LINES = 8;

export class AdvisorOverlayState {
	private transcriptState: AdvisorTranscriptState = createEmptyTranscriptState();
	private status = "idle";
	private watchRunState: WatchRunState = "idle";

	setStatus(status: string): void {
		this.status = status;
		appendTranscriptNotice(this.transcriptState, "status", status);
	}

	setWatchRunState(state: WatchRunState): void {
		this.watchRunState = state;
		appendTranscriptNotice(this.transcriptState, "status", `Watch Run ${state}`);
	}

	recordAdvice(result: AdviceDeliveryResult): void {
		appendTranscriptNotice(
			this.transcriptState,
			"advice",
			`${result.kind} -> ${result.deliverAs}: ${result.content.replace(/\s+/g, " ").slice(0, 500)}`,
		);
	}

	recordError(error: unknown): void {
		appendTranscriptNotice(this.transcriptState, "error", error instanceof Error ? error.message : String(error));
	}

	applyAgentEvent(event: AgentSessionEvent): void {
		if (event.type === "tool_execution_start") {
			this.status = `Advisor running ${event.toolName}`;
		} else if (event.type === "turn_start") {
			this.status = "Advisor thinking";
		} else if (event.type === "turn_end") {
			this.status = "Advisor turn finished";
		}
		applyTranscriptEvent(this.transcriptState, event);
	}

	snapshot(): { status: string; watchRunState: WatchRunState; transcriptState: AdvisorTranscriptState } {
		return {
			status: this.status,
			watchRunState: this.watchRunState,
			transcriptState: {
				...this.transcriptState,
				entries: this.transcriptState.entries.map(entry => ({ ...entry })),
				toolCalls: new Map(this.transcriptState.toolCalls),
			},
		};
	}

	clear(): void {
		this.transcriptState = createEmptyTranscriptState();
		this.status = "idle";
		this.watchRunState = "idle";
	}
}

class AdvisorOverlayComponent implements Component {
	private readonly tui: TUI;
	private readonly theme: ExtensionContext["ui"]["theme"];
	private readonly state: AdvisorOverlayState;
	private transcriptLines: string[] = [];
	private transcriptScrollOffset = 0;
	private transcriptViewportHeight = 8;
	private followTranscript = true;
	private modeTextValue = "Advisor";
	private summaryTextValue = "";
	private statusTextValue = "";
	private hintsTextValue = "";

	constructor(tui: TUI, theme: ExtensionContext["ui"]["theme"], state: AdvisorOverlayState) {
		this.tui = tui;
		this.theme = theme;
		this.state = state;
		this.tui.terminal?.write?.("\x1b[?1000h\x1b[?1006h");
		this.refresh();
	}

	dispose(): void {
		this.tui.terminal?.write?.("\x1b[?1000l\x1b[?1006l");
	}

	invalidate(): void {
		this.refresh();
	}

	refresh(): void {
		const snapshot = this.state.snapshot();
		this.modeTextValue = "Advisor · persistent second agent";
		const exchanges = getCompletedExchangeCount(snapshot.transcriptState.entries);
		const active = hasStreamingTranscriptEntry(snapshot.transcriptState.entries) ? " · streaming" : " · idle";
		this.summaryTextValue = `${exchanges} exchange${exchanges === 1 ? "" : "s"}${active} · watch=${snapshot.watchRunState}`;
		this.statusTextValue = snapshot.status;
		this.hintsTextValue = "Scroll wheel ↑↓ PgUp/PgDn · /advisor commands in main input";
		this.transcriptLines = buildAdvisorOverlayTranscript(snapshot.transcriptState.entries, this.theme);
		this.tui.requestRender();
	}

	handleInput(data: string): void {
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
		const summary =
			hiddenAbove || hiddenBelow
				? `${this.summaryTextValue.trim()} · ↑${hiddenAbove} ↓${hiddenBelow}`
				: this.summaryTextValue.trim();

		const lines = [this.borderLine(innerWidth, "top")];
		lines.push(this.frameLine(this.theme.fg("accent", this.theme.bold(this.modeTextValue.trim())), innerWidth));
		lines.push(this.frameLine(this.theme.fg("dim", summary), innerWidth));
		lines.push(this.ruleLine(innerWidth));
		for (const line of visibleTranscript) {
			lines.push(this.frameLine(line, innerWidth));
		}
		for (let i = 0; i < transcriptPadCount; i++) {
			lines.push(this.frameLine("", innerWidth));
		}
		lines.push(this.ruleLine(innerWidth));
		lines.push(this.frameLine(this.theme.fg("warning", this.statusTextValue.trim()), innerWidth));
		lines.push(this.frameLine(this.theme.fg("dim", this.hintsTextValue.trim()), innerWidth));
		lines.push(this.borderLine(innerWidth, "bottom"));

		return lines.map(line => this.fitRenderedLine(line, width));
	}

	private frameLine(content: string, innerWidth: number): string {
		const truncated = truncateToWidth(content, innerWidth, "");
		const padding = Math.max(0, innerWidth - visibleWidth(truncated));
		return `${this.theme.fg("border", "│")}${truncated}${" ".repeat(padding)}${this.theme.fg("border", "│")}`;
	}

	private ruleLine(innerWidth: number): string {
		return this.theme.fg("border", `├${"─".repeat(innerWidth)}┤`);
	}

	private borderLine(innerWidth: number, edge: "top" | "bottom"): string {
		const left = edge === "top" ? "┌" : "└";
		const right = edge === "top" ? "┐" : "┘";
		return this.theme.fg("border", `${left}${"─".repeat(innerWidth)}${right}`);
	}

	private wrapTranscript(innerWidth: number): string[] {
		const wrapped: string[] = [];
		for (const line of this.transcriptLines) {
			if (!line) {
				wrapped.push("");
				continue;
			}
			wrapped.push(...wrapTextWithAnsi(line, Math.max(1, innerWidth)));
		}
		return wrapped;
	}

	private getDialogHeight(): number {
		const terminalRows = process.stdout.rows ?? 30;
		return Math.max(18, Math.min(32, Math.floor(terminalRows * 0.78)));
	}

	private scrollTranscript(delta: number): void {
		if (delta < 0) {
			this.followTranscript = false;
		}
		this.transcriptScrollOffset = Math.max(0, this.transcriptScrollOffset + delta);
		this.tui.requestRender();
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

	private fitRenderedLine(line: string, width: number): string {
		return visibleWidth(line) > width ? truncateToWidth(line, width, "") : line;
	}
}

export class AdvisorOverlayController {
	private component: AdvisorOverlayComponent | undefined;
	private handle: OverlayHandle | undefined;
	readonly state = new AdvisorOverlayState();

	open(ctx: ExtensionContext): void {
		if (!ctx.hasUI) {
			return;
		}
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
						width: "78%",
						minWidth: 72,
						maxHeight: "78%",
						anchor: "top-center",
						margin: { top: 1, left: 2, right: 2 },
						nonCapturing: true,
					},
					onHandle: handle => {
						this.handle = handle;
						handle.setHidden(false);
						if (handle.isFocused()) {
							handle.unfocus();
						}
					},
				},
			)
			.catch(error => {
				this.state.recordError(error);
				this.handle = undefined;
				this.component = undefined;
			});
	}

	refresh(): void {
		this.component?.refresh();
	}

	close(): void {
		this.component?.dispose();
		this.handle?.hide();
		this.handle = undefined;
		this.component = undefined;
	}
}
