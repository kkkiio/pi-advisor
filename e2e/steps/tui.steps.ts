import { Given, Then, When } from "@cucumber/cucumber";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import type { AdvisorE2EWorld } from "../support/world";

Given("Advisor is configured in the interactive terminal", async function (this: AdvisorE2EWorld) {
	await this.startTuiPi({ advisorModelConfigured: true });
});

Given("Advisor has no configured model in the interactive terminal", async function (this: AdvisorE2EWorld) {
	await this.startTuiPi({});
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

When("the user opens the Advisor model picker in the terminal", async function (this: AdvisorE2EWorld) {
	await this.tuiPi.submit("/advisor:model");
	this.lastTuiScreen = await this.tuiPi.waitForScreen(
		(screen) => screen.includes("Only showing models from configured providers") && screen.includes("→ faux-primary"),
		10_000,
		"Advisor model picker",
	);
});

Then("the user can move to another Advisor model", async function (this: AdvisorE2EWorld) {
	const initialScreen = this.lastTuiScreen;
	await this.tuiPi.submit("", ["Down"]);
	const movedScreen = await this.tuiPi.waitForScreen(
		(screen) => screen.includes("→ faux-advisor") && !screen.includes("→ faux-primary"),
		10_000,
		"moved Advisor model selection",
	);

	expect(initialScreen).toContain("→ faux-primary");
	expect(movedScreen).toContain("→ faux-advisor");
	this.lastTuiScreen = movedScreen;
});

When("the user searches the Advisor model picker for {string}", async function (this: AdvisorE2EWorld, search: string) {
	await this.tuiPi.submit("", ["Up"]);
	await this.tuiPi.submit(search, []);
});

Then("the matching Advisor model should become selected", async function (this: AdvisorE2EWorld) {
	const screen = await this.tuiPi.waitForScreen(
		(candidate) => candidate.includes("> faux-advisor") && candidate.includes("→ faux-advisor"),
		10_000,
		"filtered Advisor model selection",
	);

	expect(screen).toContain("> faux-advisor");
	expect(screen).toContain("→ faux-advisor");
	this.lastTuiScreen = screen;
});

When("the user confirms the filtered Advisor model", async function (this: AdvisorE2EWorld) {
	await this.tuiPi.submit("", ["Enter"]);
	await this.tuiPi.waitForScreen(
		(screen) => screen.includes("Advisor model set to advisor-e2e/faux-advisor."),
		10_000,
		"persisted Advisor model notification",
	);
});

Then("the Advisor model preference should be {string}", async function (this: AdvisorE2EWorld, model: string) {
	const settings = JSON.parse(await readFile(join(this.tuiPi.home, ".pi", "agent", "advisor.json"), "utf8"));

	expect(settings.model).toBe(model);
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
