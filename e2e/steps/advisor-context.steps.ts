import { Then } from "@cucumber/cucumber";
import { expect } from "vitest";
import type { AdvisorE2EWorld } from "../support/world";

Then("Advisor should receive the Primary Agent inspection tools", function (this: AdvisorE2EWorld) {
	expect(this.advisorObservation.availableTools).toEqual(
		expect.arrayContaining(["read", "bash", "grep", "pull_transcript", "advise"]),
	);
});

Then("Advisor should not receive file editing tools", function (this: AdvisorE2EWorld) {
	expect(this.advisorObservation.availableTools).not.toContain("edit");
	expect(this.advisorObservation.availableTools).not.toContain("write");
});

Then(
	"the latest Advisor Ask should report the Primary Agent state as {string}",
	function (this: AdvisorE2EWorld, state: string) {
		expect(this.advisorObservation.askContext).toMatch(/<primary-context\b[^>]*\bend="\d+"/);
		expect(this.advisorObservation.askContext).toContain(`state="${state}"`);
	},
);

Then(
	"the latest Ask Context should include Primary text {string} and {string}",
	function (this: AdvisorE2EWorld, userText: string, assistantText: string) {
		expect(this.advisorObservation.askContext).toContain("<primary-context ");
		expect(this.advisorObservation.askContext).toContain(`**user**:\n${userText}`);
		expect(this.advisorObservation.askContext).toContain(`**agent**:\n${assistantText}`);
	},
);

Then(
	"the latest Ask Context should include Primary read {string} with status {string}",
	function (this: AdvisorE2EWorld, toolPath: string, status: string) {
		expect(this.advisorObservation.askContext).toContain(`→ read(${toolPath}) ⇒ ${status}`);
	},
);

Then(
	"the latest Ask Context should include committed Primary text {string} but exclude uncommitted text {string}",
	function (this: AdvisorE2EWorld, committedText: string, uncommittedText: string) {
		const askContext = this.advisorObservation.askContext;
		const header = askContext.match(/<primary-context\b[^>]*>/)?.[0];
		const start = header?.match(/\bstart="(\d+)"/)?.[1];
		const end = header?.match(/\bend="(\d+)"/)?.[1];

		expect(header).toBeDefined();
		expect(start).toBeDefined();
		expect(end).toBeDefined();
		expect(Number(end)).toBeGreaterThan(Number(start));
		expect(askContext).toContain(`**user**:\n${committedText}`);
		expect(askContext).not.toContain(uncommittedText);
		expect(askContext).not.toContain("SECRET_STREAMING_TOOL");
		expect(askContext).not.toMatch(/→ read\([^)]*\) ⇒ pending/);
	},
);

Then(
	"the latest Ask Context should preserve raw Primary text {string}",
	function (this: AdvisorE2EWorld, primaryText: string) {
		const requestText = this.advisorObservation.askContext;

		expect(requestText).toContain(primaryText);
		expect(requestText).not.toContain(primaryText.replace(/</g, "&lt;").replace(/>/g, "&gt;"));
		expect(requestText.match(/<\/primary-context>/g)).toHaveLength(1);
	},
);

Then(
	"the latest Pull Transcript should preserve raw Primary text {string}",
	async function (this: AdvisorE2EWorld, primaryText: string) {
		const question = this.advisorObservation.question;
		const started = Date.now();
		while (Date.now() - started < 10_000) {
			const observations = await this.rpcPi.readAdvisorObservations();
			const transcript = [...observations].reverse().find((observation) => {
				return observation.question === question && observation.pullTranscript.includes(primaryText);
			})?.pullTranscript;
			if (transcript) {
				expect(transcript).not.toContain(primaryText.replace(/</g, "&lt;").replace(/>/g, "&gt;"));
				expect(transcript.match(/<\/primary-transcript>/g)).toHaveLength(1);
				return;
			}
			await this.rpcPi.sleep(100);
		}
		throw new Error(`timeout waiting for raw Primary text ${JSON.stringify(primaryText)} in Pull Transcript`);
	},
);

Then(
	"the latest Pull Transcript should continue from Ask Context with committed Primary work",
	async function (this: AdvisorE2EWorld) {
		const question = this.advisorObservation.question;
		const started = Date.now();
		while (Date.now() - started < 20_000) {
			const observations = await this.rpcPi.readAdvisorObservations();
			const observation = [...observations]
				.reverse()
				.find((candidate) => candidate.question === question && candidate.pullTranscript.includes("**agent**:"));
			if (!observation) {
				await this.rpcPi.sleep(100);
				continue;
			}
			const contextEnd = observation.askContext.match(/<primary-context\b[^>]*\bend="(\d+)"/)?.[1];
			const pullHeader = observation.pullTranscript.match(/<primary-transcript\b[^>]*>/)?.[0];
			const pullStart = pullHeader?.match(/\bstart="(\d+)"/)?.[1];
			expect(contextEnd).toBeDefined();
			expect(pullStart).toBe(contextEnd);
			expect(pullHeader).not.toContain('since-index-out-of-bounds="true"');
			expect(observation.pullTranscript).toContain("The streaming response is already visible.");
			expect(observation.pullTranscript).toContain("→ read(SECRET_STREAMING_TOOL) ⇒ error");
			return;
		}
		throw new Error("timeout waiting for Pull Transcript with committed Primary work");
	},
);

Then("the repeated Ask should keep the same Primary Transcript position", function (this: AdvisorE2EWorld) {
	const previous = this.priorAdvisorObservation.askContext;
	const current = this.advisorObservation.askContext;
	const previousPosition = previous.match(/<primary-context\b[^>]*\bend="(\d+)"/)?.[1];
	const currentPosition =
		current.match(/<primary-context\b[^>]*\bend="(\d+)"/)?.[1] ??
		current.match(/<primary-head\b[^>]*\bat="(\d+)"/)?.[1];

	expect(previousPosition).toBeDefined();
	expect(currentPosition).toBeDefined();
	expect(Number(currentPosition)).toBeGreaterThanOrEqual(Number(previousPosition));
});

Then("the repeated Ask should not include Ask Context", function (this: AdvisorE2EWorld) {
	expect(this.advisorObservation.askContext).toMatch(/<primary-head\b[^>]*\sat="\d+"[^>]*\s\/>/);
	expect(this.advisorObservation.askContext).not.toContain("**user**:");
});

Then(
	"the running Advisor should receive {string} without another Ask Context",
	async function (this: AdvisorE2EWorld, message: string) {
		const initialObservation = this.advisorObservation;
		const messageObservation = await this.rpcPi.waitForAdvisorObservation(message, 10_000);

		expect(initialObservation.askContextMessageCount).toBeGreaterThan(0);
		expect(messageObservation.question).toContain(message);
		expect(messageObservation.askContextMessageCount).toBe(initialObservation.askContextMessageCount);
	},
);
