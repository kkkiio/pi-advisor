import {
	DefaultResourceLoader,
	ModelSelectorComponent,
	SessionManager,
	SettingsManager,
	createAgentSession,
	type AgentSession,
	type AgentSessionEvent,
	type ExtensionAPI,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, Model } from "@earendil-works/pi-ai";
import { ADVISOR_ADVICE_CUSTOM_TYPE, ADVISOR_ASK_CONTEXT_CUSTOM_TYPE } from "./types";
import type {
	AdviceDeliveryRequest,
	AdviceDeliveryResult,
	AdvisorContextUsage,
	AdvisorRuntimePort,
	PrimaryAgentLoopState,
	PullTranscriptRequest,
	PullTranscriptResult,
	PullWaitResult,
} from "./types";
import { createAdviceDelivery } from "./delivery";
import { AdvisorOverlayController } from "./overlay";
import {
	buildPrimaryTranscriptView,
	hasNewTranscriptEntries,
	messageContentToText,
	renderPrimaryTranscriptSlice,
	selectAskContext,
} from "./primary-transcript";
import {
	ADVISOR_DEFAULT_THINKING,
	ADVISOR_THINKING_LEVELS,
	AdvisorSettingsStore,
	getAdvisorAgentDir,
	isAdvisorThinkingLevel,
	parseAdvisorModelRef,
	resolveAdvisorSettings,
} from "./settings";
import { createAdvisorTools } from "./tools";
import { ADVISOR_DISABLED_PRIMARY_TOOL_NAMES, ADVISOR_SYSTEM_PROMPT, PULL_TIMEOUT_MAX_MS } from "./constants";

interface PrimaryWaiter {
	baselineVersion: number;
	baselineState: PrimaryAgentLoopState;
	resolve: (result: PullWaitResult) => void;
	timeout: NodeJS.Timeout;
	cleanup: () => void;
}

interface LatestSecondOpinion {
	request: string;
	answer: string;
}

export class AdvisorRuntime implements AdvisorRuntimePort {
	private readonly pi: ExtensionAPI;
	private readonly settingsStore: AdvisorSettingsStore;
	private readonly overlay: AdvisorOverlayController;
	private session: AgentSession | undefined;
	private sessionUnsubscribe: (() => void) | undefined;
	private primaryCtx: ExtensionContext | undefined;
	private primaryLoopState: PrimaryAgentLoopState = "idle";
	private primaryVersion = 0;
	private waiters = new Set<PrimaryWaiter>();
	private watchAbortController: AbortController | undefined;
	private autoResumeSuppressed = false;
	private latestSecondOpinion: LatestSecondOpinion | undefined;
	private askCompletion: Promise<void> | undefined;
	private lastInjectedPrimaryUserIndex: number | undefined;
	private primaryStreamingAssistant: AgentMessage | undefined;

	constructor(pi: ExtensionAPI, settingsStore = new AdvisorSettingsStore(), overlay?: AdvisorOverlayController) {
		this.pi = pi;
		this.settingsStore = settingsStore;
		this.overlay =
			overlay ??
			new AdvisorOverlayController(() =>
				(
					this.session as (AgentSession & { getContextUsage?: () => AdvisorContextUsage | undefined }) | undefined
				)?.getContextUsage?.(),
			);
	}

	bindPrimaryContext(ctx: ExtensionContext): void {
		this.primaryCtx = ctx;
	}

	handlePrimaryEvent(
		event: { type: string; message?: AgentMessage; messages?: AgentMessage[] },
		ctx: ExtensionContext,
	): void {
		this.bindPrimaryContext(ctx);
		if (event.type === "before_agent_start") {
			this.primaryStreamingAssistant = undefined;
			this.autoResumeSuppressed = false;
			this.bumpPrimary("state_changed");
			return;
		}
		if (event.type === "agent_start") {
			this.primaryLoopState = "running";
			this.bumpPrimary("state_changed");
			return;
		}
		if (event.type === "agent_end") {
			this.primaryStreamingAssistant = undefined;
			const lastAssistant = [...(event.messages ?? [])].reverse().find((message) => message.role === "assistant");
			this.primaryLoopState =
				lastAssistant?.role === "assistant" && lastAssistant.stopReason === "aborted" ? "aborted" : "idle";
			this.autoResumeSuppressed = this.primaryLoopState === "aborted";
			this.bumpPrimary("state_changed");
			return;
		}
		if (event.type === "message_update" && event.message?.role === "assistant") {
			this.primaryStreamingAssistant = structuredClone(event.message);
			return;
		}
		if (event.type === "message_end" && event.message?.role === "assistant") {
			this.primaryStreamingAssistant = undefined;
		}
		if (event.type === "turn_end" || event.type === "session_compact" || event.type === "session_tree") {
			this.primaryStreamingAssistant = undefined;
		}
		if (
			event.type === "message_end" ||
			event.type === "turn_end" ||
			event.type === "session_compact" ||
			event.type === "session_tree"
		) {
			this.bumpPrimary("new_messages");
		}
	}

	async ask(args: string, ctx: ExtensionContext): Promise<void> {
		this.bindPrimaryContext(ctx);
		const callbacks = {
			onSubmit: (value: string) => {
				void this.submitFromOverlay(value, ctx);
			},
			onDismiss: () => {
				this.overlay.close();
			},
		};
		const question = args.trim();
		this.overlay.open(ctx, callbacks);
		if (!question) {
			return;
		}
		const session = await this.ensureSession(ctx);
		if (!session) {
			this.overlay.setDraft(question);
			return;
		}
		if (session.isStreaming) {
			try {
				await session.sendUserMessage(question, { deliverAs: "steer" });
				this.overlay.state.recordUserMessage(question);
				this.overlay.refresh();
			} catch (error) {
				this.overlay.state.recordError(error);
				this.overlay.refresh();
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			}
			return;
		}
		if (this.askCompletion || (this.watchAbortController && !this.watchAbortController.signal.aborted)) {
			this.overlay.setDraft(question);
			return;
		}
		this.overlay.refresh();
		this.overlay.state.recordUserMessage(question);
		const view = buildPrimaryTranscriptView(ctx, this.primaryStreamingAssistant);
		const askContext = selectAskContext(view, this.lastInjectedPrimaryUserIndex);
		const primaryContextContent = askContext
			? `<primary-context end="${view.messages.length}" state="${this.primaryLoopState}">\n**user**:\n${askContext.userText}${
					askContext.assistantTexts.length > 0 ? `\n\n**primary**:\n${askContext.assistantTexts.join("\n\n")}` : ""
				}\n</primary-context>`
			: `<primary-context end="${view.messages.length}" state="${this.primaryLoopState}" />`;
		const messageStartIndex = session.state.messages.length;
		const askCompletion = (async () => {
			await session.sendCustomMessage({
				customType: ADVISOR_ASK_CONTEXT_CUSTOM_TYPE,
				content: primaryContextContent,
				display: false,
				details: {
					primaryTranscriptEndIndex: view.messages.length,
					primaryAgentLoopState: this.primaryLoopState,
					primaryUserMessageIndex: askContext?.primaryUserMessageIndex,
				},
			});
			this.overlay.state.recordContext({
				primaryTranscriptEndIndex: view.messages.length,
				primaryAgentLoopState: this.primaryLoopState,
				askContext,
				text: primaryContextContent,
			});
			if (askContext) {
				this.lastInjectedPrimaryUserIndex = askContext.primaryUserMessageIndex;
			}
			this.overlay.state.setStatus("ask started");
			this.overlay.refresh();
			await session.prompt(question, { expandPromptTemplates: false });
		})()
			.then(() => {
				const messages = session.state.messages.slice(messageStartIndex);
				for (let index = messages.length - 1; index >= 0; index--) {
					const message = messages[index];
					if (message.role !== "assistant") {
						continue;
					}
					const assistant = message as AssistantMessage;
					const answer = assistant.content
						.filter((part) => part.type === "text")
						.map((part) => part.text.trim())
						.filter(Boolean)
						.join("\n\n")
						.trim();
					if (!answer) {
						continue;
					}
					this.latestSecondOpinion = {
						request: question,
						answer,
					};
					if (!this.overlay.isOpen) {
						ctx.ui.notify("Advisor Second Opinion is ready. Press Alt+/ to view.", "info");
					}
					return;
				}
			})
			.catch((error) => {
				this.overlay.state.recordError(error);
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			})
			.finally(() => {
				if (this.askCompletion === askCompletion) {
					this.askCompletion = undefined;
				}
				this.overlay.refresh();
			});
		this.askCompletion = askCompletion;
		void askCompletion;
	}

	async submitFromOverlay(text: string, ctx: ExtensionContext): Promise<void> {
		this.bindPrimaryContext(ctx);
		const value = text.trim();
		if (!value) {
			return;
		}
		this.overlay.setDraft("");
		const command = value.match(/^\/advisor:(watch|watch-off|handoff|new|model|thinking)(?:\s+(.*))?$/);
		if (command) {
			const args = command[2]?.trim() ?? "";
			switch (command[1]) {
				case "watch":
					await this.startWatch(ctx);
					return;
				case "watch-off":
					await this.cancelWatch(ctx);
					return;
				case "handoff":
					await this.handoff(args, ctx);
					return;
				case "new":
					await this.reset(ctx);
					return;
				case "model":
					await this.handleModelCommand(args, ctx);
					return;
				case "thinking":
					await this.handleThinkingCommand(args, ctx);
					return;
			}
		}
		if (!value.startsWith("/")) {
			await this.ask(value, ctx);
			return;
		}
		const session = await this.ensureSession(ctx);
		if (!session) {
			this.overlay.setDraft(value);
			return;
		}
		if (!session.isStreaming && (this.askCompletion || this.watchAbortController)) {
			this.overlay.setDraft(value);
			return;
		}
		this.overlay.state.recordUserMessage(value);
		this.overlay.state.setStatus("ask started");
		this.overlay.refresh();
		try {
			await session.prompt(value, {
				expandPromptTemplates: false,
				streamingBehavior: session.isStreaming ? "steer" : undefined,
			});
		} catch (error) {
			this.overlay.state.recordError(error);
			this.overlay.refresh();
			ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
		}
	}

	async handoff(args: string, ctx: ExtensionContext): Promise<void> {
		this.bindPrimaryContext(ctx);
		if (this.askCompletion) {
			await this.askCompletion;
		}
		const latest = this.latestSecondOpinion;
		if (!latest) {
			ctx.ui.notify("No completed Advisor Second Opinion to hand off.", "warning");
			return;
		}
		const instructions = args.trim();
		const content = instructions
			? `Here is the latest Advisor Second Opinion I want you to use. ${instructions}

Original Advisor request:
${latest.request}

Advisor Second Opinion:
${latest.answer}`
			: `Here is the latest Advisor Second Opinion I want you to use as supporting context.

Original Advisor request:
${latest.request}

Advisor Second Opinion:
${latest.answer}`;
		if (ctx.isIdle()) {
			this.pi.sendUserMessage(content);
			this.overlay.state.setStatus("handoff sent");
			this.overlay.refresh();
			ctx.ui.notify("Handed off latest Advisor Second Opinion.", "info");
			return;
		}
		this.pi.sendUserMessage(content, { deliverAs: "followUp" });
		this.overlay.state.setStatus("handoff queued");
		this.overlay.refresh();
		ctx.ui.notify("Queued latest Advisor Second Opinion as a follow-up.", "info");
	}

	async startWatch(ctx: ExtensionContext): Promise<void> {
		this.bindPrimaryContext(ctx);
		if (this.watchAbortController && !this.watchAbortController.signal.aborted) {
			ctx.ui.notify("Advisor Watch Run is already running.", "info");
			return;
		}
		const session = await this.ensureSession(ctx);
		if (!session) {
			return;
		}
		this.overlay.open(ctx, {
			onSubmit: (value) => {
				void this.submitFromOverlay(value, ctx);
			},
			onDismiss: () => {
				this.overlay.close();
			},
		});
		this.overlay.refresh();
		const controller = new AbortController();
		this.watchAbortController = controller;
		this.overlay.state.setWatchRunState("running");
		this.overlay.refresh();
		void session
			.prompt(
				`Start a Watch Run for the current Primary Agent task.

Use pull_transcript with timeout_ms to follow Primary Agent progress. Send Hint or Concern through advise only when useful. Stop naturally when this Watch Run has no more useful review work.`,
				{
					expandPromptTemplates: false,
					streamingBehavior: session.isStreaming ? "followUp" : undefined,
				},
			)
			.catch((error) => {
				if (!controller.signal.aborted) {
					this.overlay.state.recordError(error);
					this.primaryCtx?.ui.notify(error instanceof Error ? error.message : String(error), "error");
				}
			})
			.finally(() => {
				if (this.watchAbortController === controller) {
					this.watchAbortController = undefined;
					this.overlay.state.setWatchRunState(controller.signal.aborted ? "cancelled" : "idle");
					this.overlay.refresh();
					if (!controller.signal.aborted && !this.overlay.isOpen) {
						this.primaryCtx?.ui.notify("Advisor Watch Run finished. Press Alt+/ to view.", "info");
					}
				}
			});
		ctx.ui.notify("Advisor Watch Run started.", "info");
	}

	async cancelWatch(ctx: ExtensionContext): Promise<void> {
		this.bindPrimaryContext(ctx);
		const controller = this.watchAbortController;
		if (!controller || controller.signal.aborted) {
			ctx.ui.notify("No active Advisor Watch Run.", "info");
			return;
		}
		controller.abort();
		this.resolveWaiters("watch_cancelled", true);
		this.overlay.state.setWatchRunState("cancelled");
		this.overlay.refresh();
		try {
			if (this.session?.isStreaming) {
				await this.session.abort();
			}
		} finally {
			ctx.ui.notify("Advisor Watch Run cancelled. Advisor transcript is preserved.", "info");
		}
	}

	async reset(ctx: ExtensionContext): Promise<void> {
		this.bindPrimaryContext(ctx);
		this.watchAbortController?.abort();
		this.watchAbortController = undefined;
		this.resolveWaiters("watch_cancelled", true);
		await this.disposeSession();
		this.latestSecondOpinion = undefined;
		this.askCompletion = undefined;
		this.overlay.setDraft("");
		this.overlay.state.clear();
		this.overlay.state.setStatus("reset");
		this.overlay.open(ctx, {
			onSubmit: (value) => {
				void this.submitFromOverlay(value, ctx);
			},
			onDismiss: () => {
				this.overlay.close();
			},
		});
		this.overlay.refresh();
		ctx.ui.notify("Advisor transcript reset.", "info");
	}

	toggleOverlay(ctx: ExtensionContext): void {
		this.bindPrimaryContext(ctx);
		if (this.overlay.isOpen) {
			this.overlay.close();
			return;
		}
		this.overlay.open(ctx, {
			onSubmit: (value) => {
				void this.submitFromOverlay(value, ctx);
			},
			onDismiss: () => {
				this.overlay.close();
			},
		});
		this.overlay.refresh();
	}

	async handleModelCommand(args: string, ctx: ExtensionContext): Promise<void> {
		this.bindPrimaryContext(ctx);
		const value = args.trim();
		if (!value) {
			const settings = await this.settingsStore.read();
			if (ctx.mode === "tui") {
				const currentRef = settings.model ? parseAdvisorModelRef(settings.model) : undefined;
				const currentModel = currentRef ? ctx.modelRegistry.find(currentRef.provider, currentRef.id) : undefined;
				const selected = await ctx.ui.custom<Model<any> | undefined>(
					(tui, _theme, _keybindings, done) =>
						new ModelSelectorComponent(tui, currentModel, SettingsManager.inMemory(), ctx.modelRegistry, [], done, () =>
							done(undefined),
						),
				);
				if (!selected) {
					return;
				}
				const selectedRef = `${selected.provider}/${selected.id}`;
				await this.settingsStore.patch({ model: selectedRef });
				await this.disposeSession();
				ctx.ui.notify(`Advisor model set to ${selectedRef}.`, "info");
				return;
			}
			ctx.modelRegistry.refresh();
			const models = ctx.modelRegistry
				.getAvailable()
				.map((model) => ({ model, ref: `${model.provider}/${model.id}` }))
				.sort((a, b) => {
					const aCurrent = a.ref === settings.model;
					const bCurrent = b.ref === settings.model;
					if (aCurrent && !bCurrent) return -1;
					if (!aCurrent && bCurrent) return 1;
					return a.model.provider.localeCompare(b.model.provider) || a.model.id.localeCompare(b.model.id);
				});
			if (models.length === 0) {
				ctx.ui.notify("No Advisor models are available.", "warning");
				return;
			}
			const selected = await ctx.ui.select(
				settings.model ? `Select Advisor model (current: ${settings.model})` : "Select Advisor model",
				models.map(({ ref }) => ref),
			);
			if (!selected) {
				return;
			}
			const model = models.find(({ ref }) => ref === selected);
			if (!model) {
				ctx.ui.notify(`Model ${selected} is not registered in Pi.`, "error");
				return;
			}
			await this.settingsStore.patch({ model: selected });
			await this.disposeSession();
			ctx.ui.notify(`Advisor model set to ${selected}.`, "info");
			return;
		}
		const ref = parseAdvisorModelRef(value);
		if (!ref) {
			ctx.ui.notify("Use /advisor:model <provider/model>.", "warning");
			return;
		}
		const model = ctx.modelRegistry.find(ref.provider, ref.id);
		if (!model) {
			ctx.ui.notify(`Model ${value} is not registered in Pi.`, "error");
			return;
		}
		await this.settingsStore.patch({ model: `${ref.provider}/${ref.id}` });
		await this.disposeSession();
		ctx.ui.notify(`Advisor model set to ${ref.provider}/${ref.id}.`, "info");
	}

	async handleThinkingCommand(args: string, ctx: ExtensionContext): Promise<void> {
		this.bindPrimaryContext(ctx);
		const value = args.trim();
		if (!value) {
			const settings = await this.settingsStore.read();
			const current = settings.thinking ?? ADVISOR_DEFAULT_THINKING;
			const options = ADVISOR_THINKING_LEVELS.map((level) => (level === current ? `${level} (current)` : level));
			const selected = await ctx.ui.select(`Select Advisor thinking (current: ${current})`, options);
			if (!selected) {
				return;
			}
			const level = selected.replace(" (current)", "");
			if (!isAdvisorThinkingLevel(level)) {
				ctx.ui.notify("Use /advisor:thinking off|minimal|low|medium|high|xhigh.", "warning");
				return;
			}
			await this.settingsStore.patch({ thinking: level });
			await this.disposeSession();
			ctx.ui.notify(`Advisor thinking set to ${level}.`, "info");
			return;
		}
		if (!isAdvisorThinkingLevel(value)) {
			ctx.ui.notify("Use /advisor:thinking off|minimal|low|medium|high|xhigh.", "warning");
			return;
		}
		await this.settingsStore.patch({ thinking: value });
		await this.disposeSession();
		ctx.ui.notify(`Advisor thinking set to ${value}.`, "info");
	}

	async pullTranscript(request: PullTranscriptRequest, signal?: AbortSignal): Promise<PullTranscriptResult> {
		const started = Date.now();
		const ctx = this.primaryCtx;
		if (!ctx) {
			const details = {
				start: 0,
				end: 0,
				total: 0,
				primaryAgentLoopState: this.primaryLoopState,
				waitResult: "timeout" as const,
				waitedMs: 0,
				sinceIndexOutOfBounds: false,
				omittedAdvisorAdviceCount: 0,
				displayItems: [],
			};
			return {
				text: `<primary-transcript start="0" end="0" total="0" state="${this.primaryLoopState}" wait="timeout" waited-ms="0">\n(no primary context)\n</primary-transcript>\n`,
				details,
			};
		}
		let view = buildPrimaryTranscriptView(ctx, this.primaryStreamingAssistant);
		let waitResult: PullWaitResult = hasNewTranscriptEntries(view, request) ? "new_messages" : "timeout";
		const timeoutMs = normalizePullTimeout(request.timeoutMs);
		if (waitResult !== "new_messages" && timeoutMs > 0) {
			const baselineVersion = this.primaryVersion;
			const baselineState = this.primaryLoopState;
			waitResult = await this.waitForPrimaryChange(timeoutMs, baselineVersion, baselineState, signal);
			view = buildPrimaryTranscriptView(ctx, this.primaryStreamingAssistant);
		}
		return renderPrimaryTranscriptSlice(view, request, this.primaryLoopState, waitResult, Date.now() - started);
	}

	async deliverAdvice(request: AdviceDeliveryRequest): Promise<AdviceDeliveryResult> {
		const ctx = this.primaryCtx;
		if (!ctx) {
			throw new Error("Advisor cannot deliver advice before Primary Agent context is available.");
		}
		const result = createAdviceDelivery(request, this.autoResumeSuppressed);
		this.pi.sendMessage(
			{
				customType: ADVISOR_ADVICE_CUSTOM_TYPE,
				content: result.content,
				display: true,
				details: result.details,
			},
			{
				deliverAs: result.deliverAs,
				triggerTurn: !result.autoResumeSuppressed,
			},
		);
		this.overlay.state.recordAdvice(result);
		this.overlay.refresh();
		if (result.kind === "concern") {
			ctx.ui.notify("Advisor concern delivered", "warning");
		}
		return result;
	}

	async dispose(): Promise<void> {
		this.resolveWaiters("watch_cancelled", true);
		this.watchAbortController?.abort();
		this.watchAbortController = undefined;
		await this.disposeSession();
		this.overlay.close();
	}

	private async ensureSession(ctx: ExtensionContext): Promise<AgentSession | undefined> {
		this.bindPrimaryContext(ctx);
		if (this.session) {
			return this.session;
		}
		const settings = await this.settingsStore.read();
		const resolved = resolveAdvisorSettings(settings, ctx.modelRegistry);
		if ("error" in resolved) {
			ctx.ui.notify(resolved.error, "warning");
			this.overlay.state.recordError(resolved.error);
			this.overlay.refresh();
			return undefined;
		}
		const primaryTools = this.pi
			.getActiveTools()
			.filter((toolName) => !ADVISOR_DISABLED_PRIMARY_TOOL_NAMES.has(toolName));
		const tools = Array.from(new Set([...primaryTools, "pull_transcript", "advise"]));
		const resourceLoader = new DefaultResourceLoader({
			cwd: ctx.cwd,
			agentDir: getAdvisorAgentDir(),
			systemPrompt: ADVISOR_SYSTEM_PROMPT,
			noExtensions: true,
			noSkills: true,
			noPromptTemplates: true,
			noThemes: true,
			noContextFiles: true,
		});
		await resourceLoader.reload();
		const { session } = await createAgentSession({
			cwd: ctx.cwd,
			sessionManager: SessionManager.inMemory(ctx.cwd),
			model: resolved.model,
			modelRegistry: ctx.modelRegistry,
			thinkingLevel: resolved.thinkingLevel,
			tools,
			customTools: createAdvisorTools(this),
			resourceLoader,
		});
		this.session = session;
		this.sessionUnsubscribe = session.subscribe((event) => this.handleAdvisorEvent(event));
		this.overlay.state.setStatus("ready");
		this.overlay.refresh();
		return session;
	}

	private handleAdvisorEvent(event: AgentSessionEvent): void {
		this.overlay.applyAgentEvent(event);
	}

	private async disposeSession(): Promise<void> {
		const session = this.session;
		this.session = undefined;
		this.lastInjectedPrimaryUserIndex = undefined;
		this.sessionUnsubscribe?.();
		this.sessionUnsubscribe = undefined;
		if (!session) {
			return;
		}
		try {
			if (session.isStreaming) {
				await session.abort();
			}
		} finally {
			session.dispose();
		}
	}

	private bumpPrimary(reason: PullWaitResult): void {
		this.primaryVersion++;
		this.resolveWaiters(reason, false);
	}

	private waitForPrimaryChange(
		timeoutMs: number,
		baselineVersion: number,
		baselineState: PrimaryAgentLoopState,
		signal?: AbortSignal,
	): Promise<PullWaitResult> {
		if (this.watchAbortController?.signal.aborted || signal?.aborted) {
			return Promise.resolve("watch_cancelled");
		}
		if (this.primaryVersion > baselineVersion) {
			return Promise.resolve("new_messages");
		}
		if (this.primaryLoopState !== baselineState) {
			return Promise.resolve("state_changed");
		}
		return new Promise((resolve) => {
			const timeout = setTimeout(() => {
				this.waiters.delete(waiter);
				cleanup();
				resolve("timeout");
			}, timeoutMs);
			const abort = () => {
				this.waiters.delete(waiter);
				clearTimeout(timeout);
				cleanup();
				resolve("watch_cancelled");
			};
			const cleanup = () => {
				signal?.removeEventListener("abort", abort);
				this.watchAbortController?.signal.removeEventListener("abort", abort);
			};
			const waiter: PrimaryWaiter = {
				baselineVersion,
				baselineState,
				resolve,
				timeout,
				cleanup,
			};
			signal?.addEventListener("abort", abort, { once: true });
			this.watchAbortController?.signal.addEventListener("abort", abort, { once: true });
			this.waiters.add(waiter);
		});
	}

	private resolveWaiters(reason: PullWaitResult, force: boolean): void {
		for (const waiter of [...this.waiters]) {
			if (
				force ||
				reason === "watch_cancelled" ||
				this.primaryVersion > waiter.baselineVersion ||
				this.primaryLoopState !== waiter.baselineState
			) {
				this.waiters.delete(waiter);
				clearTimeout(waiter.timeout);
				waiter.cleanup();
				waiter.resolve(
					reason === "new_messages" && this.primaryLoopState !== waiter.baselineState ? "state_changed" : reason,
				);
			}
		}
	}
}

function normalizePullTimeout(timeoutMs: number | undefined): number {
	if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
		return 0;
	}
	return Math.min(PULL_TIMEOUT_MAX_MS, Math.floor(timeoutMs));
}

export function renderAdviceMessage(content: unknown, details: unknown): string {
	const info = details as { advisorAdviceKind?: string; deliverAs?: string } | undefined;
	const body =
		typeof content === "string"
			? content
			: Array.isArray(content)
				? messageContentToText(content)
				: String(content ?? "");
	return `[Advisor ${info?.advisorAdviceKind ?? "advice"} -> ${info?.deliverAs ?? "primary"}]\n${body}`;
}
