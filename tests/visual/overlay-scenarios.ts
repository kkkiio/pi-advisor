import {
	type AgentSessionEvent,
	type ExtensionContext,
	type KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER, type TUI, visibleWidth } from "@earendil-works/pi-tui";
import { AdvisorOverlayComponent, AdvisorOverlayState } from "../../extensions/advisor/overlay";
import type { PullTranscriptDetails } from "../../extensions/advisor/types";

export interface OverlayVisualScenario {
	id: string;
	title: string;
	width: number;
	height: number;
	requiredText: string[];
	forbiddenText?: string[];
	expectedFullWidthBackgroundRows?: Array<{ color: string; text: string }>;
	expectedForegroundText?: Array<{ color: string; text: string }>;
	expectedItalicText?: string[];
	expectedBoldText?: string[];
	checklist: string[];
	state: AdvisorOverlayState;
	keybindings?: Pick<KeybindingsManager, "getKeys" | "matches">;
	draft?: string;
}

export interface OverlayVisualRender {
	text: string;
	fullWidthBackgroundRows: Array<{ color: string; text: string }>;
	foregroundText: Array<{ color: string; text: string }>;
	italicText: string[];
	boldText: string[];
}

export function createOverlayVisualScenarios(): OverlayVisualScenario[] {
	const empty = new AdvisorOverlayState();
	empty.setContextUsage({ tokens: null, contextWindow: 128_000, percent: null });
	const pullDetails = {
		start: 0,
		end: 12,
		total: 12,
		primaryAgentLoopState: "idle",
		waitResult: "new_messages",
		waitedMs: 4_200,
		sinceIndexOutOfBounds: false,
		omittedAdvisorAdviceCount: 0,
		displayItems: [
			{ kind: "user", text: "Review the cache design." },
			{ kind: "agent", text: "The cache owns request deduplication." },
			{ kind: "tool", text: "→ read src/cache.ts ⇒ ok · 120 lines" },
			{ kind: "tool", text: "→ grep refreshToken ⇒ ok · 12 matches" },
			{ kind: "tool", text: "→ write src/cache-refresh.ts ⇒ ok · 85 lines" },
			{ kind: "agent", text: "Adding pending refresh deduplication." },
			{ kind: "tool", text: "→ edit src/cache-refresh.ts ⇒ ok · diff applied" },
			{ kind: "tool", text: "→ bash! npm test ⇒ ok · 42 lines" },
		],
	} satisfies PullTranscriptDetails;
	const pullResult = {
		content: [{ type: "text", text: "Primary transcript pulled." }],
		details: pullDetails,
	};

	const askAdvisor = new AdvisorOverlayState();
	askAdvisor.setContextUsage({ tokens: 2_688, contextWindow: 128_000, percent: 2.1 });
	askAdvisor.recordUserMessage("Review the primary transcript.");
	askAdvisor.recordContext({
		primaryUserMessageIndex: 8,
		userText: "Review the cache design.",
		assistantTexts: ["The cache now owns request deduplication.", "The retry path still refreshes independently."],
	});
	askAdvisor.applyAgentEvent({
		type: "message_update",
		message: {
			role: "assistant",
			content: [{ type: "thinking", thinking: "Checking the Primary transcript for cache races..." }],
			stopReason: "toolUse",
		},
	} as AgentSessionEvent);
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
		result: pullResult,
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

	const expandedPull = new AdvisorOverlayState();
	expandedPull.setContextUsage({ tokens: 2_816, contextWindow: 128_000, percent: 2.2 });
	expandedPull.applyAgentEvent({
		type: "tool_execution_start",
		toolCallId: "pull-expanded-1",
		toolName: "pull_transcript",
		args: { since_index: 0, count: 20, timeout_ms: 0 },
	} as AgentSessionEvent);
	expandedPull.applyAgentEvent({
		type: "tool_execution_end",
		toolCallId: "pull-expanded-1",
		toolName: "pull_transcript",
		result: pullResult,
		isError: false,
	} as AgentSessionEvent);
	expandedPull.setStatus("idle");
	expandedPull.togglePullBlocksExpanded();
	const unboundPull = new AdvisorOverlayState();
	unboundPull.setContextUsage({ tokens: 2_816, contextWindow: 128_000, percent: 2.2 });
	unboundPull.applyAgentEvent({
		type: "tool_execution_start",
		toolCallId: "pull-unbound-1",
		toolName: "pull_transcript",
		args: { since_index: 0, count: 20, timeout_ms: 0 },
	} as AgentSessionEvent);
	unboundPull.applyAgentEvent({
		type: "tool_execution_end",
		toolCallId: "pull-unbound-1",
		toolName: "pull_transcript",
		result: pullResult,
		isError: false,
	} as AgentSessionEvent);
	unboundPull.setStatus("idle");

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

	const toolBlocks = new AdvisorOverlayState();
	toolBlocks.setContextUsage({ tokens: 4_352, contextWindow: 128_000, percent: 3.4 });
	toolBlocks.recordUserMessage("Review the delivery plan.");
	toolBlocks.applyAgentEvent({
		type: "tool_execution_start",
		toolCallId: "grep-pending-1",
		toolName: "grep",
		args: { pattern: "pendingRefresh" },
	} as AgentSessionEvent);
	toolBlocks.applyAgentEvent({
		type: "tool_execution_start",
		toolCallId: "read-success-1",
		toolName: "read",
		args: { path: "src/cache.ts" },
	} as AgentSessionEvent);
	toolBlocks.applyAgentEvent({
		type: "tool_execution_end",
		toolCallId: "read-success-1",
		toolName: "read",
		result: "cache line one\ncache line two",
		isError: false,
	} as AgentSessionEvent);
	toolBlocks.applyAgentEvent({
		type: "tool_execution_start",
		toolCallId: "write-error-1",
		toolName: "write",
		args: { path: "src/cache.ts" },
	} as AgentSessionEvent);
	toolBlocks.applyAgentEvent({
		type: "tool_execution_end",
		toolCallId: "write-error-1",
		toolName: "write",
		result: "permission denied\ncannot write",
		isError: true,
	} as AgentSessionEvent);
	toolBlocks.applyAgentEvent({
		type: "message_end",
		message: {
			role: "toolResult",
			toolCallId: "write-error-1",
			toolName: "write",
			content: [{ type: "text", text: "permission denied\ncannot write" }],
			details: {},
			isError: true,
			timestamp: Date.now(),
		},
	} as AgentSessionEvent);
	toolBlocks.applyAgentEvent({
		type: "tool_execution_start",
		toolCallId: "advise-hint-1",
		toolName: "advise",
		args: { kind: "hint", advice: "Use the SDK path." },
	} as AgentSessionEvent);
	toolBlocks.applyAgentEvent({
		type: "tool_execution_end",
		toolCallId: "advise-hint-1",
		toolName: "advise",
		result: "delivered hint as steer",
		isError: false,
	} as AgentSessionEvent);
	toolBlocks.applyAgentEvent({
		type: "tool_execution_start",
		toolCallId: "advise-concern-1",
		toolName: "advise",
		args: { kind: "concern", advice: "Keep delivery after validation." },
	} as AgentSessionEvent);
	toolBlocks.applyAgentEvent({
		type: "tool_execution_end",
		toolCallId: "advise-concern-1",
		toolName: "advise",
		result: "delivered concern as followUp",
		isError: false,
	} as AgentSessionEvent);
	toolBlocks.applyAgentEvent({
		type: "message_end",
		message: {
			role: "assistant",
			content: [{ type: "text", text: "The delivery plan is ready." }],
			stopReason: "stop",
		},
	} as AgentSessionEvent);
	toolBlocks.setStatus("idle");

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
			width: 78,
			height: 30,
			requiredText: [
				"Review the primary transcript.",
				"Context → 1 user + 2 agent msgs",
				"user: Review the cache design.",
				"agent: The cache now owns request deduplication.",
				"agent: The retry path still refreshes independently.",
				"Checking the Primary transcript for cache races...",
				"Pull [0, 12) → 8 msgs · 4.2s",
				"... (3 more, ctrl+o to expand)",
				"E2E_SECOND_OPINION",
			],
			forbiddenText: [
				"pull_transcript",
				"result",
				"total=12",
				"Adding pending refresh deduplication.",
				"→ edit src/cache-refresh.ts",
				"→ bash! npm test",
			],
			expectedFullWidthBackgroundRows: [
				{ color: "userMessageBg", text: " Review the primary transcript." },
				{ color: "customMessageBg", text: " Context → 1 user + 2 agent msgs" },
				{ color: "customMessageBg", text: " user: Review the cache design." },
				{ color: "customMessageBg", text: " agent: The cache now owns request deduplication." },
				{ color: "customMessageBg", text: " agent: The retry path still refreshes independently." },
				{ color: "toolSuccessBg", text: " Pull [0, 12) → 8 msgs · 4.2s" },
				{ color: "toolSuccessBg", text: " user: Review the cache design." },
				{ color: "toolSuccessBg", text: " agent: The cache owns request deduplication." },
				{ color: "toolSuccessBg", text: " → read src/cache.ts ⇒ ok · 120 lines" },
				{ color: "toolSuccessBg", text: " → grep refreshToken ⇒ ok · 12 matches" },
				{ color: "toolSuccessBg", text: " → write src/cache-refresh.ts ⇒ ok · 85 lines" },
				{ color: "toolSuccessBg", text: " ... (3 more, ctrl+o to expand)" },
			],
			expectedForegroundText: [
				{ color: "customMessageLabel", text: "Context" },
				{ color: "customMessageText", text: " → 1 user + 2 agent msgs" },
				{ color: "dim", text: "user:" },
				{ color: "customMessageText", text: "Review the cache design." },
				{ color: "dim", text: "agent:" },
				{ color: "customMessageText", text: "The cache now owns request deduplication." },
				{ color: "customMessageText", text: "The retry path still refreshes independently." },
				{ color: "thinkingText", text: "Checking the Primary transcript for cache races..." },
			],
			expectedItalicText: ["Checking the Primary transcript for cache races...", "... (3 more, ctrl+o to expand)"],
			expectedBoldText: ["Context", "Pull"],
			checklist: [
				"Context is one customMessageBg block with a bold Context header and dim user:/agent: prefixes.",
				"Thinking uses thinkingText in italic with no background block.",
				"Collapsed Pull uses toolSuccessBg, shows the first five of eight display items, and ends with the ctrl+o expansion hint.",
				"Second Opinion text remains visible without exposing Pull arguments or raw result details.",
			],
			state: askAdvisor,
		},
		{
			id: "overlay-expanded-pull",
			title: "Expanded Pull Transcript Block",
			width: 78,
			height: 18,
			requiredText: [
				"Pull [0, 12) → 8 msgs · 4.2s",
				"user: Review the cache design.",
				"agent: Adding pending refresh deduplication.",
				"→ edit src/cache-refresh.ts ⇒ ok · diff applied",
				"→ bash! npm test ⇒ ok · 42 lines",
			],
			forbiddenText: ["more, ctrl+o to expand", "pull_transcript", "total=12"],
			expectedFullWidthBackgroundRows: [
				{ color: "toolSuccessBg", text: " Pull [0, 12) → 8 msgs · 4.2s" },
				{ color: "toolSuccessBg", text: " user: Review the cache design." },
				{ color: "toolSuccessBg", text: " agent: The cache owns request deduplication." },
				{ color: "toolSuccessBg", text: " → read src/cache.ts ⇒ ok · 120 lines" },
				{ color: "toolSuccessBg", text: " → grep refreshToken ⇒ ok · 12 matches" },
				{ color: "toolSuccessBg", text: " → write src/cache-refresh.ts ⇒ ok · 85 lines" },
				{ color: "toolSuccessBg", text: " agent: Adding pending refresh deduplication." },
				{ color: "toolSuccessBg", text: " → edit src/cache-refresh.ts ⇒ ok · diff applied" },
				{ color: "toolSuccessBg", text: " → bash! npm test ⇒ ok · 42 lines" },
			],
			expectedForegroundText: [
				{ color: "toolTitle", text: "Pull" },
				{ color: "dim", text: "agent:" },
				{ color: "toolTitle", text: "→ edit" },
				{ color: "toolTitle", text: "→ bash!" },
			],
			expectedBoldText: ["Pull"],
			checklist: [
				"Expanded Pull keeps the same toolSuccessBg block boundary and header.",
				"All eight display items are visible in source order.",
				"The collapsed-state expansion hint is absent.",
			],
			state: expandedPull,
		},
		{
			id: "overlay-unbound-pull-expansion",
			title: "Pull With Unbound Expansion Action",
			width: 78,
			height: 16,
			requiredText: ["Pull [0, 12) → 8 msgs · 4.2s", "... (3 more)"],
			forbiddenText: ["to expand", "ctrl+o"],
			expectedFullWidthBackgroundRows: [
				{ color: "toolSuccessBg", text: " Pull [0, 12) → 8 msgs · 4.2s" },
				{ color: "toolSuccessBg", text: " user: Review the cache design." },
				{ color: "toolSuccessBg", text: " agent: The cache owns request deduplication." },
				{ color: "toolSuccessBg", text: " → read src/cache.ts ⇒ ok · 120 lines" },
				{ color: "toolSuccessBg", text: " → grep refreshToken ⇒ ok · 12 matches" },
				{ color: "toolSuccessBg", text: " → write src/cache-refresh.ts ⇒ ok · 85 lines" },
				{ color: "toolSuccessBg", text: " ... (3 more)" },
			],
			expectedForegroundText: [{ color: "toolTitle", text: "Pull" }],
			expectedItalicText: ["... (3 more)"],
			expectedBoldText: ["Pull"],
			checklist: [
				"The Pull preview remains collapsed when app.tools.expand is unbound.",
				"The truncation row reports hidden items without advertising an unavailable shortcut.",
			],
			state: unboundPull,
			keybindings: {
				getKeys: () => [],
				matches: () => false,
			},
		},
		{
			id: "overlay-long-content-small-terminal",
			title: "Long Content In A Small Overlay",
			width: 44,
			height: 21,
			requiredText: ["Advisor · idle", "Context", "super-long-token"],
			expectedFullWidthBackgroundRows: [
				{ color: "userMessageBg", text: " Check whether this very long prompt" },
				{ color: "userMessageBg", text: " wraps without breaking the panel border" },
				{ color: "userMessageBg", text: " or hiding the input area." },
				{ color: "customMessageBg", text: " Context → 1 user + 1 agent msg" },
				{ color: "customMessageBg", text: " user: Inspect the" },
				{ color: "customMessageBg", text: " super-long-token-without-natural-breaks-" },
				{ color: "customMessageBg", text: " abcdefghijklmnopqrstuvwxyz-0123456789 in" },
				{ color: "customMessageBg", text: " the cache design." },
				{ color: "customMessageBg", text: " agent: The Primary response remains" },
				{ color: "customMessageBg", text: " visible while wrapping inside the narrow" },
				{ color: "customMessageBg", text: " Context block." },
			],
			expectedForegroundText: [
				{ color: "customMessageLabel", text: "Context" },
				{ color: "dim", text: "user:" },
				{ color: "dim", text: "agent:" },
			],
			expectedBoldText: ["Context"],
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
				{ color: "userMessageBg", text: " Explain the same Primary response from another" },
				{ color: "userMessageBg", text: " angle." },
			],
			checklist: [
				"The repeated Ask remains visible with a full-row background on both wrapped rows.",
				"No empty Context block or unchanged-context notice consumes panel space.",
				"The advisor answer follows directly.",
			],
			state: repeatedAsk,
		},
		{
			id: "overlay-tool-and-advice-blocks",
			title: "Tool And Advice Blocks",
			width: 96,
			height: 22,
			requiredText: [
				'grep {"pattern":"pendingRefresh"} ⇒ pending',
				'read {"path":"src/cache.ts"} ⇒ ok · 2 lines',
				'write {"path":"src/cache.ts"} ⇒ error · 2 lines — permission denied cannot write',
				"Hint: Use the SDK path.",
				"Concern: Keep delivery after validation.",
				"The delivery plan is ready.",
			],
			forbiddenText: ["Prompt", "Tool ", "↳", "advise hint", "advise concern", "delivered hint"],
			expectedFullWidthBackgroundRows: [
				{ color: "userMessageBg", text: " Review the delivery plan." },
				{ color: "toolPendingBg", text: ' grep {"pattern":"pendingRefresh"} ⇒ pending' },
				{ color: "toolSuccessBg", text: ' read {"path":"src/cache.ts"} ⇒ ok · 2 lines' },
				{
					color: "toolErrorBg",
					text: ' write {"path":"src/cache.ts"} ⇒ error · 2 lines — permission denied cannot write',
				},
				{ color: "toolErrorBg", text: " Hint: Use the SDK path." },
				{ color: "toolErrorBg", text: " Concern: Keep delivery after validation." },
			],
			expectedForegroundText: [
				{ color: "toolTitle", text: "grep" },
				{ color: "toolTitle", text: "read" },
				{ color: "toolTitle", text: "write" },
				{ color: "text", text: "Hint:" },
				{ color: "text", text: "Concern:" },
				{ color: "text", text: "Use the SDK path." },
				{ color: "text", text: "Keep delivery after validation." },
			],
			expectedBoldText: ["grep", "read", "write", "Hint:", "Concern:"],
			checklist: [
				"Pending, successful, and failed generic tools use toolPendingBg, toolSuccessBg, and toolErrorBg respectively.",
				"Hint and Concern render as compact labeled blocks using Pi text styling and the documented background alias.",
				"Each generic tool call and result shares one block without a Tool badge or separate result row.",
				"The advisor answer appears directly without an Advisor badge.",
			],
			state: toolBlocks,
		},
		{
			id: "overlay-tiny-terminal",
			title: "Tiny Advisor Overlay",
			width: 24,
			height: 7,
			requiredText: ["Advisor · idle", "No Advisor chat yet."],
			checklist: [
				"The component uses the narrow width supplied by Pi and keeps both side borders.",
				"The visible height keeps the header, input separator, input, and bottom border on screen.",
			],
			state: empty,
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
	const foregroundText: Array<{ color: string; text: string }> = [];
	const italicText: string[] = [];
	const boldText: string[] = [];
	const theme = {
		fg: (color: string, value: string) => {
			foregroundText.push({ color, text: value });
			return value;
		},
		bg: (color: string, value: string) => {
			backgroundRows.push({ color, text: value });
			return value;
		},
		bold: (value: string) => {
			boldText.push(value);
			return value;
		},
		italic: (value: string) => {
			italicText.push(value);
			return value;
		},
	} as ExtensionContext["ui"]["theme"];
	const tui = {
		requestRender() {},
		terminal: { write() {} },
	} as unknown as TUI;
	try {
		const component = new AdvisorOverlayComponent(tui, theme, scenario.state, scenario.keybindings);
		component.focused = true;
		component.setDraft(scenario.draft ?? "");
		const text = component.render(scenario.width).join("\n").replaceAll(CURSOR_MARKER, "");
		const fullWidthBackgroundRows = backgroundRows
			.filter((row) => visibleWidth(row.text) === scenario.width - 2)
			.map((row) => ({ color: row.color, text: row.text.trimEnd() }));
		return { text, fullWidthBackgroundRows, foregroundText, italicText, boldText };
	} finally {
		if (previousRows) {
			Object.defineProperty(process.stdout, "rows", previousRows);
		} else {
			Reflect.deleteProperty(process.stdout, "rows");
		}
	}
}
