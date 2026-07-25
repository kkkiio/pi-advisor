export interface AdvisorProviderObservation {
	question: string;
	askContext: string;
	pullTranscript: string;
	askContextMessageCount: number;
	sessionMessageCount: number;
	availableTools: string[];
}

export function parseAdvisorProviderObservation(value: unknown): AdvisorProviderObservation {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("Advisor provider observation must be a JSON object.");
	}

	const observation = value as Record<string, unknown>;
	const invalidFields = [
		typeof observation.question !== "string" && "question",
		typeof observation.askContext !== "string" && "askContext",
		typeof observation.pullTranscript !== "string" && "pullTranscript",
		typeof observation.askContextMessageCount !== "number" && "askContextMessageCount",
		typeof observation.sessionMessageCount !== "number" && "sessionMessageCount",
		(!Array.isArray(observation.availableTools) ||
			observation.availableTools.some((toolName) => typeof toolName !== "string")) &&
			"availableTools",
	].filter((field): field is string => typeof field === "string");

	if (invalidFields.length > 0) {
		throw new Error(`Advisor provider observation has invalid fields: ${invalidFields.join(", ")}.`);
	}

	return observation as unknown as AdvisorProviderObservation;
}
