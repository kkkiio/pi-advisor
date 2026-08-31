import { Given, When } from "@cucumber/cucumber";
import type { AdvisorE2EWorld } from "../support/world";

const selectedAdvisorModel = "advisor-e2e/faux-advisor";
const recentPrimaryWork = "E2E_PRIMARY_SENTINEL: review the current Advisor scenario.";

Given("Advisor is installed", async function (this: AdvisorE2EWorld) {
	await this.startRpcPi({});
});

Given("Advisor has no configured model", async function (this: AdvisorE2EWorld) {
	await this.startRpcPi({});
});

Given("Advisor has a configured model", async function (this: AdvisorE2EWorld) {
	await this.startRpcPi({ advisorModelConfigured: true });
});

Given("Advisor is configured for Ask Context review", async function (this: AdvisorE2EWorld) {
	await this.startRpcPi({ advisorModelConfigured: true, script: "ask-context" });
});

Given("Advisor is configured to review the Primary Agent while it is running", async function (this: AdvisorE2EWorld) {
	await this.startRpcPi({ advisorModelConfigured: true, script: "ask-context-streaming" });
});

Given("Advisor is configured to pull while the Primary Agent is running", async function (this: AdvisorE2EWorld) {
	await this.startRpcPi({ advisorModelConfigured: true, script: "pull-streaming" });
});

Given("Advisor is configured to find a timely improvement", async function (this: AdvisorE2EWorld) {
	await this.startRpcPi({ advisorModelConfigured: true, script: "watch-hint" });
});

Given("Advisor is configured with a Second Opinion in progress", async function (this: AdvisorE2EWorld) {
	await this.startRpcPi({ advisorModelConfigured: true, script: "advisor-busy" });
});

Given(
	"Advisor is configured and Watch Run can wait for Primary Agent progress",
	async function (this: AdvisorE2EWorld) {
		await this.startRpcPi({ advisorModelConfigured: true, script: "watch-wait" });
	},
);

Given("the Primary Agent has recent work for Advisor to review", async function (this: AdvisorE2EWorld) {
	await this.rpcPi.promptAndWait(recentPrimaryWork, 30_000);
});

Given(
	"the Primary Agent has completed a turn containing {string}",
	async function (this: AdvisorE2EWorld, message: string) {
		await this.rpcPi.promptAndWait(message, 30_000);
	},
);

When("the user asks Advisor {string}", async function (this: AdvisorE2EWorld, message: string) {
	this.lastEventIndex = this.rpcPi.eventCount();
	await this.rpcPi.prompt(`/advisor ${message}`);
	this.previousAdvisorObservation = this.lastAdvisorObservation;
	if (this.advisorModelConfigured) {
		this.lastAdvisorObservation = await this.rpcPi.waitForAdvisorObservation(message, 10_000);
	}
});

When("the Primary Agent starts working on {string}", async function (this: AdvisorE2EWorld, message: string) {
	this.lastEventIndex = this.rpcPi.eventCount();
	await this.rpcPi.prompt(message);
});

When(
	"the user asks Advisor {string} while Advisor is running",
	async function (this: AdvisorE2EWorld, message: string) {
		this.lastEventIndex = this.rpcPi.eventCount();
		await this.rpcPi.prompt(`/advisor ${message}`);
	},
);

When("the Primary Agent response {string} becomes visible", async function (this: AdvisorE2EWorld, text: string) {
	const started = Date.now();
	while (Date.now() - started < 20_000) {
		// RPC message_update events carry streaming deltas (assistantMessageEvent)
		// without the accumulated message, so rebuild the streamed text from deltas.
		const streamed = this.rpcPi.events
			.slice(this.lastEventIndex)
			.flatMap((event) => {
				if (event.type !== "message_update") {
					return [];
				}
				const delta = (event as { assistantMessageEvent?: { type?: string; delta?: unknown } }).assistantMessageEvent;
				return delta?.type === "text_delta" && typeof delta.delta === "string" ? [delta.delta] : [];
			})
			.join("");
		if (streamed.includes(text)) {
			return;
		}
		await this.rpcPi.sleep(100);
	}
	throw new Error(
		`timeout waiting for visible Primary Agent response ${JSON.stringify(text)} after event ${this.lastEventIndex}`,
	);
});

When("the user selects a registered Advisor model", async function (this: AdvisorE2EWorld) {
	this.lastEventIndex = this.rpcPi.eventCount();
	await this.rpcPi.prompt(`/advisor:model ${selectedAdvisorModel}`);
	await this.rpcPi.waitForNotificationAfter(/Advisor model set to/i, this.lastEventIndex, 10_000);
});

When("the user sets Advisor thinking to {string}", async function (this: AdvisorE2EWorld, thinking: string) {
	this.lastEventIndex = this.rpcPi.eventCount();
	await this.rpcPi.prompt(`/advisor:thinking ${thinking}`);
	await this.rpcPi.waitForNotificationAfter(/Advisor thinking set to/i, this.lastEventIndex, 10_000);
});

When("the user starts Watch Run", async function (this: AdvisorE2EWorld) {
	this.lastEventIndex = this.rpcPi.eventCount();
	await this.rpcPi.prompt("/advisor:watch");
});

When("the user starts Watch Run again", async function (this: AdvisorE2EWorld) {
	this.lastEventIndex = this.rpcPi.eventCount();
	await this.rpcPi.prompt("/advisor:watch");
});

When("the user cancels Watch Run", async function (this: AdvisorE2EWorld) {
	await this.rpcPi.waitForNotification(/Advisor Watch Run started/i, 10_000);
	await this.rpcPi.sleep(500);
	await this.rpcPi.prompt("/advisor:watch-off");
});

When("the user turns Watch Run off", async function (this: AdvisorE2EWorld) {
	this.lastEventIndex = this.rpcPi.eventCount();
	await this.rpcPi.prompt("/advisor:watch-off");
});

When("the user resets Advisor", async function (this: AdvisorE2EWorld) {
	this.lastEventIndex = this.rpcPi.eventCount();
	await this.rpcPi.prompt("/advisor:new");
});

When(
	"the user hands off the latest Advisor Second Opinion with {string}",
	async function (this: AdvisorE2EWorld, instructions: string) {
		this.lastEventIndex = this.rpcPi.eventCount();
		await this.rpcPi.prompt(`/advisor:handoff ${instructions}`);
		await this.rpcPi.waitForNotificationAfter(
			/Handed off latest Advisor Second Opinion|Queued latest Advisor Second Opinion/i,
			this.lastEventIndex,
			30_000,
		);
	},
);

When("the user opens the Advisor model preference", async function (this: AdvisorE2EWorld) {
	this.lastEventIndex = this.rpcPi.eventCount();
	await this.rpcPi.prompt("/advisor:model");
});

When("the user opens the Advisor thinking preference", async function (this: AdvisorE2EWorld) {
	this.lastEventIndex = this.rpcPi.eventCount();
	await this.rpcPi.prompt("/advisor:thinking");
});

When(
	"the user chooses a registered Advisor model from the Advisor model picker",
	async function (this: AdvisorE2EWorld) {
		this.lastEventIndex = this.rpcPi.eventCount();
		await this.rpcPi.prompt("/advisor:model", { select: selectedAdvisorModel });
		const selection = this.rpcPi.findSelectRequestAfter(this.lastEventIndex, /Select Advisor model/i);
		if (!selection) {
			throw new Error("Advisor model picker was not shown.");
		}
		await this.rpcPi.waitForNotificationAfter(/Advisor model set to/i, this.lastEventIndex, 10_000);
	},
);

When(
	"the user chooses Advisor thinking {string} from the Advisor thinking picker",
	async function (this: AdvisorE2EWorld, thinking: string) {
		this.lastEventIndex = this.rpcPi.eventCount();
		await this.rpcPi.prompt("/advisor:thinking", { select: thinking });
		const selection = this.rpcPi.findSelectRequestAfter(this.lastEventIndex, /Select Advisor thinking/i);
		if (!selection) {
			throw new Error("Advisor thinking picker was not shown.");
		}
		await this.rpcPi.waitForNotificationAfter(/Advisor thinking set to/i, this.lastEventIndex, 10_000);
	},
);

When("the user enters an invalid Advisor model format", async function (this: AdvisorE2EWorld) {
	this.lastEventIndex = this.rpcPi.eventCount();
	await this.rpcPi.prompt("/advisor:model invalid-model-ref");
});

When("the user selects an unavailable Advisor model", async function (this: AdvisorE2EWorld) {
	this.lastEventIndex = this.rpcPi.eventCount();
	await this.rpcPi.prompt("/advisor:model missing-provider/missing-model");
});

When("the user selects an unsupported Advisor thinking level", async function (this: AdvisorE2EWorld) {
	this.lastEventIndex = this.rpcPi.eventCount();
	await this.rpcPi.prompt("/advisor:thinking loud");
});
