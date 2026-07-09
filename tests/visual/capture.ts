import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { TuiPi, type TuiPiOptions } from "../../e2e/support/tui-pi";
import { repoRoot } from "../../e2e/support/rpc-pi";

interface TuiVisualScenario {
	id: string;
	title: string;
	description: string;
	options: TuiPiOptions;
	captures: Array<"whole" | "overlay">;
	checklist: string[];
	run: (pi: TuiPi) => Promise<void>;
}

const scenarios: TuiVisualScenario[] = [
	{
		id: "fresh-startup",
		title: "Fresh Startup",
		description: "Pi opens with Advisor configured but no Advisor overlay shown yet.",
		options: { advisorModelConfigured: true, width: 100, height: 30 },
		captures: ["whole"],
		checklist: [
			"Advisor overlay is absent on startup.",
			"Primary TUI remains visible with project cwd and selected faux-primary model.",
			"Startup screen has no Advisor debug text.",
		],
		async run(_pi) {},
	},
	{
		id: "ask-advisor-overlay",
		title: "Ask Advisor Overlay",
		description: "Ask Advisor opens the right-side overlay with prompt, context, tool, advice, and advisor output.",
		options: { advisorModelConfigured: true, width: 100, height: 30 },
		captures: ["whole", "overlay"],
		checklist: [
			"Whole TUI shows the overlay anchored to the right side.",
			"Overlay does not cover the primary input/status area in a way that makes it unreadable.",
			"Overlay panel includes Prompt, Context, Tool, and Advisor sections.",
			"Tool summaries are compact and do not expand full Primary Transcript text.",
			"Advisor completion text is visible without breaking panel borders.",
		],
		async run(pi) {
			await pi.submit("/advisor Review the primary transcript and send a Hint if useful.");
			await pi.waitForScreen(
				(screen) => screen.includes("Advisor · idle") && screen.includes("E2E_ADVISOR_DONE"),
				20_000,
				"Ask Advisor overlay completion",
			);
		},
	},
	{
		id: "hide-show-overlay",
		title: "Hide And Show Overlay",
		description: "The preserved Advisor transcript returns when /advisor:show reopens the overlay.",
		options: { advisorModelConfigured: true, width: 100, height: 30 },
		captures: ["whole", "overlay"],
		checklist: [
			"Overlay can be hidden without losing the Advisor transcript.",
			"Overlay can be shown again on the right side.",
			"Restored overlay still contains the previous Advisor output.",
		],
		async run(pi) {
			await pi.submit("/advisor Review the primary transcript and send a Hint if useful.");
			await pi.waitForScreen(
				(screen) => screen.includes("Advisor · idle") && screen.includes("E2E_ADVISOR_DONE"),
				20_000,
				"Ask Advisor overlay completion before hide",
			);
			await pi.submit("/advisor:hide");
			await pi.waitForScreen((screen) => !screen.includes("Advisor ·"), 10_000, "Advisor overlay hidden");
			await pi.submit("/advisor:show");
			await pi.waitForScreen(
				(screen) => screen.includes("Advisor ·") && screen.includes("E2E_ADVISOR_DONE"),
				10_000,
				"Advisor overlay restored",
			);
		},
	},
	{
		id: "small-terminal-overlay",
		title: "Small Terminal Overlay",
		description: "Ask Advisor remains readable when the terminal is narrower and shorter.",
		options: { advisorModelConfigured: true, width: 82, height: 24 },
		captures: ["whole", "overlay"],
		checklist: [
			"Overlay remains a right-side panel instead of a central modal.",
			"Panel border stays closed at the smaller terminal size.",
			"Long tool and advice summaries wrap or truncate without corrupting adjacent lines.",
		],
		async run(pi) {
			await pi.submit("/advisor Review the primary transcript and send a Hint if useful.");
			await pi.waitForScreen(
				(screen) => screen.includes("Advisor · idle") && screen.includes("E2E_ADVISOR_DONE"),
				20_000,
				"Small terminal Advisor overlay completion",
			);
		},
	},
];

const requested = process.argv.slice(2).filter((arg) => arg !== "--");
const selected =
	requested.length === 0 || requested.includes("all")
		? scenarios
		: scenarios.filter((scenario) => requested.includes(scenario.id));
const unknown = requested.filter((id) => id !== "all" && !scenarios.some((scenario) => scenario.id === id));
if (unknown.length > 0) {
	throw new Error(`Unknown visual scenario: ${unknown.join(", ")}. Known: ${scenarios.map((s) => s.id).join(", ")}`);
}

const htmlEntities: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};
const pageStyle = `<style>
body{margin:0;background:#f6f5f0;color:#1f2328;font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{max-width:1180px;margin:0 auto;padding:28px}
h1{font-size:22px;margin:0 0 16px}
h2{font-size:16px;margin:24px 0 8px}
p{max-width:760px}
pre{margin:0;padding:16px;background:#101418;color:#f3f6f8;border:1px solid #d0d7de;overflow:auto;font:14px/1.2 "SFMono-Regular",Consolas,"Liberation Mono",monospace;white-space:pre}
a{color:#0969da}
li{margin:6px 0}
</style>`;
const outputRoot = join(repoRoot, "test-results", "visual");
await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
const indexRows: string[] = [];
for (const scenario of selected) {
	const scenarioDir = join(outputRoot, scenario.id);
	await mkdir(scenarioDir, { recursive: true });
	const pi = await TuiPi.start(scenario.options);
	try {
		await scenario.run(pi);
		const whole = pi.capturePlainText();
		const overlay = scenario.captures.includes("overlay") ? pi.captureAdvisorOverlayPlainText() : undefined;
		const manifest = {
			id: scenario.id,
			title: scenario.title,
			description: scenario.description,
			captures: scenario.captures,
			terminal: {
				width: scenario.options.width ?? 100,
				height: scenario.options.height ?? 30,
				tmux: execFileSync("tmux", ["-V"], { encoding: "utf8" }).trim(),
			},
			generatedAt: new Date().toISOString(),
			checklist: scenario.checklist,
		};
		await writeFile(join(scenarioDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
		await writeFile(
			join(scenarioDir, "checklist.md"),
			`# ${scenario.title}\n\n${scenario.checklist.map((item) => `- [ ] ${item}`).join("\n")}\n`,
			"utf8",
		);
		if (scenario.captures.includes("whole")) {
			await writeFile(join(scenarioDir, "whole.txt"), whole, "utf8");
			const title = `${scenario.title} · Whole TUI`.replace(/[&<>"']/g, (char) => htmlEntities[char] ?? char);
			const content = whole.replace(/[&<>"']/g, (char) => htmlEntities[char] ?? char);
			await writeFile(
				join(scenarioDir, "whole.html"),
				`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${pageStyle}</head><body><main><h1>${title}</h1><pre>${content}</pre></main></body></html>`,
				"utf8",
			);
		}
		if (overlay !== undefined) {
			await writeFile(join(scenarioDir, "overlay.txt"), overlay, "utf8");
			const title = `${scenario.title} · Advisor Overlay`.replace(/[&<>"']/g, (char) => htmlEntities[char] ?? char);
			const content = overlay.replace(/[&<>"']/g, (char) => htmlEntities[char] ?? char);
			await writeFile(
				join(scenarioDir, "overlay.html"),
				`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${pageStyle}</head><body><main><h1>${title}</h1><pre>${content}</pre></main></body></html>`,
				"utf8",
			);
		}
		const title = scenario.title.replace(/[&<>"']/g, (char) => htmlEntities[char] ?? char);
		const description = scenario.description.replace(/[&<>"']/g, (char) => htmlEntities[char] ?? char);
		const artifactLinks = [
			scenario.captures.includes("whole") ? '<li><a href="whole.html">Whole TUI</a></li>' : "",
			overlay !== undefined ? '<li><a href="overlay.html">Advisor Overlay</a></li>' : "",
			'<li><a href="checklist.md">Checklist</a></li>',
			'<li><a href="manifest.json">Manifest</a></li>',
		]
			.filter(Boolean)
			.join("\n");
		const checklist = scenario.checklist
			.map((item) => `<li>${item.replace(/[&<>"']/g, (char) => htmlEntities[char] ?? char)}</li>`)
			.join("\n");
		await writeFile(
			join(scenarioDir, "index.html"),
			`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${pageStyle}</head><body><main><h1>${title}</h1><p>${description}</p><h2>Artifacts</h2><ul>${artifactLinks}</ul><h2>Checklist</h2><ul>${checklist}</ul></main></body></html>`,
			"utf8",
		);
		indexRows.push(`<li><a href="${scenario.id}/index.html">${title}</a><p>${description}</p></li>`);
	} finally {
		await pi.dispose();
	}
}
await writeFile(
	join(outputRoot, "index.html"),
	`<!doctype html><html><head><meta charset="utf-8"><title>Pi Advisor Visual Results</title>${pageStyle}</head><body><main><h1>Pi Advisor Visual Results</h1><ul>${indexRows.join("\n")}</ul></main></body></html>`,
	"utf8",
);
console.log(`Visual artifacts written to ${relative(process.cwd(), outputRoot)}`);
