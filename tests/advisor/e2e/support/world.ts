import { After, setDefaultTimeout, setWorldConstructor } from "@cucumber/cucumber";
import { e2eTestTimeoutMs, RpcPi, type RpcJson, type RpcPiOptions } from "./rpc-pi";

export class AdvisorE2EWorld {
	pi: RpcPi | undefined;
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

	get rpcPi(): RpcPi {
		if (!this.pi) {
			throw new Error("RPC Pi session has not been started for this scenario.");
		}
		return this.pi;
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
}

setDefaultTimeout(e2eTestTimeoutMs);
setWorldConstructor(AdvisorE2EWorld);

After(async function (this: AdvisorE2EWorld) {
	await this.disposeRpcPi();
});
