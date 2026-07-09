import { Given, Then, When } from "@cucumber/cucumber";
import { readFile } from "node:fs/promises";
import { expect } from "vitest";
import type { AdvisorE2EWorld } from "../support/world";

Given("a fresh Pi RPC session", async function (this: AdvisorE2EWorld) {
	await this.startRpcPi({});
});

Given("a Pi RPC session with an Advisor model", async function (this: AdvisorE2EWorld) {
	await this.startRpcPi({ advisorModelConfigured: true });
});

Given("a Pi RPC session with an Advisor model and a waiting Watch Run script", async function (this: AdvisorE2EWorld) {
	await this.startRpcPi({ advisorModelConfigured: true, script: "watch-wait" });
});

Given(
	"the Primary Agent has completed a turn containing {string}",
	async function (this: AdvisorE2EWorld, message: string) {
		await this.rpcPi.promptAndWait(message, 30_000);
	},
);

When("the user asks Advisor {string}", async function (this: AdvisorE2EWorld, message: string) {
	await this.rpcPi.prompt(`/advisor ${message}`);
});

When("the user sets the Advisor model to {string}", async function (this: AdvisorE2EWorld, modelRef: string) {
	await this.rpcPi.prompt(`/advisor:model ${modelRef}`);
	this.lastNotification = await this.rpcPi.waitForNotification(/Advisor model set to/i, 10_000);
});

When("the user sets Advisor thinking to {string}", async function (this: AdvisorE2EWorld, thinking: string) {
	await this.rpcPi.prompt(`/advisor:thinking ${thinking}`);
	this.lastNotification = await this.rpcPi.waitForNotification(/Advisor thinking set to/i, 10_000);
});

When("the user starts Watch Run", async function (this: AdvisorE2EWorld) {
	await this.rpcPi.prompt("/advisor:watch");
});

When("the user cancels Watch Run", async function (this: AdvisorE2EWorld) {
	await this.rpcPi.waitForNotification(/Advisor Watch Run started/i, 10_000);
	await this.rpcPi.sleep(500);
	await this.rpcPi.prompt("/advisor:watch-off");
});

Then("Advisor commands should be registered", async function (this: AdvisorE2EWorld) {
	const commands = await this.rpcPi.getCommands();
	const names = commands.map((command) => command.name);

	expect(names).toEqual(
		expect.arrayContaining([
			"advisor",
			"advisor:watch",
			"advisor:watch-off",
			"advisor:hide",
			"advisor:show",
			"advisor:new",
			"advisor:model",
			"advisor:thinking",
		]),
	);
	expect(commands.filter((command) => command.source === "extension").map((command) => command.name)).toContain(
		"advisor",
	);
});

Then("the user should be warned that the Advisor model is not set", async function (this: AdvisorE2EWorld) {
	const notification = await this.rpcPi.waitForNotification(/Advisor model is not set/i, 10_000);

	expect(notification.notifyType).toBe("warning");
});

Then(
	"Advisor settings should be persisted with model {string} and thinking {string}",
	async function (this: AdvisorE2EWorld, modelRef: string, thinking: string) {
		const settings = JSON.parse(await readFile(this.rpcPi.advisorSettingsPath, "utf8"));

		expect(settings).toEqual({ model: modelRef, thinking });
	},
);

Then("Advisor should deliver a Hint through Steer", async function (this: AdvisorE2EWorld) {
	const message = await this.rpcPi.waitForMessage(
		(candidate) =>
			candidate.role === "custom" &&
			candidate.customType === "advisor:advice" &&
			JSON.stringify(candidate).includes("E2E_ASK_HINT"),
		60_000,
		"Advisor Hint custom message",
	);

	expect(message.details).toMatchObject({
		origin: "advisor",
		advisorAdviceKind: "hint",
		deliverAs: "steer",
	});
	this.lastAdvisorMessage = message;
});

Then("Advisor should deliver a Concern through Follow-up", async function (this: AdvisorE2EWorld) {
	const message = await this.rpcPi.waitForMessage(
		(candidate) =>
			candidate.role === "custom" &&
			candidate.customType === "advisor:advice" &&
			JSON.stringify(candidate).includes("E2E_WATCH_CONCERN"),
		60_000,
		"Advisor Concern custom message",
	);

	expect(message.details).toMatchObject({
		origin: "advisor",
		advisorAdviceKind: "concern",
		deliverAs: "followUp",
	});
	this.lastAdvisorMessage = message;
});

Then("the delivered Advice should include {string}", function (this: AdvisorE2EWorld, text: string) {
	expect(JSON.stringify(this.lastAdvisorMessage)).toContain(text);
});

Then("Watch Run should be cancelled without delivering a Concern", async function (this: AdvisorE2EWorld) {
	const notification = await this.rpcPi.waitForNotification(/Advisor Watch Run cancelled/i, 20_000);
	const messages = await this.rpcPi.getMessages();

	expect(notification.notifyType).toBe("info");
	expect(JSON.stringify(messages)).not.toContain("E2E_WATCH_CONCERN");
});
