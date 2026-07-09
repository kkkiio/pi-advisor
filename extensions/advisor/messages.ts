// Local bridge for Pi transcript message roles that session-history-format.ts
// consumes before Pi exposes those roles through public extension exports.
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ImageContent, TextContent } from "@earendil-works/pi-ai";
import type {} from "@earendil-works/pi-coding-agent";

export interface BashExecutionMessage {
	role: "bashExecution";
	command: string;
	output: string;
	exitCode: number | undefined;
	cancelled: boolean;
	truncated?: boolean;
	timestamp?: number;
	excludeFromContext?: boolean;
}

export interface PythonExecutionMessage {
	role: "pythonExecution";
	code: string;
	output: string;
	exitCode: number | undefined;
	cancelled: boolean;
	truncated?: boolean;
	timestamp?: number;
	excludeFromContext?: boolean;
}

export interface CustomMessage<T = unknown> {
	role: "custom";
	customType: string;
	content: string | (TextContent | ImageContent)[];
	display?: boolean;
	details?: T;
	timestamp?: number;
}

export interface DeveloperMessage {
	role: "developer";
	content: string | (TextContent | ImageContent)[];
	timestamp?: number;
}

export interface HookMessage<T = unknown> {
	role: "hookMessage";
	customType: string;
	content: string | (TextContent | ImageContent)[];
	display?: boolean;
	details?: T;
	timestamp?: number;
}

export interface BranchSummaryMessage {
	role: "branchSummary";
	summary: string;
	fromId: string;
	timestamp?: number;
}

export interface CompactionSummaryMessage {
	role: "compactionSummary";
	summary: string;
	tokensBefore?: number;
	timestamp?: number;
}

export interface FileMentionMessage {
	role: "fileMention";
	files: Array<{
		path: string;
		content?: string;
		lineCount?: number;
		byteSize?: number;
		skippedReason?: "tooLarge" | "binary";
		image?: ImageContent;
	}>;
	timestamp?: number;
}

declare module "@earendil-works/pi-agent-core" {
	interface CustomAgentMessages {
		developer: DeveloperMessage;
		pythonExecution: PythonExecutionMessage;
		hookMessage: HookMessage;
		fileMention: FileMentionMessage;
	}
}

export type AdvisorAgentMessage = AgentMessage;
