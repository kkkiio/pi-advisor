import { describe, expect, it, vi } from "vitest";
import {
	AuthStorage,
	DefaultResourceLoader,
	ModelRegistry,
	SessionManager,
	createAgentSession,
	type AgentSession,
	type ExtensionAPI,
	type ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall, type Context } from "@earendil-works/pi-ai";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AdvisorRuntime } from "../../../extensions/advisor/session";
import type { AdvisorSettingsStore } from "../../../extensions/advisor/settings";
import { createAdvisorTools } from "../../../extensions/advisor/tools";
import type { AdvisorRuntimePort } from "../../../extensions/advisor/types";

describe("Feature: Watch Run", () => {
	it("Scenario: Advisor pulls transcript, then calls advise", async () => {
		const provider = fauxProvider({ tokensPerSecond: 0 });
		const agentDir = await mkdtemp(join(tmpdir(), "pi-advisor-sdk-"));
		const calls: string[] = [];
		const model = provider.getModel();
		const authStorage = AuthStorage.inMemory();
		authStorage.setRuntimeApiKey(model.provider, "test-faux-key");
		const modelRegistry = ModelRegistry.inMemory(authStorage);
		modelRegistry.registerProvider(model.provider, {
			api: model.api,
			baseUrl: model.baseUrl,
			apiKey: "test-faux-key",
			streamSimple: provider.provider.streamSimple,
			models: provider.models,
		});
		const runtime: AdvisorRuntimePort = {
			async pullTranscript() {
				calls.push("pull_transcript");
				return {
					text: "[0, 1) primary_agent_loop_state=running wait_result=new_messages waited_ms=0\n\n**user**:\nShip it.\n",
					details: {
						start: 0,
						end: 1,
						total: 1,
						primaryAgentLoopState: "running",
						waitResult: "new_messages",
						waitedMs: 0,
						sinceIndexOutOfBounds: false,
						omittedAdvisorAdviceCount: 0,
					},
				};
			},
			async deliverAdvice(request) {
				calls.push(`advise:${request.kind}`);
				return {
					id: "adv_test",
					kind: request.kind,
					deliverAs: "steer",
					content: request.advice,
					details: {
						origin: "advisor",
						advisorAdviceKind: request.kind,
						deliverAs: "steer",
						createdAt: 1,
					},
					autoResumeSuppressed: false,
				};
			},
		};

		try {
			provider.setResponses([
				fauxAssistantMessage(fauxToolCall("pull_transcript", { since_index: 0, timeout_ms: 0, count: 5 }), {
					stopReason: "toolUse",
				}),
				fauxAssistantMessage(
					fauxToolCall("advise", {
						kind: "hint",
						advice: "Use the existing release helper.",
					}),
					{ stopReason: "toolUse" },
				),
				fauxAssistantMessage("Done."),
			]);
			const resourceLoader = new DefaultResourceLoader({
				cwd: process.cwd(),
				agentDir,
				noExtensions: true,
				systemPrompt: "You are Advisor. Pull before advising.",
			});
			await resourceLoader.reload();
			const { session } = await createAgentSession({
				cwd: process.cwd(),
				agentDir,
				authStorage,
				modelRegistry,
				sessionManager: SessionManager.inMemory(process.cwd()),
				model,
				tools: ["pull_transcript", "advise"],
				customTools: createAdvisorTools(runtime),
				resourceLoader,
			});

			await session.prompt("Start Watch Run.", { expandPromptTemplates: false });

			expect(calls).toEqual(["pull_transcript", "advise:hint"]);
			expect(provider.getPendingResponseCount()).toBe(0);
			session.dispose();
		} finally {
			modelRegistry.unregisterProvider(model.provider);
			await rm(agentDir, { recursive: true, force: true });
		}
	});

	it("Scenario: Advisor inherits Primary tools without write or edit", async () => {
		const provider = fauxProvider({ tokensPerSecond: 0 });
		const model = provider.getModel();
		const authStorage = AuthStorage.inMemory();
		authStorage.setRuntimeApiKey(model.provider, "test-faux-key");
		const modelRegistry = ModelRegistry.inMemory(authStorage);
		modelRegistry.registerProvider(model.provider, {
			api: model.api,
			baseUrl: model.baseUrl,
			apiKey: "test-faux-key",
			streamSimple: provider.provider.streamSimple,
			models: [
				{
					id: model.id,
					name: model.name,
					api: model.api,
					baseUrl: model.baseUrl,
					reasoning: model.reasoning,
					thinkingLevelMap: model.thinkingLevelMap,
					input: model.input,
					cost: model.cost,
					contextWindow: model.contextWindow,
					maxTokens: model.maxTokens,
				},
			],
		});
		const pi = {
			getActiveTools: () => ["read", "bash", "grep", "edit", "write"],
		} as unknown as ExtensionAPI;
		const settingsStore = {
			path: "memory://advisor.json",
			read: async () => ({ model: `${model.provider}/${model.id}` }),
		} as AdvisorSettingsStore;
		const ctx = {
			cwd: process.cwd(),
			hasUI: false,
			model,
			modelRegistry,
			ui: { notify() {} },
		} as unknown as ExtensionCommandContext;
		const runtime = new AdvisorRuntime(pi, settingsStore);

		try {
			const session = await (
				runtime as unknown as {
					ensureSession(ctx: ExtensionCommandContext): Promise<{ getActiveToolNames(): string[] } | undefined>;
				}
			).ensureSession(ctx);
			const activeTools = session?.getActiveToolNames() ?? [];

			expect(activeTools).toEqual(expect.arrayContaining(["read", "bash", "grep", "pull_transcript", "advise"]));
			expect(activeTools).not.toContain("edit");
			expect(activeTools).not.toContain("write");
		} finally {
			await runtime.dispose();
			modelRegistry.unregisterProvider(model.provider);
		}
	});
});

describe("Feature: Ask Context", () => {
	it("Scenario: Ask Context is attached once per Primary user turn and resets with Advisor session", async () => {
		const provider = fauxProvider({ tokensPerSecond: 0 });
		const model = provider.getModel();
		const authStorage = AuthStorage.inMemory();
		authStorage.setRuntimeApiKey(model.provider, "test-faux-key");
		const modelRegistry = ModelRegistry.inMemory(authStorage);
		modelRegistry.registerProvider(model.provider, {
			api: model.api,
			baseUrl: model.baseUrl,
			apiKey: "test-faux-key",
			streamSimple: provider.provider.streamSimple,
			models: provider.models,
		});
		const capturedQuestions: string[] = [];
		const capturedContexts: string[] = [];
		const captureRequest = (context: Context) => {
			const requestTexts = context.messages
				.filter((message) => message.role === "user")
				.map((message) =>
					typeof message.content === "string"
						? message.content
						: message.content
								.filter((part) => part.type === "text")
								.map((part) => (part.type === "text" ? part.text : ""))
								.join("\n"),
				);
			const question = requestTexts.at(-1);
			const askContext = requestTexts.at(-2);
			if (!question || !askContext) {
				throw new Error("Advisor request did not contain separate context and user messages.");
			}
			capturedQuestions.push(question);
			capturedContexts.push(askContext);
			return fauxAssistantMessage(`Second Opinion ${capturedQuestions.length}.`);
		};
		provider.setResponses([captureRequest, captureRequest, captureRequest, captureRequest]);
		const primarySessionManager = SessionManager.inMemory(process.cwd());
		primarySessionManager.appendMessage({
			role: "user",
			content: [{ type: "text", text: "Review the cache design." }],
			timestamp: 1,
		});
		primarySessionManager.appendMessage(
			fauxAssistantMessage(
				[fauxText("The cache now owns request deduplication."), fauxToolCall("read", { path: "SECRET_TOOL_PATH" })],
				{ stopReason: "toolUse", timestamp: 2 },
			),
		);
		const pi = { getActiveTools: () => [] } as unknown as ExtensionAPI;
		const settingsStore = {
			path: "memory://advisor.json",
			read: async () => ({ model: `${model.provider}/${model.id}` }),
		} as AdvisorSettingsStore;
		const ctx = {
			cwd: process.cwd(),
			hasUI: false,
			model,
			modelRegistry,
			sessionManager: primarySessionManager,
			isIdle: () => true,
			ui: { notify() {} },
		} as unknown as ExtensionCommandContext;
		const runtime = new AdvisorRuntime(pi, settingsStore);

		try {
			await runtime.ask("First review.", ctx);
			await (runtime as unknown as { askCompletion?: Promise<void> }).askCompletion;
			await runtime.ask("Explain it again.", ctx);
			await (runtime as unknown as { askCompletion?: Promise<void> }).askCompletion;
			await runtime.reset(ctx);
			await runtime.ask("Review after reset.", ctx);
			await (runtime as unknown as { askCompletion?: Promise<void> }).askCompletion;
			primarySessionManager.appendMessage({
				role: "user",
				content: [{ type: "text", text: "Now review the streaming response." }],
				timestamp: 3,
			});
			runtime.handlePrimaryEvent({ type: "agent_start" }, ctx);
			runtime.handlePrimaryEvent(
				{
					type: "message_update",
					message: fauxAssistantMessage(
						[
							fauxText("The streaming response is already visible."),
							fauxToolCall("bash", { command: "SECRET_STREAMING_TOOL" }),
						],
						{ stopReason: "toolUse", timestamp: 4 },
					),
				},
				ctx,
			);
			await runtime.ask("Review while Primary is running.", ctx);
			await (runtime as unknown as { askCompletion?: Promise<void> }).askCompletion;

			expect(capturedQuestions).toEqual([
				"First review.",
				"Explain it again.",
				"Review after reset.",
				"Review while Primary is running.",
			]);
			expect(capturedContexts[0]).toContain("primary_transcript_end_index=2");
			expect(capturedContexts[0]).toContain("Ask Context:");
			expect(capturedContexts[0]).toContain("Review the cache design.");
			expect(capturedContexts[0]).toContain("The cache now owns request deduplication.");
			expect(capturedContexts[0]).not.toContain("SECRET_TOOL_PATH");
			expect(capturedContexts[1]).toContain("primary_transcript_end_index=2");
			expect(capturedContexts[1]).not.toContain("Ask Context:");
			expect(capturedContexts[2]).toContain("Ask Context:");
			expect(capturedContexts[2]).toContain("Review the cache design.");
			expect(capturedContexts[3]).toContain("primary_transcript_end_index=4");
			expect(capturedContexts[3]).toContain("primary_agent_loop_state=running");
			expect(capturedContexts[3]).toContain("Now review the streaming response.");
			expect(capturedContexts[3]).toContain("The streaming response is already visible.");
			expect(capturedContexts[3]).not.toContain("SECRET_STREAMING_TOOL");
		} finally {
			await runtime.dispose();
			modelRegistry.unregisterProvider(model.provider);
		}
	});

	it("Scenario: A busy Advisor rejects Ask and restores the complete command", async () => {
		const provider = fauxProvider({ tokensPerSecond: 0 });
		const model = provider.getModel();
		const authStorage = AuthStorage.inMemory();
		authStorage.setRuntimeApiKey(model.provider, "test-faux-key");
		const modelRegistry = ModelRegistry.inMemory(authStorage);
		modelRegistry.registerProvider(model.provider, {
			api: model.api,
			baseUrl: model.baseUrl,
			apiKey: "test-faux-key",
			streamSimple: provider.provider.streamSimple,
			models: provider.models,
		});
		provider.setResponses([
			fauxAssistantMessage(fauxToolCall("pull_transcript", { since_index: 0, timeout_ms: 20_000, count: 1 }), {
				stopReason: "toolUse",
			}),
		]);
		const notifications: Array<{ message: string; type: string }> = [];
		let editorText = "";
		const settingsStore = {
			path: "memory://advisor.json",
			read: async () => ({ model: `${model.provider}/${model.id}` }),
		} as AdvisorSettingsStore;
		const ctx = {
			cwd: process.cwd(),
			hasUI: false,
			model,
			modelRegistry,
			sessionManager: SessionManager.inMemory(process.cwd()),
			isIdle: () => true,
			ui: {
				notify(message: string, type: string) {
					notifications.push({ message, type });
				},
				setEditorText(text: string) {
					editorText = text;
				},
			},
		} as unknown as ExtensionCommandContext;
		const runtime = new AdvisorRuntime({ getActiveTools: () => [] } as unknown as ExtensionAPI, settingsStore);
		const session = await (
			runtime as unknown as {
				ensureSession(ctx: ExtensionCommandContext): Promise<AgentSession | undefined>;
			}
		).ensureSession(ctx);
		if (!session) {
			throw new Error("Advisor session was not created.");
		}
		const running = session.prompt("Keep Advisor occupied.", { expandPromptTemplates: false });

		try {
			await vi.waitFor(() => expect(session.isStreaming).toBe(true), { timeout: 2_000 });
			const messageCount = session.state.messages.length;
			await runtime.ask("Keep this question.", ctx);

			expect(editorText).toBe("/advisor Keep this question.");
			expect(notifications).toContainEqual({
				message: "Advisor is busy. Try again when the current run finishes.",
				type: "warning",
			});
			expect(session.state.messages).toHaveLength(messageCount);
			expect(
				(runtime as unknown as { lastInjectedPrimaryUserIndex?: number }).lastInjectedPrimaryUserIndex,
			).toBeUndefined();
		} finally {
			await session.abort();
			await running;
			await runtime.dispose();
			modelRegistry.unregisterProvider(model.provider);
		}
	});
});
