import { Given, Then, When } from "@cucumber/cucumber";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import type { AdvisorE2EWorld } from "../support/world";

Given("Advisor is configured in the interactive terminal", async function (this: AdvisorE2EWorld) {
	await this.startTuiPi({ advisorModelConfigured: true });
});

Given("Advisor has no configured model in the interactive terminal", async function (this: AdvisorE2EWorld) {
	await this.startTuiPi({});
});

Given("Advisor is configured in a compact interactive terminal", async function (this: AdvisorE2EWorld) {
	await this.startTuiPi({ advisorModelConfigured: true, width: 100, height: 14 });
});

Given("Advisor uses Ctrl+X to expand chats in the interactive terminal", async function (this: AdvisorE2EWorld) {
	await this.startTuiPi({
		advisorModelConfigured: true,
		expandToolsKey: "ctrl+x",
		script: "overlay-pull-collapse",
	});
});

When("the user submits {string} in the TUI", async function (this: AdvisorE2EWorld, text: string) {
	await this.tuiPi.submit(text);
});

When("the user asks Advisor from the main input {string}", async function (this: AdvisorE2EWorld, message: string) {
	await this.tuiPi.submit(`/advisor ${message}`);
});

When("the user gives Primary Agent work to review", async function (this: AdvisorE2EWorld) {
	await this.tuiPi.submit("E2E_PRIMARY_SENTINEL: review the current Advisor scenario.");
});

When("the Primary conversation gains eight chat items", async function (this: AdvisorE2EWorld) {
	await this.tuiPi.submit("PRIMARY_CHAT_USER_1");
	await this.tuiPi.waitForScreen(
		(screen) => screen.includes("PRIMARY_CHAT_AGENT_4"),
		10_000,
		"the fourth Primary chat item",
	);
	await this.tuiPi.submit("PRIMARY_CHAT_USER_5 E2E_PRIMARY_SENTINEL");
	await this.tuiPi.waitForScreen(
		(screen) => screen.includes("PRIMARY_CHAT_AGENT_6"),
		10_000,
		"the sixth Primary chat item",
	);
	await this.tuiPi.submit("PRIMARY_CHAT_USER_7");
	await this.tuiPi.waitForScreen(
		(screen) => screen.includes("PRIMARY_CHAT_AGENT_8"),
		10_000,
		"the eighth Primary chat item",
	);
});

When("the user opens Advisor Overlay from the main input", async function (this: AdvisorE2EWorld) {
	await this.tuiPi.submit("/advisor");
});

When("the user dismisses Advisor Overlay from its input", async function (this: AdvisorE2EWorld) {
	await this.tuiPi.submit("", ["Escape"]);
});

When("the user leaves Advisor Overlay", async function (this: AdvisorE2EWorld) {
	this.tuiPi.sendRawInput("\x1b[47;3u");
});

When("the user returns to Advisor Overlay", async function (this: AdvisorE2EWorld) {
	this.tuiPi.sendRawInput("\x1b[47;3u");
});

When("the user starts a new Advisor conversation from the main input", async function (this: AdvisorE2EWorld) {
	await this.tuiPi.submit("/advisor:new");
});

When("the user presses Ctrl+X in Advisor Overlay", function (this: AdvisorE2EWorld) {
	this.tuiPi.sendRawInput("\x18");
});

When("the user scrolls Advisor Overlay upward with the mouse wheel", async function (this: AdvisorE2EWorld) {
	this.tuiPi.sendRawInput("\x1b[<64;50;8M");
});

When("the user opens the Advisor model picker in the terminal", async function (this: AdvisorE2EWorld) {
	await this.tuiPi.submit("/advisor:model");
	this.lastTuiScreen = await this.tuiPi.waitForScreen(
		(screen) => screen.includes("Only showing models from configured providers") && screen.includes("→ faux-primary"),
		10_000,
		"Advisor model picker",
	);
});

Then("the user can move to another Advisor model", async function (this: AdvisorE2EWorld) {
	const initialScreen = this.lastTuiScreen;
	await this.tuiPi.submit("", ["Down"]);
	const movedScreen = await this.tuiPi.waitForScreen(
		(screen) => screen.includes("→ faux-advisor") && !screen.includes("→ faux-primary"),
		10_000,
		"moved Advisor model selection",
	);

	expect(initialScreen).toContain("→ faux-primary");
	expect(movedScreen).toContain("→ faux-advisor");
	this.lastTuiScreen = movedScreen;
});

When("the user searches the Advisor model picker for {string}", async function (this: AdvisorE2EWorld, search: string) {
	await this.tuiPi.submit("", ["Up"]);
	await this.tuiPi.submit(search, []);
});

Then("the matching Advisor model should become selected", async function (this: AdvisorE2EWorld) {
	const screen = await this.tuiPi.waitForScreen(
		(candidate) => candidate.includes("> faux-advisor") && candidate.includes("→ faux-advisor"),
		10_000,
		"filtered Advisor model selection",
	);

	expect(screen).toContain("> faux-advisor");
	expect(screen).toContain("→ faux-advisor");
	this.lastTuiScreen = screen;
});

When("the user confirms the filtered Advisor model", async function (this: AdvisorE2EWorld) {
	await this.tuiPi.submit("", ["Enter"]);
	await this.tuiPi.waitForScreen(
		(screen) => screen.includes("Advisor model set to advisor-e2e/faux-advisor."),
		10_000,
		"persisted Advisor model notification",
	);
});

Then("the Advisor model preference should be {string}", async function (this: AdvisorE2EWorld, model: string) {
	const settings = JSON.parse(await readFile(join(this.tuiPi.home, ".pi", "agent", "advisor.json"), "utf8"));

	expect(settings.model).toBe(model);
});

Then("the TUI screen should contain {string}", async function (this: AdvisorE2EWorld, text: string) {
	const screen = await this.tuiPi.waitForScreen((candidate) => candidate.includes(text), 10_000, text);

	expect(screen).toContain(text);
});

Then("the TUI screen should not contain {string}", async function (this: AdvisorE2EWorld, text: string) {
	const screen = await this.tuiPi.waitForScreen((candidate) => !candidate.includes(text), 10_000, `no ${text}`);

	expect(screen).not.toContain(text);
});

Then("Advisor Overlay should be visible", async function (this: AdvisorE2EWorld) {
	const screen = await this.tuiPi.waitForScreen(
		(candidate) => candidate.includes("Advisor ·"),
		10_000,
		"Advisor Overlay",
	);

	expect(screen).toContain("Advisor ·");
});

Then("Advisor Overlay input should accept {string}", async function (this: AdvisorE2EWorld, draft: string) {
	await this.tuiPi.waitForScreen(
		(candidate) => candidate.includes("Advisor ·"),
		10_000,
		"Advisor Overlay before focused input",
	);
	await this.tuiPi.submit(draft, []);
	const screen = await this.tuiPi.waitForScreen(
		(candidate) => candidate.includes("Advisor ·") && candidate.includes(draft),
		10_000,
		"focused Advisor Overlay input",
	);

	expect(screen).toContain(draft);
	expect(this.tuiPi.captureAdvisorOverlayPlainText()).toContain(draft);
});

Then("the terminal cursor should be in Advisor Overlay input", async function (this: AdvisorE2EWorld) {
	const screen = this.tuiPi.capturePlainText();
	const lines = screen.split("\n");
	const cursor = this.tuiPi.captureCursorPosition();
	const headerRow = lines.findIndex((line) => line.includes("Advisor ·") && line.includes("╭") && line.includes("╮"));
	const overlayStart = headerRow >= 0 ? (lines[headerRow]?.indexOf("╭") ?? -1) : -1;
	const overlayEnd = headerRow >= 0 ? (lines[headerRow]?.indexOf("╮", overlayStart) ?? -1) : -1;
	const bottomRow = lines.findIndex(
		(line, row) => row > headerRow && overlayStart >= 0 && line[overlayStart] === "╰" && line[overlayEnd] === "╯",
	);

	expect(headerRow).toBeGreaterThanOrEqual(0);
	expect(bottomRow).toBeGreaterThan(headerRow);
	expect(cursor.row).toBe(bottomRow - 1);
	expect(cursor.column).toBeGreaterThan(overlayStart);
	expect(cursor.column).toBeLessThan(overlayEnd);
});

Then("Advisor Overlay should show a completed Second Opinion", async function (this: AdvisorE2EWorld) {
	const screen = await this.tuiPi.waitForScreen(
		(candidate) => candidate.includes("E2E_SECOND_OPINION: primary_transcript=seen"),
		10_000,
		"completed Advisor Second Opinion",
	);

	expect(screen).toContain("E2E_SECOND_OPINION: primary_transcript=seen");
});

Then("Context should preview one user and one agent message", async function (this: AdvisorE2EWorld) {
	await this.tuiPi.waitForScreen(
		(candidate) => candidate.includes("Context") && candidate.includes("user: PRIMARY_CHAT_USER_7"),
		10_000,
		"Context message preview",
	);
	const overlay = this.tuiPi.captureAdvisorOverlayPlainText();

	expect(overlay).not.toContain("Context →");
	expect(overlay).toContain("user: PRIMARY_CHAT_USER_7");
	expect(overlay).toContain("agent: PRIMARY_CHAT_AGENT_8");
});

Then("Pull should summarize all eight Primary chat items", async function (this: AdvisorE2EWorld) {
	await this.tuiPi.waitForScreen(
		(candidate) => candidate.includes("Pull [0, 8) → 8 msgs · 0.0s"),
		10_000,
		"Pull message summary",
	);

	expect(this.tuiPi.captureAdvisorOverlayPlainText()).toContain("Pull [0, 8) → 8 msgs · 0.0s");
});

Then("Pull should show the first five Primary chat lines", function (this: AdvisorE2EWorld) {
	const overlay = this.tuiPi.captureAdvisorOverlayPlainText();

	expect(overlay).toContain("user: PRIMARY_CHAT_USER_1");
	expect(overlay).toContain("agent: PRIMARY_CHAT_AGENT_2");
	expect(overlay).toContain("→ read(README.md) ⇒ ok");
	expect(overlay).toContain("agent: PRIMARY_CHAT_AGENT_4");
	expect(overlay).toContain("user: PRIMARY_CHAT_USER_5");
	expect(overlay).not.toContain("agent: PRIMARY_CHAT_AGENT_6");
});

Then("Pull should offer to expand the remaining three lines with Ctrl+X", function (this: AdvisorE2EWorld) {
	const overlay = this.tuiPi.captureAdvisorOverlayPlainText();

	expect(overlay).toContain("... (3 more lines, ctrl+x to expand)");
	expect(overlay.match(/PRIMARY_CHAT_USER_7/g)).toHaveLength(1);
	expect(overlay.match(/PRIMARY_CHAT_AGENT_8/g)).toHaveLength(1);
});

Then(
	"Context and Pull should reveal the exact payloads without losing the current transcript position",
	async function (this: AdvisorE2EWorld) {
		await this.tuiPi.waitForScreen(
			(candidate) => candidate.includes('<primary-transcript start="0" end="8"') && candidate.includes("**user**:"),
			10_000,
			"expanded Pull payload",
		);
		let overlay = this.tuiPi.captureAdvisorOverlayPlainText();

		expect(overlay).toMatch(/Advisor · idle · ctx .* · ↑0 ↓\d+/);
		expect(overlay).toContain('<primary-context end="8" state="idle">');
		expect(overlay).toContain("**primary**:");
		expect(overlay).toContain("</primary-context>");
		expect(overlay).toContain('state="idle"');
		expect(overlay).toContain('wait="new_messages"');
		expect(overlay).toContain("**user**:");
		expect(overlay).toContain("PRIMARY_CHAT_USER_1");
		expect(overlay).toContain("→ read(README.md) ⇒ ok");
		expect(overlay).not.toContain("... (3 more lines, ctrl+x to expand)");

		await this.tuiPi.submit("", ["PageDown"]);
		await this.tuiPi.waitForScreen(
			(candidate) => candidate.includes("PRIMARY_CHAT_AGENT_6") && candidate.includes("</primary-transcript>"),
			10_000,
			"expanded Pull payload tail",
		);
		overlay = this.tuiPi.captureAdvisorOverlayPlainText();
		expect(overlay).toContain("**agent**:");
		expect(overlay).toContain("PRIMARY_CHAT_AGENT_6");
		expect(overlay).toContain("</primary-transcript>");
	},
);

Then("Pull should return to its five-line preview", async function (this: AdvisorE2EWorld) {
	await this.tuiPi.waitForScreen(
		(candidate) =>
			!candidate.includes("agent: PRIMARY_CHAT_AGENT_6") && candidate.includes("... (3 more lines, ctrl+x to expand)"),
		10_000,
		"collapsed Pull chat items",
	);
	const overlay = this.tuiPi.captureAdvisorOverlayPlainText();

	expect(overlay).toContain("user: PRIMARY_CHAT_USER_5");
	expect(overlay).not.toContain("agent: PRIMARY_CHAT_AGENT_6");
	expect(overlay.match(/PRIMARY_CHAT_USER_7/g)).toHaveLength(1);
	expect(overlay.match(/PRIMARY_CHAT_AGENT_8/g)).toHaveLength(1);
	expect(overlay).toContain("... (3 more lines, ctrl+x to expand)");
});

Then(
	"Context and Pull should preserve the Primary text {string}",
	async function (this: AdvisorE2EWorld, text: string) {
		await this.tuiPi.waitForScreen(
			(candidate) => candidate.includes("Context") && candidate.includes("Pull [0, 2)"),
			10_000,
			"Context and Pull chat items",
		);
		const overlay = this.tuiPi.captureAdvisorOverlayPlainText();
		const contextStart = overlay.indexOf("Context");
		const pullStart = overlay.indexOf("Pull [", contextStart);
		const contextText = overlay.indexOf(text, contextStart);
		const pullText = overlay.indexOf(text, contextText + 1);

		expect(contextStart).toBeGreaterThanOrEqual(0);
		expect(contextText).toBeGreaterThan(contextStart);
		expect(contextText).toBeLessThan(pullStart);
		expect(pullText).toBeGreaterThan(pullStart);
	},
);

Then("mouse wheel interaction should be active for Advisor Overlay", async function (this: AdvisorE2EWorld) {
	await this.tuiPi.waitForMouseReporting(true, 2_000, "focused Advisor Overlay mouse interaction");
});

Then("normal terminal mouse interaction should be available", async function (this: AdvisorE2EWorld) {
	await this.tuiPi.waitForMouseReporting(false, 2_000, "normal terminal mouse interaction");
});

Then("Primary Agent should finish the work for Advisor", async function (this: AdvisorE2EWorld) {
	const screen = await this.tuiPi.waitForScreen(
		(candidate) => candidate.includes("E2E_PRIMARY_RESPONSE: primary agent completed a deterministic faux turn."),
		10_000,
		"completed Primary Agent work",
	);

	expect(screen).toContain("E2E_PRIMARY_RESPONSE: primary agent completed a deterministic faux turn.");
});

Then("Advisor Overlay should show content below the viewport", async function (this: AdvisorE2EWorld) {
	const screen = await this.tuiPi.waitForScreen(
		(candidate) => /· ↑\d+ ↓[1-9]\d*/.test(candidate),
		10_000,
		"Advisor Overlay scrolled above the latest content",
	);

	expect(screen).toContain("Advisor ·");
	expect(this.tuiPi.captureAdvisorOverlayPlainText()).toMatch(/· ↑\d+ ↓[1-9]\d*/);
});

Then("the main input should accept {string}", async function (this: AdvisorE2EWorld, draft: string) {
	await this.tuiPi.submit(draft, []);
	const screen = await this.tuiPi.waitForScreen(
		(candidate) => candidate.includes(draft),
		10_000,
		"focused Primary input",
	);

	expect(screen).toContain(draft);
});

Then("Advisor Overlay should be hidden", async function (this: AdvisorE2EWorld) {
	const screen = await this.tuiPi.waitForScreen(
		(candidate) => !candidate.includes("Advisor ·"),
		10_000,
		"hidden Advisor Overlay",
	);

	expect(screen).not.toContain("Advisor ·");
});
