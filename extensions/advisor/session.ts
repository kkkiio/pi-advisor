import {
	DefaultResourceLoader,
	SessionManager,
	createAgentSession,
	type AgentSession,
	type AgentSessionEvent,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { ADVISOR_ADVICE_CUSTOM_TYPE } from "./types";
import type {
	AdviceDeliveryRequest,
	AdviceDeliveryResult,
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
} from "./primary-transcript";
import {
	AdvisorSettingsStore,
	getAdvisorAgentDir,
	isAdvisorThinkingLevel,
	parseAdvisorModelRef,
	resolveAdvisorSettings,
} from "./settings";
import { createAdvisorTools } from "./tools";
import { ADVISOR_SYSTEM_PROMPT, ASK_RECENT_COUNT, PULL_TIMEOUT_MAX_MS } from "./constants";

interface PrimaryWaiter {
	baselineVersion: number;
	baselineState: PrimaryAgentLoopState;
	resolve: (result: PullWaitResult) => void;
	timeout: NodeJS.Timeout;
	cleanup: () => void;
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

	constructor(pi: ExtensionAPI, settingsStore = new AdvisorSettingsStore(), overlay = new AdvisorOverlayController()) {
		this.pi = pi;
		this.settingsStore = settingsStore;
		this.overlay = overlay;
	}

	bindPrimaryContext(ctx: ExtensionContext): void {
		this.primaryCtx = ctx;
		this.overlay.open(ctx);
		this.overlay.refresh();
	}

	handlePrimaryEvent(event: { type: string; messages?: AgentMessage[] }, ctx: ExtensionContext): void {
		this.bindPrimaryContext(ctx);
		if (event.type === "before_agent_start") {
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
			const lastAssistant = [...(event.messages ?? [])].reverse().find((message) => message.role === "assistant");
			this.primaryLoopState =
				lastAssistant?.role === "assistant" && lastAssistant.stopReason === "aborted" ? "aborted" : "idle";
			this.autoResumeSuppressed = this.primaryLoopState === "aborted";
			this.bumpPrimary("state_changed");
			return;
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

	async ask(args: string, ctx: ExtensionCommandContext): Promise<void> {
		this.bindPrimaryContext(ctx);
		const question = args.trim();
		if (!question) {
			ctx.ui.notify("Usage: /advisor <message>", "warning");
			return;
		}
		const session = await this.ensureSession(ctx);
		if (!session) {
			return;
		}
		const view = buildPrimaryTranscriptView(ctx);
		const recent = renderPrimaryTranscriptSlice(
			{ ...view, messages: view.messages.slice(-ASK_RECENT_COUNT) },
			{ sinceIndex: 0, count: ASK_RECENT_COUNT },
			this.primaryLoopState,
			"new_messages",
			0,
		).text;
		this.overlay.state.setStatus("Ask Advisor started");
		this.overlay.refresh();
		await session.prompt(
			`Ask Advisor request:\n\n${question}\n\nRecent Primary Transcript View:\n\n${recent}\n\nGive the user a Second Opinion directly. Use advise only if Primary Agent should receive a Hint or Concern.`,
			{
				expandPromptTemplates: false,
				streamingBehavior: session.isStreaming ? "followUp" : undefined,
			},
		);
	}

	async startWatch(ctx: ExtensionCommandContext): Promise<void> {
		this.bindPrimaryContext(ctx);
		if (this.watchAbortController && !this.watchAbortController.signal.aborted) {
			ctx.ui.notify("Advisor Watch Run is already running.", "info");
			return;
		}
		const session = await this.ensureSession(ctx);
		if (!session) {
			return;
		}
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
				}
			});
		ctx.ui.notify("Advisor Watch Run started.", "info");
	}

	async cancelWatch(ctx: ExtensionCommandContext): Promise<void> {
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

	async reset(ctx: ExtensionCommandContext): Promise<void> {
		this.bindPrimaryContext(ctx);
		await this.disposeSession();
		this.overlay.state.clear();
		this.overlay.state.setStatus("Advisor transcript reset");
		this.overlay.refresh();
		ctx.ui.notify("Advisor transcript reset.", "info");
	}

	async handleModelCommand(args: string, ctx: ExtensionCommandContext): Promise<void> {
		this.bindPrimaryContext(ctx);
		const value = args.trim();
		if (!value) {
			const settings = await this.settingsStore.read();
			ctx.ui.notify(settings.model ? `Advisor model: ${settings.model}` : "Advisor model is not set.", "info");
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

	async handleThinkingCommand(args: string, ctx: ExtensionCommandContext): Promise<void> {
		this.bindPrimaryContext(ctx);
		const value = args.trim();
		if (!value) {
			const settings = await this.settingsStore.read();
			ctx.ui.notify(`Advisor thinking: ${settings.thinking ?? "medium"}.`, "info");
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
			};
			return {
				text: `[0, 0) primary_agent_loop_state=${this.primaryLoopState} wait_result=timeout waited_ms=0 total=0\n\n(no primary context)\n`,
				details,
			};
		}
		let view = buildPrimaryTranscriptView(ctx);
		let waitResult: PullWaitResult = hasNewTranscriptEntries(view, request) ? "new_messages" : "timeout";
		const timeoutMs = normalizePullTimeout(request.timeoutMs);
		if (waitResult !== "new_messages" && timeoutMs > 0) {
			const baselineVersion = this.primaryVersion;
			const baselineState = this.primaryLoopState;
			waitResult = await this.waitForPrimaryChange(timeoutMs, baselineVersion, baselineState, signal);
			view = buildPrimaryTranscriptView(ctx);
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
			ctx.ui.notify(`Advisor concern delivered: ${result.id}`, "warning");
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

	private async ensureSession(ctx: ExtensionCommandContext): Promise<AgentSession | undefined> {
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
		const tools = Array.from(new Set([...this.pi.getActiveTools(), "pull_transcript", "advise"]));
		const resourceLoader = new DefaultResourceLoader({
			cwd: ctx.cwd,
			agentDir: getAdvisorAgentDir(),
			systemPrompt: ADVISOR_SYSTEM_PROMPT,
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
		this.overlay.state.setStatus(`Advisor ready: ${resolved.modelRef} thinking=${resolved.thinkingLevel}`);
		this.overlay.refresh();
		return session;
	}

	private handleAdvisorEvent(event: AgentSessionEvent): void {
		this.overlay.state.applyAgentEvent(event);
		this.overlay.refresh();
	}

	private async disposeSession(): Promise<void> {
		const session = this.session;
		this.session = undefined;
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
	const info = details as { advisorAdviceKind?: string; deliverAs?: string; advisorAdviceId?: string } | undefined;
	const body =
		typeof content === "string"
			? content
			: Array.isArray(content)
				? messageContentToText(content)
				: String(content ?? "");
	return `[Advisor ${info?.advisorAdviceKind ?? "advice"} -> ${info?.deliverAs ?? "primary"} ${info?.advisorAdviceId ?? ""}]\n${body}`;
}
