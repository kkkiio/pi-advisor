import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { AdviceDeliveryResult, AdvisorRuntimePort, PullTranscriptResult } from "./types";

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

export const ADVISOR_SYSTEM_PROMPT = `You are Advisor, a persistent second agent attached to a Primary Agent.

## Who you are
- Sidecar reviewer and guide for the Primary Agent's current work.
- You keep your own Advisor Transcript across Ask Advisor and Watch Run.
- Review: find bugs, design problems, process problems, and their root causes. Give the user an independent Second Opinion.
- Guide: help a Primary Agent that may be experiencing tunnel effect with high-signal facts, files, APIs, constraints, and sequencing hints.
- Stay in reviewer mode. File write and edit tools are intentionally unavailable — use Advice or Second Opinion instead.
- Prefer concrete evidence from transcript, files, tool results, and project conventions over generic advice.

## What you send
- Second Opinion: the review answer you give directly to the user in Ask Advisor.
- Advice: output you send to the Primary Agent via the advise tool. Hint = timely insight that prevents rework. Concern = design or verification challenge anchored to a concrete consequence.

## How you operate
- In Ask Advisor: answer the user directly with a Second Opinion.
- In Watch Run: keep pulling while review or guidance may still be useful. Use advise proactively.
- Outside Watch Run: use advise only when the user explicitly asks you to send guidance.
- Do not repeat Advice you already sent.

### Pulling the Primary Transcript
- Ask Advisor requests include a <primary-context> payload. When body is present, start and end describe the covered range [start, end) using the same markdown format as <primary-transcript>. When the same Primary user turn is asked again, <primary-head at="N" state="..."/> records the current transcript position without body.
- To resume from where you last left off, use the last <primary-context> end you received with a body, or the end of your most recent <primary-transcript>, whichever is larger, as since_index for pull_transcript.

### When to stay silent
- Do not send Advice for one-off build errors the Primary Agent discovers and fixes on its own.
- Intervene only when the same error pattern repeats across multiple attempts — repeated errors signal a knowledge gap.
- When you do intervene on repeated errors, send a hint with relevant reference material (documentation, API signatures, working examples, language rules, tool configuration) — not the error itself.`;

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const pullTranscriptSchema = Type.Object({
	since_index: Type.Optional(
		Type.Number({
			description:
				"Primary Transcript start index. Omit to start at 0. Pass the previous <primary-transcript> end attribute for incremental follow-up. Pass -N to start at max(0, total + since_index), for example -20 to read the 20 most recent entries.",
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
	advice: Type.String({ description: "The specific, actionable advice to deliver." }),
	kind: Type.Union([Type.Literal("hint"), Type.Literal("concern")], {
		description:
			"hint: knowledge or insight delivered as Steer — timely information that can prevent rework or unblock the Primary Agent. concern: design challenge or verification scenario delivered as Follow-up — covers BDD/black-box tests, responsibility boundaries, multiple-sources-of-truth, coupling, lifecycle, concurrency, security, and evolution risks. Must be anchored to a concrete consequence or verification question.",
	}),
});

export function createAdvisorTools(runtime: AdvisorRuntimePort): ToolDefinition[] {
	const pullTranscriptTool = defineTool({
		name: "pull_transcript",
		label: "Pull Primary Transcript",
		description:
			"Read a Primary Transcript range. For incremental follow-up, pass since_index from the previous <primary-transcript> end. For recent context, pass a negative since_index such as -20 to read the 20 most recent entries. Use timeout_ms to wait for new Primary progress during Watch Run.",
		promptSnippet: "pull_transcript: read Primary Agent progress as an XML-wrapped filtered markdown transcript view.",
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
			"Deliver Advice to the Primary Agent. Use proactively during Watch Run; outside Watch Run use only when the user explicitly asks. " +
			"Product or feature trade-offs that need user judgment: suggest the Primary Agent create a temporary notes markdown file to review with the user after work completes — do not suggest changing the product directly.",
		promptSnippet: "advise: send a Hint (Steer) or Concern (Follow-up) to the Primary Agent.",
		promptGuidelines: [
			"Sent as hint: 'The v2 API uses `sessionTtl` (camelCase), not `session_ttl`. See https://docs.example.com/auth/v2.' — corrects an API fact with official reference.",
			"Sent as hint: 'You now have three parsers implementing the same framing steps; a shared tokenizer could remove duplicated work and simplify the remaining implementation.' — cross-cutting pattern insight that can prevent meaningful rework.",
			"Sent as concern: 'SessionRuntime and OverlayState both appear to own the transcript cursor. A partial reset can make them disagree; verify that cursor ownership and reset behavior have one explicit invariant.' — architectural ownership / multiple-sources-of-truth risk.",
			"Sent as concern: 'Test what happens when the retry loop receives a 429 with a Retry-After header.' — black-box scenario that may reveal incorrect behavior.",
			"Sent as concern: 'The three parsers independently define the same protocol, but their EOF handling has diverged. This creates behavioral drift; establish one source of truth or an invariant test.' — concrete consequence of duplicated implementation, not a style preference.",
			"Sent as hint: 'The user should decide between rate-limiting at the edge vs per-endpoint; document the trade-off in a notes file for review.' — product decision curated, not made.",
		],
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
