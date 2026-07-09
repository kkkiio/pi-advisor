import { describe, expect, it } from "vitest";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { ADVISOR_ADVICE_CUSTOM_TYPE } from "../../../extensions/advisor/types";
import type { AdvisorAdviceDetails } from "../../../extensions/advisor/types";
import {
	buildPrimaryTranscriptView,
	renderPrimaryTranscriptSlice,
} from "../../../extensions/advisor/primary-transcript";

describe("Feature: Primary Transcript View", () => {
	it("Scenario: Advisor Advice is replaced by an omitted marker", () => {
		const sessionManager = SessionManager.inMemory();
		sessionManager.appendMessage({
			role: "user",
			content: "Implement auth.",
			timestamp: 1,
		});
		sessionManager.appendCustomMessageEntry(
			ADVISOR_ADVICE_CUSTOM_TYPE,
			"<advisor-advice>Secret original advice text</advisor-advice>",
			true,
			{
				origin: "advisor",
				advisorAdviceId: "adv_123",
				advisorAdviceKind: "hint",
				deliverAs: "steer",
				createdAt: 2,
			} satisfies AdvisorAdviceDetails,
		);
		sessionManager.appendMessage({
			role: "assistant",
			content: [{ type: "text", text: "I will inspect the auth module." }],
			api: "faux",
			provider: "faux",
			model: "faux-1",
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: 3,
		});

		const view = buildPrimaryTranscriptView({ sessionManager });
		const rendered = renderPrimaryTranscriptSlice(view, { sinceIndex: 0, count: 10 }, "idle", "new_messages", 0);

		expect(rendered.text).toContain("Implement auth.");
		expect(rendered.text).toContain("[advisor hint omitted: id=adv_123 deliverAs=steer]");
		expect(rendered.text).not.toContain("Secret original advice text");
		expect(rendered.details.omittedAdvisorAdviceCount).toBe(1);
	});

	it("Scenario: Primary Transcript View indexes are stable after filtering", () => {
		const sessionManager = SessionManager.inMemory();
		sessionManager.appendMessage({ role: "user", content: "First", timestamp: 1 });
		sessionManager.appendCustomMessageEntry(ADVISOR_ADVICE_CUSTOM_TYPE, "Advice body", true, {
			origin: "advisor",
			advisorAdviceId: "adv_abc",
			advisorAdviceKind: "concern",
			deliverAs: "followUp",
			createdAt: 2,
		} satisfies AdvisorAdviceDetails);
		sessionManager.appendMessage({ role: "user", content: "Second", timestamp: 3 });

		const view = buildPrimaryTranscriptView({ sessionManager });
		const first = renderPrimaryTranscriptSlice(view, { sinceIndex: 0, count: 2 }, "running", "new_messages", 5);
		const second = renderPrimaryTranscriptSlice(view, { sinceIndex: first.details.end, count: 2 }, "running", "new_messages", 5);

		expect(first.details.start).toBe(0);
		expect(first.details.end).toBe(2);
		expect(first.text).toContain("First");
		expect(first.text).toContain("advisor concern omitted");
		expect(second.details.start).toBe(2);
		expect(second.text).toContain("Second");
	});

	it("Scenario: Secrets are redacted before markdown rendering", () => {
		const sessionManager = SessionManager.inMemory();
		sessionManager.appendMessage({
			role: "user",
			content: "token=super-secret-value and sk-abcdefghijklmnopqrstuvwxyz",
			timestamp: 1,
		});
		const view = buildPrimaryTranscriptView({ sessionManager });
		const rendered = renderPrimaryTranscriptSlice(view, { sinceIndex: 0, count: 10 }, "idle", "new_messages", 0);

		expect(rendered.text).toContain("token=[REDACTED]");
		expect(rendered.text).toContain("[REDACTED_OPENAI_KEY]");
		expect(rendered.text).not.toContain("super-secret-value");
		expect(rendered.text).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
	});
});
