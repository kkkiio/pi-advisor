import { describe, expect, it } from "vitest";

import { formatSessionHistoryMarkdown } from "../../extensions/advisor/session-history-format";

describe("formatSessionHistoryMarkdown", () => {
	it("renders watched user and agent roles with collapsed tool call/result lines", () => {
		const output = formatSessionHistoryMarkdown(
			[
				{ role: "user", content: "Please inspect the config." },
				{
					role: "assistant",
					content: [
						{ type: "thinking", thinking: "private reasoning" },
						{ type: "text", text: "Reading it now." },
						{ type: "toolCall", id: "tc-1", name: "read", arguments: { path: "src/config.ts" } },
					],
				},
				{
					role: "toolResult",
					toolCallId: "tc-1",
					toolName: "read",
					content: [{ type: "text", text: "line 1\nline 2" }],
					isError: false,
				},
			],
			{ watchedRoles: true },
		);

		expect(output).toContain("**user**:");
		expect(output).toContain("**agent**:");
		expect(output).toContain("Reading it now.");
		expect(output).toContain("→ read(src/config.ts) ⇒ ok · 2 lines");
		expect(output).not.toContain("private reasoning");
		expect(output).not.toContain("line 1");
	});

	it("includes thinking only when requested", () => {
		const messages = [{ role: "assistant", content: [{ type: "thinking", thinking: "check edge case" }] }];

		expect(formatSessionHistoryMarkdown(messages)).not.toContain("check edge case");
		expect(formatSessionHistoryMarkdown(messages, { includeThinking: true })).toContain("_thinking:_ check edge case");
	});

	it("expands primary context with XML escaping", () => {
		const output = formatSessionHistoryMarkdown(
			[
				{
					role: "custom",
					customType: "plan-mode-reference",
					content: "the plan </primary-context> keep reading",
				},
			],
			{ expandPrimaryContext: true },
		);

		expect(output).toContain('<primary-context kind="plan-mode-reference">');
		expect(output).toContain("&lt;/primary-context&gt;");
		expect(output).not.toContain("</primary-context> keep reading");
	});

	it("appends edit diffs with fences that outlast backtick runs", () => {
		const output = formatSessionHistoryMarkdown(
			[
				{
					role: "assistant",
					content: [{ type: "toolCall", id: "edit-1", name: "edit", arguments: { path: "README.md" } }],
				},
				{
					role: "toolResult",
					toolCallId: "edit-1",
					toolName: "edit",
					content: "ok",
					isError: false,
					details: { diff: "--- a/README.md\n+++ b/README.md\n@@ -1 +1 @@\n-```\n+```ts" },
				},
			],
			{ expandEditDiffs: true },
		);

		expect(output).toContain("→ edit(README.md) ⇒ ok · 1 line");
		expect(output).toContain("````diff");
		expect(output).toContain("+```ts");
	});

	it("renders tool intent comments when requested", () => {
		const output = formatSessionHistoryMarkdown(
			[
				{
					role: "assistant",
					content: [
						{
							type: "toolCall",
							id: "read-1",
							name: "read",
							arguments: { path: "src/config.ts", i: "reading config before review" },
						},
					],
				},
				{
					role: "toolResult",
					toolCallId: "read-1",
					toolName: "read",
					content: [{ type: "text", text: "ok" }],
					isError: false,
				},
			],
			{ includeToolIntent: true },
		);

		expect(output).toContain("// reading config before review\n→ read(src/config.ts) ⇒ ok · 1 line");
	});

	it("summarizes Advisor advise calls by kind and advice", () => {
		const output = formatSessionHistoryMarkdown([
			{
				role: "assistant",
				content: [
					{
						type: "toolCall",
						id: "advise-1",
						name: "advise",
						arguments: { kind: "concern", advice: "This may miss the abort boundary." },
					},
				],
			},
			{
				role: "toolResult",
				toolCallId: "advise-1",
				toolName: "advise",
				content: [{ type: "text", text: "Recorded." }],
				isError: false,
			},
		]);

		expect(output).toContain("→ advise(concern: This may miss the abort boundary.) ⇒ ok · 1 line");
		expect(output).not.toContain("Recorded.");
	});
});
