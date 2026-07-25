import { After, setDefaultTimeout, setWorldConstructor } from "@cucumber/cucumber";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AdvisorAdviceDetails } from "../../extensions/advisor/types";
import type { AdvisorProviderObservation } from "./advisor-observation";
import { e2eTestTimeoutMs, RpcPi, type RpcPiOptions } from "./rpc-pi";
import { TuiPi, type TuiPiOptions } from "./tui-pi";

export type AdvisorAdviceMessage = Extract<AgentMessage, { role: "custom" }> & {
	customType: "advisor:advice";
	details: AdvisorAdviceDetails;
};

export class AdvisorE2EWorld {
	pi: RpcPi | undefined;
	tui: TuiPi | undefined;
	advisorModelConfigured = false;
	lastAdvisorMessage: AdvisorAdviceMessage | undefined;
	lastAdvisorObservation: AdvisorProviderObservation | undefined;
	previousAdvisorObservation: AdvisorProviderObservation | undefined;
	lastTuiScreen: string | undefined;
	lastAdvisorOverlay: string | undefined;
	lastEventIndex = 0;

	async startRpcPi(options: RpcPiOptions): Promise<void> {
		if (this.pi) {
			await this.pi.dispose();
		}
		this.pi = await RpcPi.start(options);
		this.advisorModelConfigured = options.advisorModelConfigured ?? false;
		this.lastAdvisorMessage = undefined;
		this.lastAdvisorObservation = undefined;
		this.previousAdvisorObservation = undefined;
		this.lastTuiScreen = undefined;
		this.lastEventIndex = 0;
	}

	async startTuiPi(options: TuiPiOptions): Promise<void> {
		if (this.tui) {
			await this.tui.dispose();
		}
		this.tui = await TuiPi.start(options);
		this.lastTuiScreen = undefined;
		this.lastAdvisorOverlay = undefined;
	}

	get rpcPi(): RpcPi {
		if (!this.pi) {
			throw new Error("RPC Pi session has not been started for this scenario.");
		}
		return this.pi;
	}

	get tuiPi(): TuiPi {
		if (!this.tui) {
			throw new Error("TUI Pi session has not been started for this scenario.");
		}
		return this.tui;
	}

	get advisorObservation(): AdvisorProviderObservation {
		if (!this.lastAdvisorObservation) {
			throw new Error("No Advisor provider observation was captured for the latest Ask.");
		}
		return this.lastAdvisorObservation;
	}

	get priorAdvisorObservation(): AdvisorProviderObservation {
		if (!this.previousAdvisorObservation) {
			throw new Error("No previous Advisor provider observation was captured.");
		}
		return this.previousAdvisorObservation;
	}

	get deliveredAdvice(): AdvisorAdviceMessage {
		if (!this.lastAdvisorMessage) {
			throw new Error("No Advisor Advice was delivered in this scenario.");
		}
		return this.lastAdvisorMessage;
	}

	async disposeRpcPi(): Promise<void> {
		if (!this.pi) {
			return;
		}
		await this.pi.dispose();
		this.pi = undefined;
		this.advisorModelConfigured = false;
		this.lastAdvisorMessage = undefined;
		this.lastAdvisorObservation = undefined;
		this.previousAdvisorObservation = undefined;
		this.lastEventIndex = 0;
	}

	async disposeTuiPi(): Promise<void> {
		if (!this.tui) {
			return;
		}
		await this.tui.dispose();
		this.tui = undefined;
		this.lastTuiScreen = undefined;
		this.lastAdvisorOverlay = undefined;
	}
}

setDefaultTimeout(e2eTestTimeoutMs);
setWorldConstructor(AdvisorE2EWorld);

After(async function (this: AdvisorE2EWorld) {
	await this.disposeRpcPi();
	await this.disposeTuiPi();
});
