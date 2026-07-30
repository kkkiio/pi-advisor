import type { AdviceDeliveryRequest, AdviceDeliveryResult, AdvisorAdviceDetails, DeliveryChannel } from "./types";

export function deliveryChannelForKind(kind: AdviceDeliveryRequest["kind"]): DeliveryChannel {
	return kind === "hint" ? "steer" : "followUp";
}

export function formatAdviceForPrimary(request: AdviceDeliveryRequest): string {
	return `<advisor-advice kind="${request.kind}">\n${request.advice}`;
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
