import { describe, expect, it } from "vitest";

import { formatSessionHistoryMarkdown } from "../../extensions/advisor/session-history-format";

describe("formatSessionHistoryMarkdown", () => {
	it("renders a realistic watched primary transcript as compact Advisor context", () => {
		const output = formatSessionHistoryMarkdown(
			[
				{ role: "user", content: "Please inspect the config and search for TODOs." },
				{
					role: "assistant",
					content: [
						{ type: "thinking", thinking: "SECRET-THOUGHT about the approach" },
						{ type: "text", text: "Reading it now." },
						{
							type: "toolCall",
							id: "tc-read",
							name: "read",
							arguments: { path: "src/config.ts", i: "inspect current config before advising" },
						},
					],
				},
				{
					role: "toolResult",
					toolCallId: "tc-read",
					toolName: "read",
					content: [{ type: "text", text: "const a = 1;\nconst b = 2;\nconst c = 3;" }],
					isError: false,
				},
				{
					role: "assistant",
					content: [
						{
							type: "toolCall",
							id: "tc-grep",
							name: "grep",
							arguments: { pattern: "TODO", path: "src", i: "check whether config work left TODO markers" },
						},
					],
				},
				{
					role: "toolResult",
					toolCallId: "tc-grep",
					toolName: "grep",
					content: [{ type: "text", text: "timed out after 30s" }],
					isError: true,
				},
				{
					role: "custom",
					customType: "irc:incoming",
					content: "full rendered irc prompt that must not appear",
					details: { from: "Main", message: "status update please" },
				},
			],
			{ watchedRoles: true, includeToolIntent: true },
		);

		expect(output).toContain("**user**:");
		expect(output).toContain("Please inspect the config and search for TODOs.");
		expect(output).toContain("**agent**:");
		expect(output).toContain("Reading it now.");
		expect(output).not.toContain("## user");
		expect(output).not.toContain("## assistant");
		expect(output).not.toContain("SECRET-THOUGHT");
		expect(output).toContain("// inspect current config before advising\n→ read(src/config.ts) ⇒ ok · 3 lines");
		expect(output).not.toContain("const a = 1;");
		expect(output).toContain(
			"// check whether config work left TODO markers\n→ grep(TODO @ src) ⇒ error · 1 line — timed out after 30s",
		);
		expect(output.split("**agent**:").length - 1).toBe(1);
		expect(output.split("\n").filter((line) => line.startsWith("→ "))).toHaveLength(2);
		expect(output).toContain("[irc] Main → me: status update please");
		expect(output).not.toContain("full rendered irc prompt");
	});

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

	it("renders orphan tool results from truncated transcript slices", () => {
		const output = formatSessionHistoryMarkdown([
			{
				role: "toolResult",
				toolCallId: "tc-orphan",
				toolName: "grep",
				content: [{ type: "text", text: "one match" }],
				isError: false,
			},
		]);

		expect(output).toContain("→ grep() ⇒ ok · 1 line");
	});

	it("summarizes glob and grep arguments without falling back to raw JSON", () => {
		const output = formatSessionHistoryMarkdown([
			{
				role: "assistant",
				content: [
					{
						type: "toolCall",
						id: "glob-1",
						name: "glob",
						arguments: { path: "extensions/advisor/**/*.ts" },
					},
					{
						type: "toolCall",
						id: "grep-1",
						name: "grep",
						arguments: { pattern: "PRIMARY_CONTEXT_CUSTOM_TYPES", path: "extensions/advisor" },
					},
				],
			},
			{
				role: "toolResult",
				toolCallId: "glob-1",
				toolName: "glob",
				content: [{ type: "text", text: "extensions/advisor/session-history-format.ts" }],
				isError: false,
			},
			{
				role: "toolResult",
				toolCallId: "grep-1",
				toolName: "grep",
				content: [{ type: "text", text: "match" }],
				isError: false,
			},
		]);

		expect(output).toContain("→ glob(extensions/advisor/**/*.ts) ⇒ ok · 1 line");
		expect(output).toContain("→ grep(PRIMARY_CONTEXT_CUSTOM_TYPES @ extensions/advisor) ⇒ ok · 1 line");
		expect(output).not.toContain('{"path"');
		expect(output).not.toContain('{"pattern"');
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
