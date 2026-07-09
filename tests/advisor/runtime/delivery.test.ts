import { describe, expect, it } from "vitest";
import {
	createAdviceDelivery,
	deliveryChannelForKind,
	formatAdviceForPrimary,
} from "../../../extensions/advisor/delivery";

describe("Feature: Advice Delivery", () => {
	it("Scenario: Hint is delivered through Steer", () => {
		expect(deliveryChannelForKind("hint")).toBe("steer");
		const result = createAdviceDelivery({ kind: "hint", advice: "Use the typed parser here." }, false, 1000);
		expect(result.kind).toBe("hint");
		expect(result.deliverAs).toBe("steer");
		expect(result.details).toMatchObject({
			origin: "advisor",
			advisorAdviceKind: "hint",
			deliverAs: "steer",
			createdAt: 1000,
		});
	});

	it("Scenario: Concern is delivered through Follow-up", () => {
		expect(deliveryChannelForKind("concern")).toBe("followUp");
		const result = createAdviceDelivery({ kind: "concern", advice: "This migration misses rollback." }, true, 2000);
		expect(result.kind).toBe("concern");
		expect(result.deliverAs).toBe("followUp");
		expect(result.autoResumeSuppressed).toBe(true);
		expect(result.details).toMatchObject({
			origin: "advisor",
			advisorAdviceKind: "concern",
			deliverAs: "followUp",
			createdAt: 2000,
		});
	});

	it("Scenario: Advice content is wrapped without leaking markup control", () => {
		const body = formatAdviceForPrimary("adv_test", {
			kind: "hint",
			advice: 'Prefer <parse()> & keep "quotes" literal.',
		});
		expect(body).toContain('id="adv_test"');
		expect(body).toContain('kind="hint"');
		expect(body).toContain("&lt;parse()&gt;");
		expect(body).toContain("&quot;quotes&quot;");
	});
});
