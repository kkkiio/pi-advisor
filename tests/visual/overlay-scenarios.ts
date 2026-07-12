import type { AgentSessionEvent, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER, type TUI, visibleWidth } from "@earendil-works/pi-tui";
import { AdvisorOverlayComponent, AdvisorOverlayState } from "../../extensions/advisor/overlay";

export interface OverlayVisualScenario {
	id: string;
	title: string;
	width: number;
	height: number;
	requiredText: string[];
	forbiddenText?: string[];
	expectedFullWidthBackgroundRows?: Array<{ color: string; text: string }>;
	checklist: string[];
	state: AdvisorOverlayState;
	draft?: string;
}

export interface OverlayVisualRender {
	text: string;
	fullWidthBackgroundRows: Array<{ color: string; text: string }>;
}

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

	const simplifiedTools = new AdvisorOverlayState();
	simplifiedTools.setContextUsage({ tokens: 4_352, contextWindow: 128_000, percent: 3.4 });
	simplifiedTools.recordUserMessage("Review the delivery plan.");
	simplifiedTools.applyAgentEvent({
		type: "tool_execution_start",
		toolCallId: "advise-hint-1",
		toolName: "advise",
		args: { kind: "hint", advice: "Use the SDK path." },
	} as AgentSessionEvent);
	simplifiedTools.applyAgentEvent({
		type: "tool_execution_end",
		toolCallId: "advise-hint-1",
		toolName: "advise",
		result: "delivered hint as steer",
		isError: false,
	} as AgentSessionEvent);
	simplifiedTools.applyAgentEvent({
		type: "tool_execution_start",
		toolCallId: "advise-concern-1",
		toolName: "advise",
		args: { kind: "concern", advice: "Keep delivery after validation." },
	} as AgentSessionEvent);
	simplifiedTools.applyAgentEvent({
		type: "tool_execution_end",
		toolCallId: "advise-concern-1",
		toolName: "advise",
		result: "delivered concern as followUp",
		isError: false,
	} as AgentSessionEvent);
	simplifiedTools.applyAgentEvent({
		type: "tool_execution_start",
		toolCallId: "read-1",
		toolName: "read",
		args: { path: "src/cache.ts" },
	} as AgentSessionEvent);
	simplifiedTools.applyAgentEvent({
		type: "tool_execution_end",
		toolCallId: "read-1",
		toolName: "read",
		result: "cache contents",
		isError: false,
	} as AgentSessionEvent);
	simplifiedTools.applyAgentEvent({
		type: "message_end",
		message: {
			role: "assistant",
			content: [{ type: "text", text: "The delivery plan is ready." }],
			stopReason: "stop",
		},
	} as AgentSessionEvent);
	simplifiedTools.setStatus("idle");

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
			id: "overlay-focused-input",
			title: "Focused Advisor Overlay Input",
			width: 50,
			height: 16,
			requiredText: ["Advisor · idle · ctx ?/128k", "Review this draft"],
			checklist: [
				"Focused Advisor input shows one reverse-video software cursor.",
				"The draft remains readable around the focused cursor.",
				"Border geometry stays unchanged when focus adds the cursor marker.",
			],
			state: empty,
			draft: "Review this draft",
		},
		{
			id: "overlay-ask-advisor",
			title: "Ask Advisor Overlay Transcript",
			width: 50,
			height: 30,
			requiredText: ["Review the primary transcript.", "Context", "Pull", "[0,12) · 4.2s", "E2E_SECOND_OPINION"],
			forbiddenText: ["pull_transcript", "result", "total=12"],
			expectedFullWidthBackgroundRows: [{ color: "userMessageBg", text: "Review the primary transcript." }],
			checklist: [
				"User message has a full-row background, followed by the Context block, one-line Pull, and advisor answer.",
				"Completed Pull shows only its range and the duration because it exceeded three seconds.",
				"Second Opinion text is visible without exposing Pull arguments or result details.",
			],
			state: askAdvisor,
		},
		{
			id: "overlay-long-content-small-terminal",
			title: "Long Content In A Small Overlay",
			width: 44,
			height: 21,
			requiredText: ["Advisor · idle", "Context", "super-long-token"],
			expectedFullWidthBackgroundRows: [
				{ color: "userMessageBg", text: "Check whether this very long prompt wraps" },
				{ color: "userMessageBg", text: "without breaking the panel border or" },
				{ color: "userMessageBg", text: "hiding the input area." },
			],
			checklist: [
				"Every wrapped row of the long user message keeps the full-row background inside the panel.",
				"The Context block wraps inside the panel.",
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
			expectedFullWidthBackgroundRows: [
				{ color: "userMessageBg", text: "Explain the same Primary response from another" },
				{ color: "userMessageBg", text: "angle." },
			],
			checklist: [
				"The repeated Ask remains visible with a full-row background on both wrapped rows.",
				"No empty Context block or unchanged-context notice consumes panel space.",
				"The advisor answer follows directly.",
			],
			state: repeatedAsk,
		},
		{
			id: "overlay-simplified-tools",
			title: "Simplified Advisor Tool Rows",
			width: 58,
			height: 18,
			requiredText: [
				"Hint Use the SDK path.",
				"Concern Keep delivery after validation.",
				'read {"path":"src/cache.ts"} ok',
				"The delivery plan is ready.",
			],
			forbiddenText: ["Prompt", "Tool ", "↳", "advise hint", "advise concern"],
			expectedFullWidthBackgroundRows: [{ color: "userMessageBg", text: "Review the delivery plan." }],
			checklist: [
				"Hint and Concern use their domain labels and keep the advice on the same row.",
				"A generic tool call and its result share one compact row without a Tool badge or result arrow.",
				"The advisor answer appears directly without an Advisor badge.",
			],
			state: simplifiedTools,
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

export function renderOverlayVisualScenario(scenario: OverlayVisualScenario): OverlayVisualRender {
	const previousRows = Object.getOwnPropertyDescriptor(process.stdout, "rows");
	Object.defineProperty(process.stdout, "rows", {
		configurable: true,
		value: scenario.height,
	});
	const backgroundRows: Array<{ color: string; text: string }> = [];
	const theme = {
		fg: (_color: string, value: string) => value,
		bg: (color: string, value: string) => {
			backgroundRows.push({ color, text: value });
			return value;
		},
		bold: (value: string) => value,
	} as ExtensionContext["ui"]["theme"];
	const tui = {
		requestRender() {},
		terminal: { write() {} },
	} as unknown as TUI;
	try {
		const component = new AdvisorOverlayComponent(tui, theme, scenario.state);
		component.focused = true;
		component.setDraft(scenario.draft ?? "");
		const text = component.render(scenario.width).join("\n").replaceAll(CURSOR_MARKER, "");
		const fullWidthBackgroundRows = backgroundRows
			.filter((row) => visibleWidth(row.text) === scenario.width - 2)
			.map((row) => ({ color: row.color, text: row.text.trimEnd() }));
		return { text, fullWidthBackgroundRows };
	} finally {
		if (previousRows) {
			Object.defineProperty(process.stdout, "rows", previousRows);
		} else {
			Reflect.deleteProperty(process.stdout, "rows");
		}
	}
}
