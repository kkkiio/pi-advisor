import { Then } from "@cucumber/cucumber";
import { readFile } from "node:fs/promises";
import { expect } from "vitest";
import type { AdvisorE2EWorld } from "../support/world";

const selectedAdvisorModel = "advisor-e2e/faux-advisor";

Then("Advisor commands should be available", async function (this: AdvisorE2EWorld) {
	const commands = await this.rpcPi.getCommands();
	const names = commands.map((command) => command.name);

	expect(names).toEqual(
		expect.arrayContaining([
			"advisor",
			"advisor:watch",
			"advisor:watch-off",
			"advisor:handoff",
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
	const notification = await this.rpcPi.waitForNotificationAfter(
		/Advisor model is not set/i,
		this.lastEventIndex,
		10_000,
	);

	expect(notification.notifyType).toBe("warning");
});

Then(
	"Advisor preferences should persist the selected model and thinking {string}",
	async function (this: AdvisorE2EWorld, thinking: string) {
		const settings: unknown = JSON.parse(await readFile(this.rpcPi.advisorSettingsPath, "utf8"));

		expect(settings).toEqual({ model: selectedAdvisorModel, thinking });
	},
);

Then("Advisor should warn with {string}", async function (this: AdvisorE2EWorld, text: string) {
	const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const notification = await this.rpcPi.waitForNotificationAfter(new RegExp(escaped, "i"), this.lastEventIndex, 10_000);

	expect(notification.message).toContain(text);
	expect(notification.notifyType).toBe("warning");
});

Then("Advisor should offer registered Advisor models", async function (this: AdvisorE2EWorld) {
	const selection = this.rpcPi.findSelectRequestAfter(this.lastEventIndex, /Select Advisor model/i);
	if (!selection) {
		throw new Error("Advisor model picker was not shown.");
	}

	expect(selection.options).toContain(selectedAdvisorModel);
});

Then(
	"Advisor should offer thinking levels with default {string}",
	async function (this: AdvisorE2EWorld, thinking: string) {
		const selection = this.rpcPi.findSelectRequestAfter(this.lastEventIndex, /Select Advisor thinking/i);
		if (!selection) {
			throw new Error("Advisor thinking picker was not shown.");
		}

		expect(selection.title).toContain(`current: ${thinking}`);
		expect(selection.options).toEqual(
			expect.arrayContaining(["off", "minimal", "low", `${thinking} (current)`, "high", "xhigh"]),
		);
	},
);

Then("Advisor should report that the selected model is unavailable", async function (this: AdvisorE2EWorld) {
	const text = "Model missing-provider/missing-model is not registered in Pi.";
	const notification = await this.rpcPi.waitForNotificationAfter(
		/Model missing-provider\/missing-model is not registered in Pi\./i,
		this.lastEventIndex,
		10_000,
	);

	expect(notification.message).toContain(text);
	expect(notification.notifyType).toBe("error");
});

Then("Advisor should confirm the transcript was reset", async function (this: AdvisorE2EWorld) {
	const notification = await this.rpcPi.waitForNotificationAfter(
		/Advisor transcript reset\./i,
		this.lastEventIndex,
		10_000,
	);

	expect(notification.message).toContain("Advisor transcript reset.");
	expect(notification.notifyType).toBe("info");
});

Then("Advisor should report that no Watch Run is active", async function (this: AdvisorE2EWorld) {
	const notification = await this.rpcPi.waitForNotificationAfter(
		/No active Advisor Watch Run\./i,
		this.lastEventIndex,
		10_000,
	);

	expect(notification.message).toContain("No active Advisor Watch Run.");
	expect(notification.notifyType).toBe("info");
});

Then("Advisor should report that Watch Run is already running", async function (this: AdvisorE2EWorld) {
	const notification = await this.rpcPi.waitForNotificationAfter(
		/Advisor Watch Run is already running\./i,
		this.lastEventIndex,
		10_000,
	);

	expect(notification.message).toContain("Advisor Watch Run is already running.");
	expect(notification.notifyType).toBe("info");
});
