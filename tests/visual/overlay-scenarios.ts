import type { AgentSessionEvent, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { AdvisorOverlayComponent, AdvisorOverlayState } from "../../extensions/advisor/overlay";

export interface OverlayVisualScenario {
	id: string;
	title: string;
	width: number;
	height: number;
	requiredText: string[];
	forbiddenText?: string[];
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
		primaryUserMessageIndex: 8,
		userText: "Review the cache design.",
		assistantTexts: ["The cache now owns request deduplication."],
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
		result: "[0, 12) primary_agent_loop_state=idle wait_result=new_messages waited_ms=4200 total=12",
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
		primaryUserMessageIndex: 24,
		userText:
			"Inspect the super-long-token-without-natural-breaks-abcdefghijklmnopqrstuvwxyz-0123456789 in the cache design.",
		assistantTexts: ["The Primary response remains visible while wrapping inside the narrow Context block."],
	});
	longContent.applyAgentEvent({
		type: "message_end",
		message: {
			role: "assistant",
			content: [
				{
					type: "text",
					text: "The narrow overlay wraps the Primary context safely without widening.",
				},
			],
			stopReason: "stop",
		},
	} as AgentSessionEvent);
	longContent.setStatus("idle");

	const repeatedAsk = new AdvisorOverlayState();
	repeatedAsk.setContextUsage({ tokens: 3_200, contextWindow: 128_000, percent: 2.5 });
	repeatedAsk.recordUserMessage("Explain the same Primary response from another angle.");
	repeatedAsk.applyAgentEvent({
		type: "message_end",
		message: {
			role: "assistant",
			content: [{ type: "text", text: "The repeated Ask reuses the existing Advisor Transcript." }],
			stopReason: "stop",
		},
	} as AgentSessionEvent);
	repeatedAsk.setStatus("idle");

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
			requiredText: ["Review the primary transcript.", "Context", "Pull", "[0,12) · 4.2s", "E2E_SECOND_OPINION"],
			forbiddenText: ["pull_transcript", "result", "total=12"],
			checklist: [
				"User message text, Context block, one-line Pull, and advisor answer are visible in that order.",
				"Completed Pull shows only its range and the duration because it exceeded three seconds.",
				"Second Opinion text is visible without exposing Pull arguments or result details.",
			],
			state: askAdvisor,
		},
		{
			id: "overlay-long-content-small-terminal",
			title: "Long Content In A Small Overlay",
			width: 44,
			height: 20,
			requiredText: ["Advisor · idle", "Context", "super-long-token"],
			checklist: [
				"Long user message text and Context block wrap inside the panel.",
				"The advisor output remains visible after the expanded Context block.",
				"Scroll indicators are acceptable when content exceeds the viewport.",
			],
			state: longContent,
		},
		{
			id: "overlay-repeated-ask",
			title: "Repeated Ask Without New Context",
			width: 50,
			height: 16,
			requiredText: ["Explain the same Primary response", "reuses the existing"],
			forbiddenText: ["Context", "User → Primary"],
			checklist: [
				"The repeated Ask text remains visible.",
				"No empty Context block or unchanged-context notice consumes panel space.",
				"The advisor answer follows directly.",
			],
			state: repeatedAsk,
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
