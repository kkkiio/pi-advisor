import type { AdviceDeliveryRequest, AdviceDeliveryResult, AdvisorAdviceDetails, DeliveryChannel } from "./types";

export function deliveryChannelForKind(kind: AdviceDeliveryRequest["kind"]): DeliveryChannel {
	return kind === "hint" ? "steer" : "followUp";
}

export function formatAdviceForPrimary(request: AdviceDeliveryRequest): string {
	const escaped = request.advice.replace(/[<>&'"]/g, (char) => {
		switch (char) {
			case "<":
				return "&lt;";
			case ">":
				return "&gt;";
			case "&":
				return "&amp;";
			case "'":
				return "&apos;";
			case '"':
				return "&quot;";
			default:
				return char;
		}
	});
	return `<advisor-advice kind="${request.kind}">\n${escaped}\n</advisor-advice>`;
}

export function createAdviceDelivery(
	request: AdviceDeliveryRequest,
	autoResumeSuppressed: boolean,
	now = Date.now(),
): AdviceDeliveryResult {
	const deliverAs = deliveryChannelForKind(request.kind);
	const details: AdvisorAdviceDetails = {
		origin: "advisor",
		advisorAdviceKind: request.kind,
		deliverAs,
		createdAt: now,
	};
	return {
		kind: request.kind,
		deliverAs,
		content: formatAdviceForPrimary(request),
		details,
		autoResumeSuppressed,
	};
}
