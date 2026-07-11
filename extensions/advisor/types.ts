import type { AgentMessage, ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";

/** A transcript line for the Advisor overlay. If bg is set, the background extends full-width. */
export type TranscriptLine = string | { text: string; bg: "userMessageBg" };

export const ADVISOR_ADVICE_CUSTOM_TYPE = "advisor:advice";
export const ADVISOR_ASK_CONTEXT_CUSTOM_TYPE = "advisor:ask-context";
export const ADVISOR_OMITTED_CUSTOM_TYPE = "advisor:omitted";

export type AdviceKind = "hint" | "concern";
export type DeliveryChannel = "steer" | "followUp";
export type PrimaryAgentLoopState = "running" | "idle" | "aborted";
export type PullWaitResult = "new_messages" | "timeout" | "state_changed" | "watch_cancelled";
export type WatchRunState = "idle" | "running" | "cancelled";

export interface AdvisorSettings {
	model?: string;
	thinking?: ThinkingLevel;
}

export interface AdvisorResolvedSettings {
	model: Model<any>;
	modelRef: string;
	thinkingLevel: ThinkingLevel;
}

export interface AdvisorModelRef {
	provider: string;
	id: string;
}

export interface AdvisorAdviceDetails {
	origin: "advisor";
	advisorAdviceKind: AdviceKind;
	deliverAs: DeliveryChannel;
	createdAt: number;
}

export interface AdviceDeliveryRequest {
	advice: string;
	kind: AdviceKind;
}

export interface AdviceDeliveryResult {
	kind: AdviceKind;
	deliverAs: DeliveryChannel;
	content: string;
	details: AdvisorAdviceDetails;
	autoResumeSuppressed: boolean;
}

export interface PrimaryTranscriptView {
	messages: AgentMessage[];
	rawMessageCount: number;
	viewMessageCount: number;
	omittedAdvisorAdviceCount: number;
}

export interface AskContext {
	primaryUserMessageIndex: number;
	userText: string;
	assistantTexts: string[];
}

export interface PullTranscriptRequest {
	sinceIndex?: number;
	timeoutMs?: number;
	count?: number;
}

export interface PullTranscriptDetails {
	start: number;
	end: number;
	total: number;
	primaryAgentLoopState: PrimaryAgentLoopState;
	waitResult: PullWaitResult;
	waitedMs: number;
	sinceIndexOutOfBounds: boolean;
	omittedAdvisorAdviceCount: number;
}

export interface PullTranscriptResult {
	text: string;
	details: PullTranscriptDetails;
}

export interface AdvisorContextUsage {
	tokens: number | null;
	contextWindow: number;
	percent: number | null;
}

export interface AdvisorRuntimePort {
	pullTranscript(request: PullTranscriptRequest, signal?: AbortSignal): Promise<PullTranscriptResult>;
	deliverAdvice(request: AdviceDeliveryRequest): Promise<AdviceDeliveryResult>;
}

export interface AdvisorOverlayEntry {
	timestamp: number;
	kind: "status" | "advisor" | "tool" | "advice" | "error";
	text: string;
}
