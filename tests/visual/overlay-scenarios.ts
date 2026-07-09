import type { AgentSessionEvent, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { AdvisorOverlayComponent, AdvisorOverlayState } from "../../extensions/advisor/overlay";

export interface OverlayVisualScenario {
	id: string;
	title: string;
	width: number;
	height: number;
	requiredText: string[];
	checklist: string[];
	state: AdvisorOverlayState;
}

export const visualTheme = {
	fg: (_color: string, value: string) => value,
	bg: (_color: string, value: string) => value,
	bold: (value: string) => value,
} as ExtensionContext["ui"]["theme"];

export function createOverlayVisualScenarios(): OverlayVisualScenario[] {
	const empty = new AdvisorOverlayState();
	empty.setContextUsage({ tokens: null, contextWindow: 128_000, percent: null });

	const askAdvisor = new AdvisorOverlayState();
	askAdvisor.setContextUsage({ tokens: 2_688, contextWindow: 128_000, percent: 2.1 });
	askAdvisor.recordUserMessage("Review the primary transcript.");
	askAdvisor.recordContext({
		start: 0,
		end: 12,
		total: 12,
		primaryAgentLoopState: "idle",
		waitResult: "new_messages",
		waitedMs: 0,
		sinceIndexOutOfBounds: false,
		omittedAdvisorAdviceCount: 0,
	});
	askAdvisor.applyAgentEvent({
		type: "tool_execution_start",
		toolCallId: "pull-1",
		toolName: "pull_transcript",
		args: { since_index: 0, count: 20, timeout_ms: 0 },
	} as AgentSessionEvent);
	askAdvisor.applyAgentEvent({
		type: "tool_execution_end",
		toolCallId: "pull-1",
		toolName: "pull_transcript",
		result: "[0, 12) primary_agent_loop_state=idle wait_result=new_messages waited_ms=0 total=12",
		isError: false,
	} as AgentSessionEvent);
	askAdvisor.applyAgentEvent({
		type: "message_end",
		message: {
			role: "assistant",
			content: [{ type: "text", text: "E2E_SECOND_OPINION: primary_transcript=seen" }],
			stopReason: "stop",
		},
	} as AgentSessionEvent);
	askAdvisor.setStatus("idle");

	const longContent = new AdvisorOverlayState();
	longContent.setContextUsage({ tokens: 17_000, contextWindow: 128_000, percent: 13.3 });
	longContent.recordUserMessage(
		"Check whether this very long prompt wraps without breaking the panel border or hiding the input area.",
	);
	longContent.recordContext({
		start: 24,
		end: 42,
		total: 42,
		primaryAgentLoopState: "running",
		waitResult: "state_changed",
		waitedMs: 312,
		sinceIndexOutOfBounds: false,
		omittedAdvisorAdviceCount: 2,
	});
	longContent.applyAgentEvent({
		type: "message_end",
		message: {
			role: "assistant",
			content: [
				{
					type: "text",
					text: "The main risk is a super-long-token-without-natural-breaks-abcdefghijklmnopqrstuvwxyz-0123456789 continuing inside a narrow overlay. The panel should wrap or truncate without widening.",
				},
			],
			stopReason: "stop",
		},
	} as AgentSessionEvent);
	longContent.setStatus("idle");

	const reset = new AdvisorOverlayState();
	reset.setStatus("reset");
	reset.setContextUsage({ tokens: 0, contextWindow: 128_000, percent: 0 });

	return [
		{
			id: "overlay-empty",
			title: "Empty Advisor Overlay",
			width: 50,
			height: 16,
			requiredText: ["Advisor · idle · ctx ?/128k", "No Advisor chat yet."],
			checklist: [
				"Header shows idle status and unknown current usage.",
				"Empty body uses a quiet placeholder instead of debug noise.",
				"Border remains closed at the configured width.",
			],
			state: empty,
		},
		{
			id: "overlay-ask-advisor",
			title: "Ask Advisor Overlay Transcript",
			width: 50,
			height: 30,
			requiredText: ["Prompt", "Context", "Tool", "pull_transcript", "Advisor", "E2E_SECOND_OPINION"],
			checklist: [
				"Prompt, Context, Tool, and Advisor sections are visible in that order.",
				"Tool call summaries stay compact and do not expose full transcript text.",
				"Second Opinion text is visible without exposing raw Primary Transcript details.",
			],
			state: askAdvisor,
		},
		{
			id: "overlay-long-content-small-terminal",
			title: "Long Content In A Small Overlay",
			width: 44,
			height: 18,
			requiredText: ["Advisor · idle", "Context", "Advisor", "super-long-token"],
			checklist: [
				"Long prompt text wraps inside the panel.",
				"Long advisor output cannot widen the overlay beyond the terminal region.",
				"Scroll indicators are acceptable when content exceeds the viewport.",
			],
			state: longContent,
		},
		{
			id: "overlay-reset",
			title: "Reset Advisor Overlay",
			width: 50,
			height: 16,
			requiredText: ["Advisor · reset · ctx 0.0%/128k", "No Advisor chat yet."],
			checklist: [
				"Reset status is visible after /advisor:new.",
				"Prior transcript content is absent.",
				"Empty panel still renders as a complete overlay.",
			],
			state: reset,
		},
	];
}

export function renderOverlayVisualScenario(scenario: OverlayVisualScenario): string {
	const previousRows = Object.getOwnPropertyDescriptor(process.stdout, "rows");
	Object.defineProperty(process.stdout, "rows", {
		configurable: true,
		value: scenario.height,
	});
	const tui = {
		requestRender() {},
		terminal: { write() {} },
	} as unknown as TUI;
	try {
		const component = new AdvisorOverlayComponent(tui, visualTheme, scenario.state);
		return component.render(scenario.width).join("\n");
	} finally {
		if (previousRows) {
			Object.defineProperty(process.stdout, "rows", previousRows);
		} else {
			Reflect.deleteProperty(process.stdout, "rows");
		}
	}
}
