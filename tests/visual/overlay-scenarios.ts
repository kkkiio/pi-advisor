import { readFileSync } from "node:fs";
import {
	type AgentSessionEvent,
	type ExtensionContext,
	type KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER, type TUI, visibleWidth } from "@earendil-works/pi-tui";
import { parse } from "yaml";
import { AdvisorOverlayComponent, AdvisorOverlayState } from "../../extensions/advisor/overlay";
import type { PullTranscriptDetails } from "../../extensions/advisor/types";

interface RealPlanReviewFixture {
	provenance: {
		capturedAt: string;
		piVersion: string;
		primaryModel: string;
		primaryThinking: string;
		advisorModel: string;
		advisorThinking: string;
		note: string;
	};
	primaryTranscriptEndIndex: number;
	pullRange: { start: number; end: number; total: number; waitedMs: number };
	primaryUser: string;
	primaryAssistantTexts: string[];
	advisorQuestion: string;
	advisorResponse: string;
}

const realPlanReview = parse(
	readFileSync(new URL("./fixtures/real-plan-review.yaml", import.meta.url), "utf8"),
) as RealPlanReviewFixture;

export interface OverlayVisualScenario {
	id: string;
	title: string;
	width: number;
	height: number;
	requiredText: string[];
	forbiddenText?: string[];
	expectedForegroundText?: Array<{ color: string; text: string }>;
	expectedItalicText?: string[];
	expectedBoldText?: string[];
	checklist: string[];
	state: AdvisorOverlayState;
	keybindings?: Pick<KeybindingsManager, "getKeys" | "matches">;
	draft?: string;
}

export interface OverlayVisualSnapshot {
	screen: string;
	styles: {
		fullWidthBackgroundBlocks: Array<{ color: string; lines: string[] }>;
	};
}

export interface OverlayVisualRender {
	snapshot: OverlayVisualSnapshot;
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
			{ kind: "user", text: "给 Pull 增加等待新消息的能力，并补齐游标越界处理。" },
			{ kind: "agent", text: "我先检查 Pull 的游标推进和等待逻辑。" },
			{ kind: "tool", text: "→ read extensions/advisor/session.ts ⇒ ok · 640 lines" },
			{ kind: "tool", text: "→ grep waitForPrimaryTranscript ⇒ ok · 8 matches" },
			{ kind: "tool", text: "→ edit extensions/advisor/session.ts ⇒ ok · diff applied" },
			{ kind: "agent", text: "等待分支已经接入，接下来补充越界场景。" },
			{ kind: "tool", text: "→ edit e2e/features/pull-transcript.feature ⇒ ok · diff applied" },
			{ kind: "tool", text: "→ bash! just test-e2e ⇒ ok · 29 scenarios" },
		],
	} satisfies PullTranscriptDetails;
	const pullPayload = `<primary-transcript start="0" end="12" total="12" state="idle" wait="new_messages" waited-ms="4200">
**user**:
给 Pull 增加等待新消息的能力，并补齐游标越界处理。

**agent**:
我先检查 Pull 的游标推进和等待逻辑。
// inspect cursor advancement and wake-up ordering before editing
→ read(extensions/advisor/session.ts) ⇒ ok · 640 lines
→ grep(waitForPrimaryTranscript) ⇒ ok · 8 lines
→ edit(extensions/advisor/session.ts) ⇒ ok · 1 line
\`\`\`diff
--- a/extensions/advisor/session.ts
+++ b/extensions/advisor/session.ts
@@ -1 +1 @@
-const shouldWait = false;
+const shouldWait = timeoutMs > 0;
\`\`\`
等待分支已经接入，接下来补充越界场景。
→ edit(e2e/features/pull-transcript.feature) ⇒ ok · 1 line
→ bash(just test-e2e) ⇒ ok · 29 scenarios
</primary-transcript>
`;
	const pullResult = {
		content: [{ type: "text", text: pullPayload }],
		details: pullDetails,
	};

	const askAdvisor = new AdvisorOverlayState();
	askAdvisor.setContextUsage({ tokens: 2_688, contextWindow: 128_000, percent: 2.1 });
	askAdvisor.recordUserMessage("帮我检查这次 Pull 改动，重点看会不会漏消息。");
	askAdvisor.recordContext({
		primaryTranscriptEndIndex: 12,
		primaryAgentLoopState: "idle",
		askContext: {
			primaryUserMessageIndex: 8,
			userText: "给 Pull 增加等待新消息的能力，并补齐游标越界处理。",
			assistantTexts: ["等待分支已经接入。", "游标越界时会从当前 transcript 末尾继续。"],
		},
		text: `<primary-context end="12" state="idle">
**user**:
给 Pull 增加等待新消息的能力，并补齐游标越界处理。

**primary**:
等待分支已经接入。

游标越界时会从当前 transcript 末尾继续。
</primary-context>`,
	});
	askAdvisor.applyAgentEvent({
		type: "message_update",
		message: {
			role: "assistant",
			content: [{ type: "thinking", thinking: "我在对照游标推进、等待唤醒和越界恢复的时序。" }],
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
			content: [
				{
					type: "text",
					text: "游标推进整体合理；还需要覆盖等待期间 Primary 结束但没有新消息的场景。",
				},
			],
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
	expandedPull.togglePrimaryContextExpanded();
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
	longContent.recordUserMessage("再看一下窄窗口里的显示，长标识符换行以后会不会把边框撑开，或者挡住下面的输入框？");
	longContent.recordContext({
		primaryTranscriptEndIndex: 27,
		primaryAgentLoopState: "idle",
		askContext: {
			primaryUserMessageIndex: 24,
			userText: "请确认 primaryTranscriptCursorByAdvisorSessionAndWorkspace 在窄窗口中能正常换行。",
			assistantTexts: ["我保留这个完整标识符，用它验证 Context 在窄宽度下的折行，同时确认截断提示不会覆盖右侧边框。"],
		},
		text: `<primary-context end="27" state="idle">
**user**:
请确认 primaryTranscriptCursorByAdvisorSessionAndWorkspace 在窄窗口中能正常换行。

**primary**:
我保留这个完整标识符，用它验证 Context 在窄宽度下的折行，同时确认截断提示不会覆盖右侧边框。
</primary-context>`,
	});
	longContent.applyAgentEvent({
		type: "message_end",
		message: {
			role: "assistant",
			content: [
				{
					type: "text",
					text: "Context 会在面板内换行，右侧边框和输入区域都保持完整。",
				},
			],
			stopReason: "stop",
		},
	} as AgentSessionEvent);
	longContent.setStatus("idle");

	const contextPreview = new AdvisorOverlayState();
	contextPreview.setContextUsage({ tokens: 3_072, contextWindow: 128_000, percent: 2.4 });
	contextPreview.recordContext({
		primaryTranscriptEndIndex: 18,
		primaryAgentLoopState: "idle",
		askContext: {
			primaryUserMessageIndex: 11,
			userText: "帮我检查数据库迁移是否可以安全回滚。",
			assistantTexts: [
				"我先核对旧表结构。",
				"接着检查迁移入口。",
				"事务边界已经调整。",
				"现在补充回滚场景。",
				"迁移测试正在运行。",
				"迁移和回滚测试都已通过。",
			],
		},
		text: `<primary-context end="18" state="idle">
**user**:
帮我检查数据库迁移是否可以安全回滚。

**primary**:
我先核对旧表结构。

接着检查迁移入口。

事务边界已经调整。

现在补充回滚场景。

迁移测试正在运行。

迁移和回滚测试都已通过。
</primary-context>`,
	});
	contextPreview.setStatus("idle");

	const repeatedAsk = new AdvisorOverlayState();
	repeatedAsk.setContextUsage({ tokens: 3_200, contextWindow: 128_000, percent: 2.5 });
	repeatedAsk.recordUserMessage("同一个结论能换个角度解释吗？");
	repeatedAsk.recordContext({
		primaryTranscriptEndIndex: 12,
		primaryAgentLoopState: "idle",
		askContext: undefined,
		text: `<primary-context end="12" state="idle" />`,
	});
	repeatedAsk.applyAgentEvent({
		type: "message_end",
		message: {
			role: "assistant",
			content: [
				{
					type: "text",
					text: "可以。关键是 Advisor 会复用已有上下文，不会重复注入相同的 Primary 内容。",
				},
			],
			stopReason: "stop",
		},
	} as AgentSessionEvent);
	repeatedAsk.setStatus("idle");

	const realPlanReviewPreview = new AdvisorOverlayState();
	realPlanReviewPreview.setContextUsage({ tokens: 39_804, contextWindow: 372_000, percent: 10.7 });
	realPlanReviewPreview.recordUserMessage(realPlanReview.advisorQuestion);
	const realAskContextText = `<primary-context end="${realPlanReview.primaryTranscriptEndIndex}" state="idle">
**user**:
${realPlanReview.primaryUser}

**primary**:
${realPlanReview.primaryAssistantTexts.join("\n\n")}
</primary-context>`;
	realPlanReviewPreview.recordContext({
		primaryTranscriptEndIndex: realPlanReview.primaryTranscriptEndIndex,
		primaryAgentLoopState: "idle",
		askContext: {
			primaryUserMessageIndex: 0,
			userText: realPlanReview.primaryUser,
			assistantTexts: realPlanReview.primaryAssistantTexts,
		},
		text: realAskContextText,
	});
	const realPullPayload = `<primary-transcript start="${realPlanReview.pullRange.start}" end="${realPlanReview.pullRange.end}" total="${realPlanReview.pullRange.total}" state="idle" wait="new_messages" waited-ms="${realPlanReview.pullRange.waitedMs}">
**agent**:
${realPlanReview.primaryAssistantTexts.at(-1) ?? ""}
</primary-transcript>
`;
	realPlanReviewPreview.applyAgentEvent({
		type: "tool_execution_start",
		toolCallId: "real-plan-review-pull",
		toolName: "pull_transcript",
		args: { since_index: realPlanReview.pullRange.start, count: 20, timeout_ms: 0 },
	} as AgentSessionEvent);
	realPlanReviewPreview.applyAgentEvent({
		type: "tool_execution_end",
		toolCallId: "real-plan-review-pull",
		toolName: "pull_transcript",
		result: {
			content: [{ type: "text", text: realPullPayload }],
			details: {
				start: realPlanReview.pullRange.start,
				end: realPlanReview.pullRange.end,
				total: realPlanReview.pullRange.total,
				primaryAgentLoopState: "idle",
				waitResult: "new_messages",
				waitedMs: realPlanReview.pullRange.waitedMs,
				sinceIndexOutOfBounds: false,
				omittedAdvisorAdviceCount: 0,
				displayItems: [{ kind: "agent", text: realPlanReview.primaryAssistantTexts.at(-1) ?? "" }],
			} satisfies PullTranscriptDetails,
		},
		isError: false,
	} as AgentSessionEvent);
	realPlanReviewPreview.setStatus("idle");

	const toolBlocks = new AdvisorOverlayState();
	toolBlocks.setContextUsage({ tokens: 4_352, contextWindow: 128_000, percent: 3.4 });
	toolBlocks.recordUserMessage("帮我审查 Pull 的错误处理和 Advice 送达顺序。");
	toolBlocks.applyAgentEvent({
		type: "tool_execution_start",
		toolCallId: "grep-pending-1",
		toolName: "grep",
		args: { pattern: "resolvePullCursor" },
	} as AgentSessionEvent);
	toolBlocks.applyAgentEvent({
		type: "tool_execution_start",
		toolCallId: "read-success-1",
		toolName: "read",
		args: { path: "extensions/advisor/session.ts" },
	} as AgentSessionEvent);
	toolBlocks.applyAgentEvent({
		type: "tool_execution_end",
		toolCallId: "read-success-1",
		toolName: "read",
		result: "const cursor = resolvePullCursor(request);\nreturn await pullTranscript(cursor);",
		isError: false,
	} as AgentSessionEvent);
	toolBlocks.applyAgentEvent({
		type: "tool_execution_start",
		toolCallId: "write-error-1",
		toolName: "write",
		args: { path: "extensions/advisor/session.ts" },
	} as AgentSessionEvent);
	toolBlocks.applyAgentEvent({
		type: "tool_execution_end",
		toolCallId: "write-error-1",
		toolName: "write",
		result: "EACCES: permission denied\n无法写入 session.ts",
		isError: true,
	} as AgentSessionEvent);
	toolBlocks.applyAgentEvent({
		type: "message_end",
		message: {
			role: "toolResult",
			toolCallId: "write-error-1",
			toolName: "write",
			content: [{ type: "text", text: "EACCES: permission denied\n无法写入 session.ts" }],
			details: {},
			isError: true,
			timestamp: Date.now(),
		},
	} as AgentSessionEvent);
	toolBlocks.applyAgentEvent({
		type: "tool_execution_start",
		toolCallId: "advise-hint-1",
		toolName: "advise",
		args: { kind: "hint", advice: "先校验游标，再进入等待分支。" },
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
		args: { kind: "concern", advice: "写入失败时不要继续发送完成通知。" },
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
			content: [{ type: "text", text: "主要风险已经标注，建议补完错误路径后再提交。" }],
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
			requiredText: ["Advisor · idle · ctx ?/128k", "帮我审查这个方案"],
			checklist: [
				"Focused Advisor input shows one reverse-video software cursor.",
				"The draft remains readable around the focused cursor.",
				"Border geometry stays unchanged when focus adds the cursor marker.",
			],
			state: empty,
			draft: "帮我审查这个方案",
		},
		{
			id: "overlay-ask-advisor",
			title: "Ask Advisor Overlay Transcript",
			width: 78,
			height: 30,
			requiredText: [
				"帮我检查这次 Pull 改动，重点看会不会漏消息。",
				"Context · 3 msgs",
				"user: 给 Pull 增加等待新消息的能力，并补齐游标越界处理。",
				"agent: 等待分支已经接入。",
				"agent: 游标越界时会从当前 transcript 末尾继续。",
				"我在对照游标推进、等待唤醒和越界恢复的时序。",
				"Pull [0, 12) → 8 msgs · 4.2s",
				"... (3 more lines, ctrl+o to expand)",
				"还需要覆盖等待期间 Primary 结束但没有新消息的场景。",
			],
			forbiddenText: [
				"Context →",
				"pull_transcript",
				"result",
				"total=12",
				"等待分支已经接入，接下来补充越界场景。",
				"→ edit e2e/features/pull-transcript.feature",
				"→ bash! just test-e2e",
			],
			expectedForegroundText: [
				{ color: "customMessageLabel", text: "Context" },
				{ color: "customMessageText", text: "· 3 msgs" },
				{ color: "dim", text: "user:" },
				{ color: "text", text: "给 Pull 增加等待新消息的能力，并补齐游标越界处理。" },
				{ color: "dim", text: "agent:" },
				{ color: "text", text: "等待分支已经接入。" },
				{ color: "text", text: "游标越界时会从当前 transcript 末尾继续。" },
				{ color: "text", text: "我先检查 Pull 的游标推进和等待逻辑。" },
				{ color: "thinkingText", text: "我在对照游标推进、等待唤醒和越界恢复的时序。" },
			],
			expectedItalicText: ["我在对照游标推进、等待唤醒和越界恢复的时序。", "... (3 more lines, ctrl+o to expand)"],
			expectedBoldText: ["Context", "Pull"],
			checklist: [
				"Context is one customMessageBg block whose header reports three injected Primary messages.",
				"Context and Pull use the same text color for Primary user/agent content while keeping dim role prefixes.",
				"Thinking uses thinkingText in italic with no background block.",
				"Collapsed Pull uses toolSuccessBg, shows at most five visual lines, and ends with the ctrl+o expansion hint.",
				"Second Opinion text remains visible without exposing Pull arguments or raw result details.",
			],
			state: askAdvisor,
		},
		{
			id: "overlay-expanded-pull",
			title: "Expanded Pull Transcript Block",
			width: 78,
			height: 30,
			requiredText: [
				"Pull [0, 12) → 8 msgs · 4.2s",
				'<primary-transcript start="0" end="12"',
				'state="idle"',
				'wait="new_messages"',
				"</primary-transcript>",
				"**user**:",
				"// inspect cursor advancement and wake-up ordering before editing",
				"```diff",
				"+const shouldWait = timeoutMs > 0;",
				"→ bash(just test-e2e) ⇒ ok · 29 scenarios",
			],
			forbiddenText: ["more, ctrl+o to expand", "pull_transcript"],
			expectedForegroundText: [
				{ color: "toolTitle", text: "Pull" },
				{ color: "text", text: pullPayload },
			],
			expectedBoldText: ["Pull"],
			checklist: [
				"Expanded Pull keeps the same toolSuccessBg block boundary and header.",
				"The exact tool-result payload is visible, including its status header, role markers, tool intent, and diff fence.",
				"The collapsed-state expansion hint is absent.",
			],
			state: expandedPull,
		},
		{
			id: "overlay-unbound-pull-expansion",
			title: "Pull With Unbound Expansion Action",
			width: 78,
			height: 16,
			requiredText: ["Pull [0, 12) → 8 msgs · 4.2s", "... (3 more lines)"],
			forbiddenText: ["to expand", "ctrl+o"],
			expectedForegroundText: [{ color: "toolTitle", text: "Pull" }],
			expectedItalicText: ["... (3 more lines)"],
			expectedBoldText: ["Pull"],
			checklist: [
				"The Pull preview remains collapsed when app.tools.expand is unbound.",
				"The truncation row reports hidden visual lines without advertising an unavailable shortcut.",
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
			requiredText: ["Advisor · idle", "Context · 2 msgs", "primaryTranscriptCursor"],
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
			id: "overlay-context-preview",
			title: "Collapsed Ask Context Preview",
			width: 78,
			height: 16,
			requiredText: [
				"Context · 7 msgs",
				"user: 帮我检查数据库迁移是否可以安全回滚。",
				"agent: 现在补充回滚场景。",
				"... (2 more lines, ctrl+o to expand)",
			],
			forbiddenText: ["Context →", "迁移测试正在运行。", "迁移和回滚测试都已通过。"],
			expectedForegroundText: [
				{ color: "customMessageLabel", text: "Context" },
				{ color: "dim", text: "user:" },
				{ color: "dim", text: "agent:" },
			],
			expectedItalicText: ["... (2 more lines, ctrl+o to expand)"],
			expectedBoldText: ["Context"],
			checklist: [
				"Collapsed Context uses the same five-visual-line preview limit as Pull.",
				"The compact header reports all seven injected Primary messages.",
				"The expansion hint reports the two hidden Context visual lines.",
			],
			state: contextPreview,
		},
		{
			id: "overlay-repeated-ask",
			title: "Repeated Ask Without New Context",
			width: 50,
			height: 16,
			requiredText: ["同一个结论能换个角度解释吗？", "Context · 0 msgs", "Advisor 会复用已有上下文"],
			forbiddenText: ["Context →", "User → Primary"],
			checklist: [
				"The repeated Ask remains visible with a full-row background on both wrapped rows.",
				"A compact Context · 0 msgs block makes the position-only injection explicit without repeating Primary text.",
				"The advisor answer follows directly.",
			],
			state: repeatedAsk,
		},
		{
			id: "overlay-real-plan-review-preview",
			title: "Real Model Plan Review Preview",
			width: 78,
			height: 28,
			requiredText: [
				realPlanReview.advisorQuestion,
				"Context · 4 msgs",
				"user: 我想给 Advisor 增加一个导出当前对话为 Markdown 的命令。",
				"more lines, ctrl+o to expand",
				"Pull [36, 37) → 1 msg · 0.0s",
			],
			forbiddenText: ["### 五、文件变更清单", "Context →", "<primary-context", "**agent**:"],
			expectedBoldText: ["Context", "Pull"],
			checklist: [
				"The fixture provenance identifies the local DeepSeek V4 Pro and GPT-5.6 Advisor interaction.",
				"A multi-thousand-character Primary plan remains bounded to five visual lines in both Context and Pull.",
				"The complete verbatim Context and Pull payloads remain available in state for Ctrl+O expansion.",
			],
			state: realPlanReviewPreview,
		},
		{
			id: "overlay-tool-and-advice-blocks",
			title: "Tool And Advice Blocks",
			width: 96,
			height: 34,
			requiredText: [
				'grep {"pattern":"resolvePullCursor"} ⇒ pending',
				'read {"path":"extensions/advisor/session.ts"} ⇒ ok · 2 lines',
				'write {"path":"extensions/advisor/session.ts"} ⇒ error · 2 lines',
				"EACCES: permission denied",
				"无法写入 session.ts",
				"Hint: 先校验游标，再进入等待分支。",
				"Concern: 写入失败时不要继续发送完成通知。",
				"主要风险已经标注，建议补完错误路径后再提交。",
			],
			forbiddenText: ["Prompt", "Tool ", "↳", "advise hint", "advise concern", "delivered hint"],
			expectedForegroundText: [
				{ color: "toolTitle", text: "grep" },
				{ color: "toolTitle", text: "read" },
				{ color: "toolTitle", text: "write" },
				{ color: "text", text: "Hint:" },
				{ color: "text", text: "Concern:" },
				{ color: "text", text: "先校验游标，再进入等待分支。" },
				{ color: "text", text: "写入失败时不要继续发送完成通知。" },
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
		const screen = component.render(scenario.width).join("\n").replaceAll(CURSOR_MARKER, "");
		const fullWidthBackgroundRows = backgroundRows
			.filter((row) => visibleWidth(row.text) === scenario.width - 2)
			.map((row) => ({ color: row.color, text: row.text.trimEnd() }));
		const fullWidthBackgroundBlocks = fullWidthBackgroundRows.reduce<Array<{ color: string; lines: string[] }>>(
			(blocks, row, index, rows) => {
				const previousBlock = blocks.at(-1);
				const startsNextBlock =
					row.text === "" &&
					previousBlock?.lines.at(-1) === "" &&
					rows[index + 1]?.color === row.color &&
					rows[index + 1]?.text !== "";
				if (previousBlock?.color === row.color && !startsNextBlock) {
					previousBlock.lines.push(row.text);
				} else {
					blocks.push({ color: row.color, lines: [row.text] });
				}
				return blocks;
			},
			[],
		);
		return {
			snapshot: { screen, styles: { fullWidthBackgroundBlocks } },
			foregroundText,
			italicText,
			boldText,
		};
	} finally {
		if (previousRows) {
			Object.defineProperty(process.stdout, "rows", previousRows);
		} else {
			Reflect.deleteProperty(process.stdout, "rows");
		}
	}
}
