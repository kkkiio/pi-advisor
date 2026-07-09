import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "vitest";
import type { AdvisorE2EWorld } from "../support/world";

Given("Advisor is configured in the interactive terminal", async function (this: AdvisorE2EWorld) {
	await this.startTuiPi({ advisorModelConfigured: true });
});

When("the user submits {string} in the TUI", async function (this: AdvisorE2EWorld, text: string) {
	await this.tuiPi.submit(text);
});

When("the user asks Advisor from the main input {string}", async function (this: AdvisorE2EWorld, message: string) {
	await this.tuiPi.submit(`/advisor ${message}`);
});

When("the user hides Advisor Overlay", async function (this: AdvisorE2EWorld) {
	await this.tuiPi.submit("/advisor:hide");
});

When("the user shows Advisor Overlay", async function (this: AdvisorE2EWorld) {
	await this.tuiPi.submit("/advisor:show");
});

Then("the TUI screen should contain {string}", async function (this: AdvisorE2EWorld, text: string) {
	const screen = await this.tuiPi.waitForScreen((candidate) => candidate.includes(text), 10_000, text);

	expect(screen).toContain(text);
});

Then("the TUI screen should not contain {string}", async function (this: AdvisorE2EWorld, text: string) {
	const screen = await this.tuiPi.waitForScreen((candidate) => !candidate.includes(text), 10_000, `no ${text}`);

	expect(screen).not.toContain(text);
});

Then("Advisor Overlay should be visible", async function (this: AdvisorE2EWorld) {
	const screen = await this.tuiPi.waitForScreen(
		(candidate) => candidate.includes("Advisor ·"),
		10_000,
		"Advisor Overlay",
	);

	expect(screen).toContain("Advisor ·");
});

Then("Advisor Overlay should be hidden", async function (this: AdvisorE2EWorld) {
	const screen = await this.tuiPi.waitForScreen(
		(candidate) => !candidate.includes("Advisor ·"),
		10_000,
		"hidden Advisor Overlay",
	);

	expect(screen).not.toContain("Advisor ·");
});
