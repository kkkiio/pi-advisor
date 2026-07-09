import { After, setDefaultTimeout, setWorldConstructor } from "@cucumber/cucumber";
import { e2eTestTimeoutMs, RpcPi, type RpcJson, type RpcPiOptions } from "./rpc-pi";
import { TuiPi, type TuiPiOptions } from "./tui-pi";

export class AdvisorE2EWorld {
	pi: RpcPi | undefined;
	tui: TuiPi | undefined;
	lastAdvisorMessage: RpcJson | undefined;
	lastNotification: RpcJson | undefined;

	async startRpcPi(options: RpcPiOptions): Promise<void> {
		if (this.pi) {
			await this.pi.dispose();
		}
		this.pi = await RpcPi.start(options);
		this.lastAdvisorMessage = undefined;
		this.lastNotification = undefined;
	}

	async startTuiPi(options: TuiPiOptions): Promise<void> {
		if (this.tui) {
			await this.tui.dispose();
		}
		this.tui = await TuiPi.start(options);
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

	async disposeRpcPi(): Promise<void> {
		if (!this.pi) {
			return;
		}
		await this.pi.dispose();
		this.pi = undefined;
		this.lastAdvisorMessage = undefined;
		this.lastNotification = undefined;
	}

	async disposeTuiPi(): Promise<void> {
		if (!this.tui) {
			return;
		}
		await this.tui.dispose();
		this.tui = undefined;
	}
}

setDefaultTimeout(e2eTestTimeoutMs);
setWorldConstructor(AdvisorE2EWorld);

After(async function (this: AdvisorE2EWorld) {
	await this.disposeRpcPi();
	await this.disposeTuiPi();
});
