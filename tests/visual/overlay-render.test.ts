import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { createOverlayVisualScenarios, renderOverlayVisualScenario } from "./overlay-scenarios";

describe("Advisor overlay visual snapshots", () => {
	for (const scenario of createOverlayVisualScenarios()) {
		it(`${scenario.id} renders a stable bounded overlay`, () => {
			const rendered = renderOverlayVisualScenario(scenario);
			const lines = rendered.split("\n");
			const firstLine = lines[0] ?? "";
			const lastLine = lines[lines.length - 1] ?? "";
			const failures: string[] = [];

			if (!firstLine.startsWith("╭") || !firstLine.endsWith("╮")) {
				failures.push("top border is not closed");
			}
			if (!lastLine.startsWith("╰") || !lastLine.endsWith("╯")) {
				failures.push("bottom border is not closed");
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
				if (index > 0 && index < lines.length - 1 && !framed) {
					failures.push(`line ${index + 1} is not framed: ${line}`);
				}
			}
			for (const text of scenario.requiredText) {
				if (!rendered.includes(text)) {
					failures.push(`missing required text: ${text}`);
				}
			}
			for (const text of scenario.forbiddenText ?? []) {
				if (rendered.includes(text)) {
					failures.push(`unexpected text: ${text}`);
				}
			}

			expect(failures).toEqual([]);
			expect(rendered).toMatchSnapshot();
		});
	}
});
