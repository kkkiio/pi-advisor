import { Given, Then, When } from "@cucumber/cucumber";
import { expect } from "vitest";
import { expectPlainTextSnapshot } from "../support/plain-text-snapshot";
import type { AdvisorE2EWorld } from "../support/world";

Given("a fresh Pi TUI session with an Advisor model", async function (this: AdvisorE2EWorld) {
	await this.startTuiPi({ advisorModelConfigured: true });
});

When("the user submits {string} in the TUI", async function (this: AdvisorE2EWorld, text: string) {
	await this.tuiPi.submit(text);
});

Then("the TUI screen should contain {string}", async function (this: AdvisorE2EWorld, text: string) {
	const screen = await this.tuiPi.waitForScreen((candidate) => candidate.includes(text), 10_000, text);

	expect(screen).toContain(text);
});

Then("the TUI screen should not contain {string}", function (this: AdvisorE2EWorld, text: string) {
	expect(this.tuiPi.capturePlainText()).not.toContain(text);
});

Then(
	"the TUI screen should match the {string} plain text snapshot",
	async function (this: AdvisorE2EWorld, snapshotName: string) {
		await expectPlainTextSnapshot(snapshotName, this.tuiPi.capturePlainText());
	},
);

Then(
	"the Advisor overlay should match the {string} plain text snapshot",
	async function (this: AdvisorE2EWorld, snapshotName: string) {
		await expectPlainTextSnapshot(snapshotName, this.tuiPi.captureAdvisorOverlayPlainText());
	},
);
