import { describe, expect, it } from "vitest";
import {
	AuthStorage,
	DefaultResourceLoader,
	ModelRegistry,
	SessionManager,
	createAgentSession,
	type ExtensionAPI,
	type ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { fauxAssistantMessage, fauxProvider, fauxToolCall } from "@earendil-works/pi-ai";
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
						advisorAdviceId: "adv_test",
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
