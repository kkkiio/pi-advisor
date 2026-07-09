import { describe, expect, it } from "vitest";
import {
	appendTranscriptNotice,
	applyTranscriptEvent,
	buildAdvisorOverlayTranscript,
	createEmptyTranscriptState,
	getCompletedExchangeCount,
	hasStreamingTranscriptEntry,
} from "../../../extensions/advisor/transcript-state";
import type { AdvisorTranscriptEntry } from "../../../extensions/advisor/transcript-state";

describe("Feature: Advisor Overlay Transcript", () => {
	it("Scenario: Advisor session events become transcript entries", () => {
		const state = createEmptyTranscriptState();
		applyTranscriptEvent(state, { type: "turn_start" } as any);
		applyTranscriptEvent(state, {
			type: "message_start",
			message: { role: "user", content: "Review the migration.", timestamp: 1 },
		} as any);
		applyTranscriptEvent(state, {
			type: "message_update",
			message: {
				role: "assistant",
				content: [
					{ type: "thinking", thinking: "Inspecting package.json" },
					{ type: "toolCall", id: "call_1", name: "read", arguments: { path: "package.json" } },
				],
				stopReason: "toolUse",
			},
		} as any);
		applyTranscriptEvent(state, {
			type: "tool_execution_end",
			toolCallId: "call_1",
			toolName: "read",
			result: { content: [{ type: "text", text: '{"name":"pi-advisor"}' }] },
			isError: false,
		} as any);
		applyTranscriptEvent(state, {
			type: "turn_end",
			message: {
				role: "assistant",
				content: [
					{ type: "thinking", thinking: "Inspecting package.json" },
					{ type: "text", text: "The package is pi-advisor." },
					{ type: "toolCall", id: "call_1", name: "read", arguments: { path: "package.json" } },
				],
				stopReason: "stop",
			},
		} as any);

		expect(state.entries.map(entry => entry.type)).toEqual([
			"turn-boundary",
			"user-message",
			"thinking",
			"tool-call",
			"tool-result",
			"assistant-text",
			"turn-boundary",
		]);
		expect(state.entries[1]).toMatchObject({ type: "user-message", text: "Review the migration." });
		expect(state.entries[2]).toMatchObject({ type: "thinking", text: "Inspecting package.json", streaming: false });
		expect(state.entries[3]).toMatchObject({ type: "tool-call", toolName: "read", args: '{"path":"package.json"}' });
		expect(state.entries[4]).toMatchObject({
			type: "tool-result",
			toolName: "read",
			content: '{"name":"pi-advisor"}',
			truncated: false,
			isError: false,
			streaming: false,
		});
		expect(state.entries[5]).toMatchObject({
			type: "assistant-text",
			text: "The package is pi-advisor.",
			streaming: false,
		});
		expect(getCompletedExchangeCount(state.entries)).toBe(1);
	});

	it("Scenario: Streaming entries are visible until the turn finishes", () => {
		const state = createEmptyTranscriptState();
		applyTranscriptEvent(state, { type: "turn_start" } as any);
		applyTranscriptEvent(state, {
			type: "message_update",
			message: {
				role: "assistant",
				content: [
					{ type: "thinking", thinking: "Checking risk" },
					{ type: "text", text: "Partial advice" },
				],
				stopReason: "toolUse",
			},
		} as any);

		expect(hasStreamingTranscriptEntry(state.entries)).toBe(true);
		expect(findEntry(state.entries, "thinking")).toMatchObject({ text: "Checking risk", streaming: true });
		expect(findEntry(state.entries, "assistant-text")).toMatchObject({ text: "Partial advice", streaming: true });

		applyTranscriptEvent(state, {
			type: "turn_end",
			message: {
				role: "assistant",
				content: [
					{ type: "thinking", thinking: "Checking risk" },
					{ type: "text", text: "Partial advice complete" },
				],
				stopReason: "stop",
			},
		} as any);

		expect(hasStreamingTranscriptEntry(state.entries)).toBe(false);
		expect(findEntry(state.entries, "assistant-text")).toMatchObject({
			text: "Partial advice complete",
			streaming: false,
		});
	});

	it("Scenario: Overlay transcript renders notices, tools, and truncated results", () => {
		const state = createEmptyTranscriptState();
		const longToolResult = ["line 1", "line 2", "x".repeat(420)].join("\n");
		appendTranscriptNotice(state, "status", "Advisor ready");
		appendTranscriptNotice(state, "advice", "hint -> steer: Use the release helper.");
		appendTranscriptNotice(state, "error", "Provider failed");
		applyTranscriptEvent(state, {
			type: "tool_execution_start",
			toolCallId: "call_1",
			toolName: "read",
			args: { path: "package.json" },
		} as any);
		applyTranscriptEvent(state, {
			type: "tool_execution_end",
			toolCallId: "call_1",
			toolName: "read",
			result: { content: [{ type: "text", text: longToolResult }] },
			isError: false,
		} as any);

		expect(findEntry(state.entries, "tool-result")).toMatchObject({ truncated: true });
		const transcript = buildAdvisorOverlayTranscript(state.entries, markerTheme()).join("\n");

		expect(transcript).toContain("<bg:customMessageBg>");
		expect(transcript).toContain("Advisor ready");
		expect(transcript).toContain("hint -> steer");
		expect(transcript).toContain("Provider failed");
		expect(transcript).toContain('read({"path":"package.json"})');
		expect(transcript).toContain("line 1 line 2");
		expect(transcript).toContain("xxxxxxxxxx");
		expect(transcript.indexOf("tool")).toBeLessThan(transcript.indexOf("tool ok"));
	});

	it("Scenario: Empty Advisor transcript has a readable placeholder", () => {
		expect(buildAdvisorOverlayTranscript([], markerTheme()).join("\n")).toContain(
			"Advisor has not produced transcript entries yet.",
		);
	});
});

function findEntry<TType extends AdvisorTranscriptEntry["type"]>(
	entries: AdvisorTranscriptEntry[],
	type: TType,
): Extract<AdvisorTranscriptEntry, { type: TType }> {
	const entry = entries.find(candidate => candidate.type === type);
	if (!entry) {
		throw new Error(`Missing transcript entry ${type}`);
	}
	return entry as Extract<AdvisorTranscriptEntry, { type: TType }>;
}

function markerTheme() {
	return {
		fg: (name: string, text: string) => `<fg:${name}>${escapeMarker(text)}</fg:${name}>`,
		bg: (name: string, text: string) => `<bg:${name}>${escapeMarker(text)}</bg:${name}>`,
		bold: (text: string) => `<bold>${escapeMarker(text)}</bold>`,
	} as any;
}

function escapeMarker(text: string): string {
	return text.replace(/"/g, "&quot;");
}
