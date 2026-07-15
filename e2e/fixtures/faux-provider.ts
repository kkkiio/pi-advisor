import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { appendFileSync } from "node:fs";
import {
	fauxAssistantMessage,
	fauxText,
	fauxToolCall,
	fauxProvider,
	type Context,
	type Model,
	type StreamOptions,
} from "@earendil-works/pi-ai";

const providerName = "advisor-e2e";
const primaryModelId = "faux-primary";
const advisorModelId = "faux-advisor";

export default function advisorE2EFauxProvider(pi: ExtensionAPI): void {
	const script = process.env.PI_ADVISOR_TEST_SCRIPT ?? "default";
	const registration = fauxProvider({
		provider: providerName,
		tokensPerSecond: script === "ask-context-streaming" ? 2 : 0,
		tokenSize: { min: 3, max: 3 },
		models: [
			{ id: primaryModelId, name: "Advisor E2E Primary Faux", reasoning: false },
			{ id: advisorModelId, name: "Advisor E2E Advisor Faux", reasoning: true },
		],
	});
	registration.setResponses(Array.from({ length: 200 }, () => scriptedResponse));
	pi.registerProvider(providerName, {
		name: "Advisor E2E Faux",
		baseUrl: "http://localhost:0",
		apiKey: "PI_ADVISOR_TEST_FAUX_API_KEY",
		api: registration.api as any,
		streamSimple: registration.provider.streamSimple as any,
		models: registration.models.map((model) => ({
			id: model.id,
			name: model.name,
			api: model.api as any,
			reasoning: model.reasoning,
			thinkingLevelMap: model.thinkingLevelMap,
			input: model.input,
			cost: model.cost,
			contextWindow: model.contextWindow,
			maxTokens: model.maxTokens,
		})),
	});
}

function scriptedResponse(
	context: Context,
	_options: StreamOptions | undefined,
	_state: unknown,
	model: Model<string>,
) {
	const script = process.env.PI_ADVISOR_TEST_SCRIPT ?? "default";
	const latestUserMessage = [...context.messages].reverse().find((message) => message.role === "user");
	const latestContextMessage = [...context.messages]
		.reverse()
		.find((message) => message.role === "user" && contentText(message.content).includes("<primary-context "));
	if (model.id === advisorModelId && process.env.PI_ADVISOR_TEST_OBSERVATIONS_PATH) {
		const latestQuestionText = latestUserMessage ? contentText(latestUserMessage.content) : "";
		const latestContextText = latestContextMessage ? contentText(latestContextMessage.content) : "";
		const askContextMessageCount = context.messages.filter(
			(message) => message.role === "user" && contentText(message.content).includes("<primary-context "),
		).length;
		appendFileSync(
			process.env.PI_ADVISOR_TEST_OBSERVATIONS_PATH,
			`${JSON.stringify({
				latestQuestionText,
				latestRequestText: [latestContextText, latestQuestionText].filter(Boolean).join("\n\n"),
				latestPullTranscriptText: toolResultText(context, "pull_transcript"),
				askContextMessageCount,
				messageCount: context.messages.length,
				toolNames: context.tools?.map((tool) => tool.name) ?? [],
			})}\n`,
			"utf8",
		);
	}
	if (model.id === primaryModelId) {
		if (script === "visual-overlay-pull-collapse") {
			const request = latestUserMessage ? contentText(latestUserMessage.content) : "";
			if (request.includes("先检查 Pull 的游标推进逻辑") && !hasToolResult(context, "read")) {
				return fauxAssistantMessage(
					[fauxText("我先确认项目里的测试约定。"), fauxToolCall("read", { path: "README.md" })],
					{ stopReason: "toolUse" },
				);
			}
			if (request.includes("先检查 Pull 的游标推进逻辑")) {
				return fauxAssistantMessage("游标会在每次 Pull 成功后推进到 transcript 末尾。");
			}
			if (request.includes("接着补上等待期间的超时处理")) {
				return fauxAssistantMessage("等待超时会返回当前游标，不会跳过后续消息。");
			}
			if (request.includes("最后补齐游标越界场景")) {
				return fauxAssistantMessage("越界场景已经覆盖，下一次 Pull 会从当前末尾继续。");
			}
		}
		if (script === "overlay-pull-collapse") {
			const request = latestUserMessage ? contentText(latestUserMessage.content) : "";
			if (request.includes("PRIMARY_CHAT_USER_1") && !hasToolResult(context, "read")) {
				return fauxAssistantMessage([fauxText("PRIMARY_CHAT_AGENT_2"), fauxToolCall("read", { path: "README.md" })], {
					stopReason: "toolUse",
				});
			}
			if (request.includes("PRIMARY_CHAT_USER_1")) {
				return fauxAssistantMessage("PRIMARY_CHAT_AGENT_4");
			}
			if (request.includes("PRIMARY_CHAT_USER_5")) {
				return fauxAssistantMessage("PRIMARY_CHAT_AGENT_6");
			}
			if (request.includes("PRIMARY_CHAT_USER_7")) {
				return fauxAssistantMessage("PRIMARY_CHAT_AGENT_8");
			}
		}
		if (script === "readme") {
			return fauxAssistantMessage(
				fauxText("Implemented request deduplication and eviction of failed in-flight entries."),
			);
		}
		if (script === "visual-natural") {
			return fauxAssistantMessage("Primary 已完成 Pull 游标调整，并补充了等待和越界场景。");
		}
		if (script === "ask-context" && !hasToolResult(context, "read")) {
			return fauxAssistantMessage(
				[fauxText("The cache now owns request deduplication."), fauxToolCall("read", { path: "SECRET_TOOL_PATH" })],
				{ stopReason: "toolUse" },
			);
		}
		if (script === "ask-context") {
			return fauxAssistantMessage("The cache review is complete.");
		}
		if (script === "ask-context-streaming" && !hasToolResult(context, "read")) {
			return fauxAssistantMessage(
				[
					fauxText("The streaming response is already visible."),
					fauxToolCall("read", { path: "SECRET_STREAMING_TOOL" }),
				],
				{ stopReason: "toolUse" },
			);
		}
		if (script === "ask-context-streaming") {
			return fauxAssistantMessage("The streaming review is complete.");
		}
		return fauxAssistantMessage(fauxText("E2E_PRIMARY_RESPONSE: primary agent completed a deterministic faux turn."));
	}
	const isWatchRun = context.messages.some(
		(message) =>
			message.role === "user" &&
			contentText(message.content).includes("Start a Watch Run for the current Primary Agent task."),
	);
	const isUserDirectedAdvice = context.messages.some(
		(message) =>
			message.role === "user" && contentText(message.content).includes("Send only this concern to Primary Agent"),
	);
	if (script === "ask-context" || script === "ask-context-streaming") {
		return fauxAssistantMessage("E2E_ASK_CONTEXT_RECORDED");
	}
	if (!hasToolResult(context, "pull_transcript")) {
		return fauxAssistantMessage(
			fauxToolCall("pull_transcript", {
				since_index: 0,
				timeout_ms: script === "advisor-busy" ? 3_000 : script === "watch-wait" ? 15_000 : 0,
				count: 20,
			}),
			{ stopReason: "toolUse" },
		);
	}
	if (script === "watch-wait") {
		return fauxAssistantMessage("E2E_WATCH_WAIT_DONE");
	}
	if (!isWatchRun) {
		if (isUserDirectedAdvice && !hasToolResult(context, "advise")) {
			return fauxAssistantMessage(
				fauxToolCall("advise", {
					kind: "concern",
					advice: "E2E_USER_REQUESTED_ADVICE: preserve the cache entry identity check.",
				}),
				{ stopReason: "toolUse" },
			);
		}
		if (isUserDirectedAdvice) {
			return fauxAssistantMessage("E2E_USER_REQUESTED_ADVICE_DONE");
		}
		if (script === "readme") {
			return fauxAssistantMessage(
				"The direction is sound. One concern: a failed request may delete a newer in-flight entry. Guard eviction by entry identity before committing.",
			);
		}
		if (script === "visual-overlay-pull-collapse") {
			return fauxAssistantMessage(
				"整体时序是连贯的；建议再覆盖等待期间 Primary 正好结束、但没有产生新消息的边界情况。",
			);
		}
		if (script === "visual-natural") {
			return fauxAssistantMessage("实现方向合理。重点确认游标只在成功读取后推进，并保留超时后的当前位置。");
		}
		const primaryTranscriptState = toolResultText(context, "pull_transcript").includes("E2E_PRIMARY_SENTINEL")
			? "seen"
			: "missing";
		return fauxAssistantMessage(`E2E_SECOND_OPINION: primary_transcript=${primaryTranscriptState}`);
	}
	if (!hasToolResult(context, "advise")) {
		const primaryTranscriptState = toolResultText(context, "pull_transcript").includes("E2E_PRIMARY_SENTINEL")
			? "seen"
			: "missing";
		const adviceKind = script === "watch-hint" ? "hint" : "concern";
		return fauxAssistantMessage(
			fauxToolCall("advise", {
				kind: adviceKind,
				advice: `E2E_WATCH_${adviceKind.toUpperCase()}: primary_transcript=${primaryTranscriptState}`,
			}),
			{ stopReason: "toolUse" },
		);
	}
	return fauxAssistantMessage("E2E_ADVISOR_DONE");
}

function hasToolResult(context: Context, toolName: string): boolean {
	return context.messages.some((message) => message.role === "toolResult" && message.toolName === toolName);
}

function toolResultText(context: Context, toolName: string): string {
	return context.messages
		.filter((message) => message.role === "toolResult" && message.toolName === toolName)
		.map((message) => contentText(message.content))
		.join("\n");
}

function contentText(content: Context["messages"][number]["content"]): string {
	if (typeof content === "string") {
		return content;
	}
	return content
		.map((block) =>
			block && typeof block === "object" && "text" in block && typeof block.text === "string" ? block.text : "",
		)
		.join("\n");
}
