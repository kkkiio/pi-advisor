import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { visibleWidth } from "@earendil-works/pi-tui";
import { TuiPi, type TuiPiOptions } from "../../e2e/support/tui-pi";
import { repoRoot } from "../../e2e/support/rpc-pi";
import { GhosttyWebScreenshotRenderer } from "./ghostty-web-renderer";

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
		description:
			"Ask Advisor opens the top-center overlay with the user message, actual context, Pull, and advisor output.",
		options: { advisorModelConfigured: true, width: 100, height: 30 },
		captures: ["whole", "overlay"],
		checklist: [
			"Whole TUI shows the overlay anchored at top-center with the dedicated input row.",
			"Overlay does not cover the primary input/status area in a way that makes it unreadable.",
			"User message uses the Primary transcript's foreground and a background that reaches both panel edges.",
			"Overlay panel includes the user message, actual Context text, one-line Pull, and advisor output in order.",
			"Prompt, Tool, and Advisor badges are absent while Context remains labeled.",
			"Pull shows its returned range without arguments or a separate result line.",
			"Advisor completion text is visible without breaking panel borders.",
		],
		async run(pi) {
			await pi.submit("E2E_PRIMARY_SENTINEL: review the current Advisor scenario.");
			await pi.waitForScreen(
				(screen) => screen.includes("E2E_PRIMARY_RESPONSE"),
				10_000,
				"Primary work before Ask Advisor",
			);
			await pi.submit("/advisor Review the primary transcript.");
			await pi.waitForScreen(
				(screen) => screen.includes("Advisor · idle") && screen.includes("E2E_SECOND_OPINION"),
				20_000,
				"Ask Advisor overlay completion",
			);
		},
	},
	{
		id: "unfocused-overlay-input",
		title: "Unfocused Advisor Overlay Input",
		description: "Unfocusing Advisor preserves its draft while removing the Overlay software cursor.",
		options: { advisorModelConfigured: true, width: 100, height: 30 },
		captures: ["whole", "overlay"],
		checklist: [
			"The complete Advisor draft remains visible after focus returns to the Primary input.",
			"The unfocused Advisor input has no reverse-video software cursor.",
			"The Overlay stays open and its input row keeps the same geometry as the focused capture.",
		],
		async run(pi) {
			await pi.submit("/advisor");
			await pi.waitForMouseReporting(true, 2_000, "focused Advisor Overlay before draft entry");
			await pi.submit("Review this draft", []);
			await pi.waitForScreen(
				(screen) => screen.includes("Advisor ·") && screen.includes("Review this draft"),
				10_000,
				"Advisor Overlay draft before unfocus",
			);
			pi.sendRawInput("\x1b[47;3u");
			await pi.waitForMouseReporting(false, 2_000, "unfocused Advisor Overlay draft");
			await pi.waitForAnsiScreen(
				(screen) => {
					const inputLine = screen.split("\n").find((line) => line.includes("Review this draft"));
					return inputLine !== undefined && !inputLine.includes("\x1b[7m");
				},
				2_000,
				"unfocused Advisor Overlay software cursor removal",
			);
		},
	},
	{
		id: "focused-overlay-input",
		title: "Focused Advisor Overlay Input",
		description: "Opening Advisor without a message focuses its input and displays the Overlay software cursor.",
		options: { advisorModelConfigured: true, width: 100, height: 30 },
		captures: ["whole", "overlay"],
		checklist: [
			"Focused Advisor input shows a reverse-video software cursor after the draft.",
			"The same draft has no software cursor in the unfocused Advisor input capture.",
			"Adding the focused cursor does not shift or open the Overlay border.",
		],
		async run(pi) {
			await pi.submit("/advisor");
			await pi.waitForScreen((screen) => screen.includes("Advisor ·"), 10_000, "focused Advisor Overlay");
			await pi.submit("Review this draft", []);
			await pi.waitForScreen(
				(screen) => screen.includes("Advisor ·") && screen.includes("Review this draft"),
				10_000,
				"focused Advisor Overlay draft",
			);
			await pi.waitForAnsiScreen(
				(screen) => {
					const inputLine = screen.split("\n").find((line) => line.includes("Review this draft"));
					return inputLine?.includes("\x1b[7m") ?? false;
				},
				2_000,
				"focused Advisor Overlay software cursor",
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
			"Overlay can be shown again at top-center.",
			"Restored overlay still contains the previous Advisor output.",
		],
		async run(pi) {
			await pi.submit("E2E_PRIMARY_SENTINEL: preserve this context while hiding the overlay.");
			await pi.waitForScreen(
				(screen) => screen.includes("E2E_PRIMARY_RESPONSE"),
				10_000,
				"Primary work before hide and show",
			);
			await pi.submit("/advisor Review the primary transcript.");
			await pi.waitForScreen(
				(screen) => screen.includes("Advisor · idle") && screen.includes("E2E_SECOND_OPINION"),
				20_000,
				"Ask Advisor overlay completion before hide",
			);
			await pi.submit("/advisor:hide");
			await pi.waitForScreen((screen) => !screen.includes("Advisor ·"), 10_000, "Advisor overlay hidden");
			await pi.submit("/advisor:show");
			await pi.waitForScreen(
				(screen) => screen.includes("Advisor ·") && screen.includes("E2E_SECOND_OPINION"),
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
			"Overlay remains a bounded top-center panel at the smaller terminal size.",
			"Panel border stays closed at the smaller terminal size.",
			"Context and Advisor text wrap without corrupting adjacent lines.",
		],
		async run(pi) {
			await pi.submit("E2E_PRIMARY_SENTINEL: verify the narrow Context block.");
			await pi.waitForScreen(
				(screen) => screen.includes("E2E_PRIMARY_RESPONSE"),
				10_000,
				"Primary work before small-terminal Ask",
			);
			await pi.submit("/advisor Review the primary transcript.");
			await pi.waitForScreen(
				(screen) => screen.includes("Advisor · idle") && screen.includes("E2E_SECOND_OPINION"),
				20_000,
				"Small terminal Advisor overlay completion",
			);
		},
	},
	{
		id: "long-pull-progress",
		title: "Long Pull Progress",
		description: "A Pull that waits longer than three seconds shows a live elapsed time on one line.",
		options: { advisorModelConfigured: true, script: "watch-wait", width: 100, height: 24 },
		captures: ["overlay"],
		checklist: [
			"The in-progress Pull remains a single compact line.",
			"Elapsed time appears only after the three-second threshold.",
			"The running Watch Run keeps the overlay border and Primary input area intact.",
		],
		async run(pi) {
			await pi.submit("/advisor:watch");
			await pi.waitForScreen((screen) => screen.includes("Pulling… 4s"), 10_000, "long Pull elapsed time");
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
.terminal{display:block;max-width:100%;height:auto;background:#f8f8f8;border:1px solid #d0d7de}
.scenario{margin:0 0 24px;padding:16px;border:1px solid #d0d7de;border-radius:8px;background:#fff}
.scenario img{margin-top:8px}
a{color:#0969da}
li{margin:6px 0}
</style>`;
const outputRoot = join(repoRoot, "test-results", "visual");
await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
const indexRows: string[] = [];
const renderer = await GhosttyWebScreenshotRenderer.start();
try {
	for (const scenario of selected) {
		const scenarioDir = join(outputRoot, scenario.id);
		await mkdir(scenarioDir, { recursive: true });
		const pi = await TuiPi.start({ ...scenario.options, color: true });
		try {
			await scenario.run(pi);
			const whole = pi.capturePlainText();
			const wholeAnsi = pi.captureAnsiText();
			const overlay = scenario.captures.includes("overlay") ? pi.captureAdvisorOverlayPlainText() : undefined;
			const manifest = {
				id: scenario.id,
				title: scenario.title,
				description: scenario.description,
				captures: scenario.captures,
				terminal: {
					color: "ansi-sgr",
					width: scenario.options.width ?? 100,
					height: scenario.options.height ?? 30,
					tmux: execFileSync("tmux", ["-V"], { encoding: "utf8" }).trim(),
					renderer: renderer.metadata,
				},
				generatedAt: new Date().toISOString(),
				artifacts: {
					whole: scenario.captures.includes("whole")
						? { text: "whole.txt", image: "whole.png", html: "whole.html" }
						: undefined,
					overlay:
						overlay !== undefined ? { text: "overlay.txt", image: "overlay.png", html: "overlay.html" } : undefined,
				},
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
				await renderer.screenshot({
					ansiText: wholeAnsi,
					columns: scenario.options.width ?? 100,
					rows: scenario.options.height ?? 30,
					outputPath: join(scenarioDir, "whole.png"),
				});
				await writeFile(
					join(scenarioDir, "whole.html"),
					`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${pageStyle}</head><body><main><h1>${title}</h1><img class="terminal" src="whole.png" alt="${title}"><h2>Text</h2><pre>${content}</pre></main></body></html>`,
					"utf8",
				);
			}
			if (overlay !== undefined) {
				await writeFile(join(scenarioDir, "overlay.txt"), overlay, "utf8");
				const title = `${scenario.title} · Advisor Overlay`.replace(/[&<>"']/g, (char) => htmlEntities[char] ?? char);
				const content = overlay.replace(/[&<>"']/g, (char) => htmlEntities[char] ?? char);
				const overlayColumns = Math.max(...overlay.split("\n").map((line) => visibleWidth(line)));
				const overlayHeader = whole.split("\n").find((line) => line.includes("Advisor ·") && line.includes("╭"));
				const overlayStart = overlayHeader?.indexOf("╭") ?? -1;
				if (overlayStart < 0) {
					throw new Error(`Could not locate Advisor Overlay start column for ${scenario.id}.`);
				}
				await renderer.screenshot({
					ansiText: wholeAnsi,
					columns: scenario.options.width ?? 100,
					rows: scenario.options.height ?? 30,
					outputPath: join(scenarioDir, "overlay.png"),
					crop: {
						startColumn: visibleWidth(overlayHeader?.slice(0, overlayStart) ?? ""),
						columns: overlayColumns,
					},
				});
				await writeFile(
					join(scenarioDir, "overlay.html"),
					`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${pageStyle}</head><body><main><h1>${title}</h1><img class="terminal" src="overlay.png" alt="${title}"><h2>Text</h2><pre>${content}</pre></main></body></html>`,
					"utf8",
				);
			}
			const title = scenario.title.replace(/[&<>"']/g, (char) => htmlEntities[char] ?? char);
			const description = scenario.description.replace(/[&<>"']/g, (char) => htmlEntities[char] ?? char);
			const artifactLinks = [
				scenario.captures.includes("whole")
					? '<li><a href="whole.html">Whole TUI review</a> · <a href="whole.png">PNG</a> · <a href="whole.txt">text</a></li>'
					: "",
				overlay !== undefined
					? '<li><a href="overlay.html">Advisor Overlay review</a> · <a href="overlay.png">PNG</a> · <a href="overlay.txt">text</a></li>'
					: "",
				'<li><a href="checklist.md">Checklist</a></li>',
				'<li><a href="manifest.json">Manifest</a></li>',
			]
				.filter(Boolean)
				.join("\n");
			const checklist = scenario.checklist
				.map((item) => `<li>${item.replace(/[&<>"']/g, (char) => htmlEntities[char] ?? char)}</li>`)
				.join("\n");
			const previews = [
				scenario.captures.includes("whole")
					? `<h2>Whole TUI</h2><a href="whole.png"><img class="terminal" src="whole.png" alt="${title} Whole TUI"></a>`
					: "",
				overlay !== undefined
					? `<h2>Advisor Overlay</h2><a href="overlay.png"><img class="terminal" src="overlay.png" alt="${title} Advisor Overlay"></a>`
					: "",
			]
				.filter(Boolean)
				.join("\n");
			await writeFile(
				join(scenarioDir, "index.html"),
				`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${pageStyle}</head><body><main><h1>${title}</h1><p>${description}</p><h2>Artifacts</h2><ul>${artifactLinks}</ul>${previews}<h2>Checklist</h2><ul>${checklist}</ul></main></body></html>`,
				"utf8",
			);
			const preview = overlay !== undefined ? "overlay.png" : "whole.png";
			indexRows.push(
				`<section class="scenario"><h2><a href="${scenario.id}/index.html">${title}</a></h2><p>${description}</p><a href="${scenario.id}/index.html"><img class="terminal" src="${scenario.id}/${preview}" alt="${title}"></a></section>`,
			);
		} finally {
			await pi.dispose();
		}
	}
	await writeFile(
		join(outputRoot, "index.html"),
		`<!doctype html><html><head><meta charset="utf-8"><title>Pi Advisor Visual Results</title>${pageStyle}</head><body><main><h1>Pi Advisor Visual Results</h1>${indexRows.join("\n")}</main></body></html>`,
		"utf8",
	);
} finally {
	await renderer.close();
}
console.log(`Visual artifacts written to ${relative(process.cwd(), outputRoot)}`);
