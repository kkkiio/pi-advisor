import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	fauxAssistantMessage,
	fauxText,
	fauxToolCall,
	registerFauxProvider,
	type Context,
	type Model,
	type StreamOptions,
} from "@earendil-works/pi-ai";

const providerName = "advisor-e2e";
const primaryModelId = "faux-primary";
const advisorModelId = "faux-advisor";

export default function advisorE2EFauxProvider(pi: ExtensionAPI): void {
	const registration = registerFauxProvider({
		provider: providerName,
		tokensPerSecond: 0,
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
		models: registration.models.map(model => ({
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

function scriptedResponse(context: Context, _options: StreamOptions | undefined, _state: unknown, model: Model<string>) {
	if (model.id === primaryModelId) {
		return fauxAssistantMessage(
			fauxText("E2E_PRIMARY_RESPONSE: primary agent completed a deterministic faux turn."),
		);
	}
	const isWatchRun = context.messages.some(
		message =>
			message.role === "user" &&
			contentText(message.content).includes("Start a Watch Run for the current Primary Agent task."),
	);
	if (!hasToolResult(context, "pull_transcript")) {
		return fauxAssistantMessage(
			fauxToolCall("pull_transcript", {
				since_index: 0,
				timeout_ms: process.env.PI_ADVISOR_TEST_SCRIPT === "watch-wait" ? 15_000 : 0,
				count: 20,
			}),
			{ stopReason: "toolUse" },
		);
	}
	if (process.env.PI_ADVISOR_TEST_SCRIPT === "watch-wait") {
		return fauxAssistantMessage("E2E_WATCH_WAIT_DONE");
	}
	if (!hasToolResult(context, "advise")) {
		const primaryTranscriptState = toolResultText(context, "pull_transcript").includes("E2E_PRIMARY_SENTINEL")
			? "seen"
			: "missing";
		const kind = isWatchRun ? "concern" : "hint";
		const marker = isWatchRun ? "E2E_WATCH_CONCERN" : "E2E_ASK_HINT";
		return fauxAssistantMessage(
			fauxToolCall("advise", {
				kind,
				advice: `${marker}: primary_transcript=${primaryTranscriptState}`,
			}),
			{ stopReason: "toolUse" },
		);
	}
	return fauxAssistantMessage("E2E_ADVISOR_DONE");
}

function hasToolResult(context: Context, toolName: string): boolean {
	return context.messages.some(message => message.role === "toolResult" && message.toolName === toolName);
}

function toolResultText(context: Context, toolName: string): string {
	return context.messages
		.filter(message => message.role === "toolResult" && message.toolName === toolName)
		.map(message => contentText(message.content))
		.join("\n");
}

function contentText(content: Context["messages"][number]["content"]): string {
	if (typeof content === "string") {
		return content;
	}
	return content
		.map(block => (block && typeof block === "object" && "text" in block && typeof block.text === "string" ? block.text : ""))
		.join("\n");
}
