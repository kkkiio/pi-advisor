import { describe, expect, it } from "vitest";
import {
	ADVISOR_DEFAULT_THINKING,
	isAdvisorThinkingLevel,
	parseAdvisorModelRef,
} from "../../../extensions/advisor/settings";

describe("Feature: Advisor Settings", () => {
	it("Scenario: Model preference uses provider/model language", () => {
		expect(parseAdvisorModelRef("openai/gpt-5.5")).toEqual({ provider: "openai", id: "gpt-5.5" });
		expect(parseAdvisorModelRef("anthropic/claude-opus-4-5")).toEqual({
			provider: "anthropic",
			id: "claude-opus-4-5",
		});
		expect(parseAdvisorModelRef("gpt-5.5")).toBeUndefined();
	});

	it("Scenario: Thinking preference accepts Pi thinking levels", () => {
		expect(ADVISOR_DEFAULT_THINKING).toBe("medium");
		expect(isAdvisorThinkingLevel("off")).toBe(true);
		expect(isAdvisorThinkingLevel("xhigh")).toBe(true);
		expect(isAdvisorThinkingLevel("turbo")).toBe(false);
	});
});
