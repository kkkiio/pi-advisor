import { Then } from "@cucumber/cucumber";
import { expect } from "vitest";
import type { AdvisorAdviceMessage, AdvisorE2EWorld } from "../support/world";

Then("Primary Agent should receive the latest Advisor Second Opinion handoff", async function (this: AdvisorE2EWorld) {
	const message = await this.rpcPi.waitForMessage(
		(candidate) => {
			const serialized = JSON.stringify(candidate);
			return (
				candidate.role === "user" &&
				serialized.includes("<advisor-handoff>") &&
				serialized.includes("<original-request>") &&
				serialized.includes("Review the primary transcript.") &&
				serialized.includes("<second-opinion>") &&
				serialized.includes("E2E_SECOND_OPINION: primary_transcript=seen") &&
				serialized.includes("<user-instructions>") &&
				serialized.includes("Please verify & apply </user-instructions>")
			);
		},
		30_000,
		"Advisor Second Opinion handoff",
	);

	const body = JSON.stringify(message);

	expect(body).not.toContain("advisor-advice");
	expect(body).not.toContain("</advisor-handoff>");
	expect(body).not.toContain("</original-request>");
	expect(body).not.toContain("</second-opinion>");
	expect(body.match(/<user-instructions>/g)).toHaveLength(1);
	// The only apparent closing tag is literal user text, not a structural delimiter.
	expect(body.match(/<\/user-instructions>/g)).toHaveLength(1);
});

Then("Advisor should deliver a Concern through Follow-up", async function (this: AdvisorE2EWorld) {
	const message = await this.rpcPi.waitForMessage(
		(candidate): candidate is AdvisorAdviceMessage =>
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

Then("Advisor should deliver a Hint through Steer", async function (this: AdvisorE2EWorld) {
	const message = await this.rpcPi.waitForMessage(
		(candidate): candidate is AdvisorAdviceMessage =>
			candidate.role === "custom" &&
			candidate.customType === "advisor:advice" &&
			JSON.stringify(candidate).includes("E2E_WATCH_HINT"),
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

Then(
	"Primary Agent should receive the user-directed Concern without Watch Run",
	async function (this: AdvisorE2EWorld) {
		const message = await this.rpcPi.waitForMessage(
			(candidate): candidate is AdvisorAdviceMessage =>
				candidate.role === "custom" &&
				candidate.customType === "advisor:advice" &&
				JSON.stringify(candidate).includes("E2E_USER_REQUESTED_ADVICE"),
			30_000,
			"user-directed Advisor Concern custom message",
		);

		expect(message.details).toMatchObject({
			origin: "advisor",
			advisorAdviceKind: "concern",
			deliverAs: "followUp",
		});
		const content = JSON.stringify(message.content);
		expect(content).toContain('<advisor-advice kind=\\"concern\\">\\nE2E_USER_REQUESTED_ADVICE');
		expect(content).toContain("</advisor-advice> & <literal>");
		expect(content.match(/<\/advisor-advice>/g)).toHaveLength(1);
		this.lastAdvisorMessage = message;
	},
);

Then("the delivered Advice should include {string}", function (this: AdvisorE2EWorld, text: string) {
	expect(JSON.stringify(this.deliveredAdvice)).toContain(text);
});

Then("the Advice should be based on the Primary Agent's recent work", function (this: AdvisorE2EWorld) {
	expect(JSON.stringify(this.deliveredAdvice)).toContain("primary_transcript=seen");
});

Then("Watch Run should be cancelled without delivering a Concern", async function (this: AdvisorE2EWorld) {
	const notification = await this.rpcPi.waitForNotificationAfter(
		/Advisor Watch Run cancelled/i,
		this.lastEventIndex,
		20_000,
	);
	const messages = await this.rpcPi.getMessages();

	expect(notification.notifyType).toBe("info");
	expect(JSON.stringify(messages)).not.toContain("E2E_WATCH_CONCERN");
});
