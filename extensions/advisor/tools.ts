import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { AdvisorRuntimePort, AdviceDeliveryResult, PullTranscriptResult } from "./types";

const pullTranscriptSchema = Type.Object({
	since_index: Type.Optional(
		Type.Number({
			description:
				"Primary Transcript View start index. Omit to start at 0. Pass the previous [start, end) header's end for incremental follow-up. Pass -N to start at max(0, total + since_index), for example -20 to read the 20 most recent entries.",
		}),
	),
	timeout_ms: Type.Optional(
		Type.Number({
			description: "Milliseconds to wait for new Primary Agent progress during Watch Run before returning.",
		}),
	),
	count: Type.Optional(
		Type.Number({
			description: "Maximum number of entries to return after since_index is resolved.",
		}),
	),
});

const adviseSchema = Type.Object({
	advice: Type.String(),
	kind: Type.Union([Type.Literal("hint"), Type.Literal("concern")]),
});

export function createAdvisorTools(runtime: AdvisorRuntimePort): ToolDefinition[] {
	const pullTranscriptTool = defineTool({
		name: "pull_transcript",
		label: "Pull Primary Transcript",
		description:
			"Read a Primary Transcript View delta. For incremental follow-up, pass since_index from the previous [start, end) header's end. For recent context, pass a negative since_index such as -20 to read the 20 most recent entries. Use timeout_ms to wait for new primary progress during Watch Run.",
		promptSnippet: "pull_transcript: read Primary Agent progress as a filtered markdown transcript view.",
		parameters: pullTranscriptSchema,
		executionMode: "sequential",
		execute: async (_toolCallId, params, signal): Promise<AgentToolResult<PullTranscriptResult["details"]>> => {
			const result = await runtime.pullTranscript(
				{
					sinceIndex: params.since_index,
					timeoutMs: params.timeout_ms,
					count: params.count,
				},
				signal,
			);
			return {
				content: [{ type: "text", text: result.text }],
				details: result.details,
			};
		},
	});

	const adviseTool = defineTool({
		name: "advise",
		label: "Advise Primary Agent",
		description:
			"During an active Watch Run, send one useful Advisor Advice to the Primary Agent. Use kind=hint for acceleration and kind=concern for risk or doubt. Stay silent when there is no real advice.",
		promptSnippet: "advise: during active Watch Run, deliver a Hint or Concern to the Primary Agent.",
		parameters: adviseSchema,
		executionMode: "sequential",
		execute: async (_toolCallId, params): Promise<AgentToolResult<AdviceDeliveryResult>> => {
			const result = await runtime.deliverAdvice({
				advice: params.advice,
				kind: params.kind,
			});
			return {
				content: [
					{
						type: "text",
						text: `delivered ${result.kind} as ${result.deliverAs}${
							result.autoResumeSuppressed ? " auto_resume_suppressed=true" : ""
						}`,
					},
				],
				details: result,
			};
		},
	});

	return [pullTranscriptTool, adviseTool];
}
