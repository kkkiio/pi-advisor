import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { createOverlayVisualScenarios, renderOverlayVisualScenario } from "./overlay-scenarios";

describe("Advisor overlay visual snapshots", () => {
	for (const scenario of createOverlayVisualScenarios()) {
		it(`${scenario.id} renders a stable bounded overlay`, () => {
			const { text: rendered, fullWidthBackgroundRows } = renderOverlayVisualScenario(scenario);
			const visibleRendered = rendered.replace(/\x1b\[[0-9;]*m/g, "");
			const lines = rendered.split("\n");
			const firstLine = lines[0] ?? "";
			const lastLine = lines[lines.length - 1] ?? "";
			const failures: string[] = [];

			if (!firstLine.startsWith("╭") || !firstLine.endsWith("╮")) {
				failures.push("top border is not closed");
			}
			if (!lastLine.startsWith("╰") || !lastLine.endsWith("╯")) {
				failures.push("input bottom border is not closed");
			}
			if (lines.length !== scenario.height) {
				failures.push(`expected ${scenario.height} rendered rows, got ${lines.length}`);
			}
			for (const [index, line] of lines.entries()) {
				const width = visibleWidth(line);
				if (width > scenario.width) {
					failures.push(`line ${index + 1} width ${width} exceeds ${scenario.width}: ${line}`);
				}
				const framed = line.startsWith("│") && line.endsWith("│");
				if (index > 0 && index < lines.length - 3 && !framed) {
					failures.push(`line ${index + 1} is not framed: ${line}`);
				}
			}
			const inputTopBorder = lines.at(-3) ?? "";
			const inputLine = lines.at(-2) ?? "";
			if (
				!inputTopBorder.startsWith("├") ||
				!inputTopBorder.endsWith("┤") ||
				visibleWidth(inputTopBorder) !== scenario.width
			) {
				failures.push("input top border is not connected to the transcript frame");
			}
			if (visibleWidth(inputLine) !== scenario.width) {
				failures.push("input line does not span the overlay width");
			}
			if (!inputLine.startsWith("│") || !inputLine.endsWith("│")) {
				failures.push("input line is not framed on both sides");
			}
			if (inputLine.slice(1).startsWith(">")) {
				failures.push("input line still contains a prompt marker");
			}
			for (const text of scenario.requiredText) {
				if (!visibleRendered.includes(text)) {
					failures.push(`missing required text: ${text}`);
				}
			}
			for (const text of scenario.forbiddenText ?? []) {
				if (visibleRendered.includes(text)) {
					failures.push(`unexpected text: ${text}`);
				}
			}

			expect(failures).toEqual([]);
			if (scenario.focused) {
				expect(rendered).toContain("\x1b[7m");
				expect(rendered).toContain("\x1b[27m");
			} else {
				expect(rendered).not.toContain("\x1b[7m");
				expect(rendered).not.toContain("\x1b[27m");
			}
			expect(fullWidthBackgroundRows).toEqual(scenario.expectedFullWidthBackgroundRows ?? []);
			expect(rendered).toMatchSnapshot();
		});
	}
});
