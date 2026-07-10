import { Given, Then, When } from "@cucumber/cucumber";
import { readFile } from "node:fs/promises";
import { expect } from "vitest";
import type { AdvisorE2EWorld } from "../support/world";

const selectedAdvisorModel = "advisor-e2e/faux-advisor";
const recentPrimaryWork = "E2E_PRIMARY_SENTINEL: review the current Advisor scenario.";

Given("Advisor is installed", async function (this: AdvisorE2EWorld) {
	await this.startRpcPi({});
});

Given("Advisor has no configured model", async function (this: AdvisorE2EWorld) {
	await this.startRpcPi({});
});

Given("Advisor has a configured model", async function (this: AdvisorE2EWorld) {
	await this.startRpcPi({ advisorModelConfigured: true });
});

Given("Advisor is configured for Ask Context review", async function (this: AdvisorE2EWorld) {
	await this.startRpcPi({ advisorModelConfigured: true, script: "ask-context" });
});

Given("Advisor is configured to review the Primary Agent while it is running", async function (this: AdvisorE2EWorld) {
	await this.startRpcPi({ advisorModelConfigured: true, script: "ask-context-streaming" });
});

Given("Advisor is configured to find a timely improvement", async function (this: AdvisorE2EWorld) {
	await this.startRpcPi({ advisorModelConfigured: true, script: "watch-hint" });
});

Given("Advisor is configured with a Second Opinion in progress", async function (this: AdvisorE2EWorld) {
	await this.startRpcPi({ advisorModelConfigured: true, script: "advisor-busy" });
});

Given(
	"Advisor is configured and Watch Run can wait for Primary Agent progress",
	async function (this: AdvisorE2EWorld) {
		await this.startRpcPi({ advisorModelConfigured: true, script: "watch-wait" });
	},
);

Given("the Primary Agent has recent work for Advisor to review", async function (this: AdvisorE2EWorld) {
	await this.rpcPi.promptAndWait(recentPrimaryWork, 30_000);
});

Given("a Pi RPC session with an Advisor model and a waiting Watch Run script", async function (this: AdvisorE2EWorld) {
	await this.startRpcPi({ advisorModelConfigured: true, script: "watch-wait" });
});

Given(
	"the Primary Agent has completed a turn containing {string}",
	async function (this: AdvisorE2EWorld, message: string) {
		await this.rpcPi.promptAndWait(message, 30_000);
	},
);

When("the user asks Advisor {string}", async function (this: AdvisorE2EWorld, message: string) {
	this.lastEventIndex = this.rpcPi.eventCount();
	await this.rpcPi.prompt(`/advisor ${message}`);
	this.previousAdvisorObservation = this.lastAdvisorObservation;
	if (this.advisorModelConfigured) {
		this.lastAdvisorObservation = await this.rpcPi.waitForAdvisorObservation(message, 10_000);
	}
});

When("the Primary Agent starts working on {string}", async function (this: AdvisorE2EWorld, message: string) {
	this.lastEventIndex = this.rpcPi.eventCount();
	await this.rpcPi.prompt(message);
});

When("the user asks Advisor {string} while Advisor is busy", async function (this: AdvisorE2EWorld, message: string) {
	this.lastEventIndex = this.rpcPi.eventCount();
	await this.rpcPi.prompt(`/advisor ${message}`);
});

When("the Primary Agent response {string} becomes visible", async function (this: AdvisorE2EWorld, text: string) {
	const started = Date.now();
	while (Date.now() - started < 20_000) {
		const update = this.rpcPi.events
			.slice(this.lastEventIndex)
			.find(
				(event) =>
					event.type === "message_update" &&
					event.message?.role === "assistant" &&
					JSON.stringify(event.message).includes(text),
			);
		if (update) {
			return;
		}
		await this.rpcPi.sleep(100);
	}
	throw new Error(
		`timeout waiting for visible Primary Agent response ${JSON.stringify(text)} after event ${this.lastEventIndex}`,
	);
});

When("the user asks Advisor without a message", async function (this: AdvisorE2EWorld) {
	this.lastEventIndex = this.rpcPi.eventCount();
	await this.rpcPi.prompt("/advisor");
});

When("the user runs Advisor command {string}", async function (this: AdvisorE2EWorld, command: string) {
	this.lastEventIndex = this.rpcPi.eventCount();
	await this.rpcPi.prompt(command);
});

When("the user selects a registered Advisor model", async function (this: AdvisorE2EWorld) {
	this.lastEventIndex = this.rpcPi.eventCount();
	await this.rpcPi.prompt(`/advisor:model ${selectedAdvisorModel}`);
	this.lastNotification = await this.rpcPi.waitForNotificationAfter(
		/Advisor model set to/i,
		this.lastEventIndex,
		10_000,
	);
});

When("the user sets the Advisor model to {string}", async function (this: AdvisorE2EWorld, modelRef: string) {
	this.lastEventIndex = this.rpcPi.eventCount();
	await this.rpcPi.prompt(`/advisor:model ${modelRef}`);
	this.lastNotification = await this.rpcPi.waitForNotificationAfter(
		/Advisor model set to/i,
		this.lastEventIndex,
		10_000,
	);
});

When("the user sets Advisor thinking to {string}", async function (this: AdvisorE2EWorld, thinking: string) {
	this.lastEventIndex = this.rpcPi.eventCount();
	await this.rpcPi.prompt(`/advisor:thinking ${thinking}`);
	this.lastNotification = await this.rpcPi.waitForNotificationAfter(
		/Advisor thinking set to/i,
		this.lastEventIndex,
		10_000,
	);
});

When("the user starts Watch Run", async function (this: AdvisorE2EWorld) {
	this.lastEventIndex = this.rpcPi.eventCount();
	await this.rpcPi.prompt("/advisor:watch");
});

When("the user starts Watch Run again", async function (this: AdvisorE2EWorld) {
	this.lastEventIndex = this.rpcPi.eventCount();
	await this.rpcPi.prompt("/advisor:watch");
});

When("the user cancels Watch Run", async function (this: AdvisorE2EWorld) {
	await this.rpcPi.waitForNotification(/Advisor Watch Run started/i, 10_000);
	await this.rpcPi.sleep(500);
	await this.rpcPi.prompt("/advisor:watch-off");
});

When("the user turns Watch Run off", async function (this: AdvisorE2EWorld) {
	this.lastEventIndex = this.rpcPi.eventCount();
	await this.rpcPi.prompt("/advisor:watch-off");
});

When("the user resets Advisor", async function (this: AdvisorE2EWorld) {
	this.lastEventIndex = this.rpcPi.eventCount();
	await this.rpcPi.prompt("/advisor:new");
});

When(
	"the user hands off the latest Advisor Second Opinion with {string}",
	async function (this: AdvisorE2EWorld, instructions: string) {
		this.lastEventIndex = this.rpcPi.eventCount();
		await this.rpcPi.prompt(`/advisor:handoff ${instructions}`);
		this.lastNotification = await this.rpcPi.waitForNotificationAfter(
			/Handed off latest Advisor Second Opinion|Queued latest Advisor Second Opinion/i,
			this.lastEventIndex,
			30_000,
		);
	},
);

When("the user opens the Advisor model preference", async function (this: AdvisorE2EWorld) {
	this.lastEventIndex = this.rpcPi.eventCount();
	await this.rpcPi.prompt("/advisor:model");
});

When("the user opens the Advisor thinking preference", async function (this: AdvisorE2EWorld) {
	this.lastEventIndex = this.rpcPi.eventCount();
	await this.rpcPi.prompt("/advisor:thinking");
});

When(
	"the user chooses a registered Advisor model from the Advisor model picker",
	async function (this: AdvisorE2EWorld) {
		this.lastEventIndex = this.rpcPi.eventCount();
		await this.rpcPi.prompt("/advisor:model", { select: selectedAdvisorModel });
		const selection = this.rpcPi.events
			.slice(this.lastEventIndex)
			.find(
				(event) =>
					event.type === "extension_ui_request" &&
					event.method === "select" &&
					/Select Advisor model/i.test(event.title ?? ""),
			);
		if (!selection) {
			throw new Error("Advisor model picker was not shown.");
		}
		this.lastSelect = selection;
		this.lastNotification = await this.rpcPi.waitForNotificationAfter(
			/Advisor model set to/i,
			this.lastEventIndex,
			10_000,
		);
	},
);

When(
	"the user chooses Advisor thinking {string} from the Advisor thinking picker",
	async function (this: AdvisorE2EWorld, thinking: string) {
		this.lastEventIndex = this.rpcPi.eventCount();
		await this.rpcPi.prompt("/advisor:thinking", { select: thinking });
		const selection = this.rpcPi.events
			.slice(this.lastEventIndex)
			.find(
				(event) =>
					event.type === "extension_ui_request" &&
					event.method === "select" &&
					/Select Advisor thinking/i.test(event.title ?? ""),
			);
		if (!selection) {
			throw new Error("Advisor thinking picker was not shown.");
		}
		this.lastSelect = selection;
		this.lastNotification = await this.rpcPi.waitForNotificationAfter(
			/Advisor thinking set to/i,
			this.lastEventIndex,
			10_000,
		);
	},
);

When("the user enters an invalid Advisor model format", async function (this: AdvisorE2EWorld) {
	this.lastEventIndex = this.rpcPi.eventCount();
	await this.rpcPi.prompt("/advisor:model invalid-model-ref");
});

When("the user selects an unavailable Advisor model", async function (this: AdvisorE2EWorld) {
	this.lastEventIndex = this.rpcPi.eventCount();
	await this.rpcPi.prompt("/advisor:model missing-provider/missing-model");
});

When("the user selects an unsupported Advisor thinking level", async function (this: AdvisorE2EWorld) {
	this.lastEventIndex = this.rpcPi.eventCount();
	await this.rpcPi.prompt("/advisor:thinking loud");
});

Then("Advisor commands should be available", async function (this: AdvisorE2EWorld) {
	const commands = await this.rpcPi.getCommands();
	const names = commands.map((command) => command.name);

	expect(names).toEqual(
		expect.arrayContaining([
			"advisor",
			"advisor:watch",
			"advisor:watch-off",
			"advisor:handoff",
			"advisor:hide",
			"advisor:show",
			"advisor:new",
			"advisor:model",
			"advisor:thinking",
		]),
	);
	expect(commands.filter((command) => command.source === "extension").map((command) => command.name)).toContain(
		"advisor",
	);
});

Then("the user should be warned that the Advisor model is not set", async function (this: AdvisorE2EWorld) {
	const notification = await this.rpcPi.waitForNotificationAfter(
		/Advisor model is not set/i,
		this.lastEventIndex,
		10_000,
	);

	expect(notification.notifyType).toBe("warning");
});

Then(
	"the next Advisor notification should contain {string} with type {string}",
	async function (this: AdvisorE2EWorld, text: string, notifyType: string) {
		const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const notification = await this.rpcPi.waitForNotificationAfter(
			new RegExp(escaped, "i"),
			this.lastEventIndex,
			10_000,
		);

		expect(notification.message).toContain(text);
		expect(notification.notifyType).toBe(notifyType);
		this.lastNotification = notification;
	},
);

Then(
	"Advisor settings should be persisted with model {string} and thinking {string}",
	async function (this: AdvisorE2EWorld, modelRef: string, thinking: string) {
		const settings = JSON.parse(await readFile(this.rpcPi.advisorSettingsPath, "utf8"));

		expect(settings).toEqual({ model: modelRef, thinking });
	},
);

Then(
	"Advisor preferences should persist the selected model and thinking {string}",
	async function (this: AdvisorE2EWorld, thinking: string) {
		const settings = JSON.parse(await readFile(this.rpcPi.advisorSettingsPath, "utf8"));

		expect(settings).toEqual({ model: selectedAdvisorModel, thinking });
	},
);

Then("Primary Agent should receive the latest Advisor Second Opinion handoff", async function (this: AdvisorE2EWorld) {
	const message = await this.rpcPi.waitForMessage(
		(candidate) => {
			const serialized = JSON.stringify(candidate);
			return (
				candidate.role === "user" &&
				serialized.includes("Here is the latest Advisor Second Opinion") &&
				serialized.includes("Original Advisor request:") &&
				serialized.includes("Review the primary transcript.") &&
				serialized.includes("Advisor Second Opinion:") &&
				serialized.includes("E2E_SECOND_OPINION: primary_transcript=seen") &&
				serialized.includes("Please verify and apply this if it is real.")
			);
		},
		30_000,
		"Advisor Second Opinion handoff",
	);

	expect(JSON.stringify(message)).not.toContain("advisor-advice");
});

Then("Advisor should deliver a Concern through Follow-up", async function (this: AdvisorE2EWorld) {
	const message = await this.rpcPi.waitForMessage(
		(candidate) =>
			candidate.role === "custom" &&
			candidate.customType === "advisor:advice" &&
			JSON.stringify(candidate).includes("E2E_WATCH_CONCERN"),
		60_000,
		"Advisor Concern custom message",
	);

	expect(message.details).toMatchObject({
		origin: "advisor",
		advisorAdviceKind: "concern",
		deliverAs: "followUp",
	});
	this.lastAdvisorMessage = message;
});

Then("Advisor should deliver a Hint through Steer", async function (this: AdvisorE2EWorld) {
	const message = await this.rpcPi.waitForMessage(
		(candidate) =>
			candidate.role === "custom" &&
			candidate.customType === "advisor:advice" &&
			JSON.stringify(candidate).includes("E2E_WATCH_HINT"),
		60_000,
		"Advisor Hint custom message",
	);

	expect(message.details).toMatchObject({
		origin: "advisor",
		advisorAdviceKind: "hint",
		deliverAs: "steer",
	});
	this.lastAdvisorMessage = message;
});

Then("Advisor should receive the Primary Agent inspection tools", function (this: AdvisorE2EWorld) {
	const observation = this.lastAdvisorObservation;
	if (!observation) {
		throw new Error("No Advisor provider observation was captured for the latest Ask.");
	}
	const toolNames = Array.isArray(observation.toolNames) ? observation.toolNames : [];

	expect(toolNames).toEqual(expect.arrayContaining(["read", "bash", "grep", "pull_transcript", "advise"]));
});

Then("Advisor should not receive file editing tools", function (this: AdvisorE2EWorld) {
	const observation = this.lastAdvisorObservation;
	if (!observation) {
		throw new Error("No Advisor provider observation was captured for the latest Ask.");
	}
	const toolNames = Array.isArray(observation.toolNames) ? observation.toolNames : [];

	expect(toolNames).not.toContain("edit");
	expect(toolNames).not.toContain("write");
});

Then(
	"the latest Advisor Ask should report the Primary Agent state as {string}",
	function (this: AdvisorE2EWorld, state: string) {
		const observation = this.lastAdvisorObservation;
		if (!observation || typeof observation.latestRequestText !== "string") {
			throw new Error("No Advisor provider observation was captured for the latest Ask.");
		}

		expect(observation.latestRequestText).toMatch(/primary_transcript_end_index=\d+/);
		expect(observation.latestRequestText).toContain(`primary_agent_loop_state=${state}`);
	},
);

Then(
	"the latest Ask Context should include Primary text {string} and {string}",
	function (this: AdvisorE2EWorld, userText: string, assistantText: string) {
		const observation = this.lastAdvisorObservation;
		if (!observation || typeof observation.latestRequestText !== "string") {
			throw new Error("No Advisor provider observation was captured for the latest Ask.");
		}

		expect(observation.latestRequestText).toContain("Ask Context:");
		expect(observation.latestRequestText).toContain(userText);
		expect(observation.latestRequestText).toContain(assistantText);
	},
);

Then(
	"the latest Ask Context should omit Primary tool activity {string}",
	function (this: AdvisorE2EWorld, toolActivity: string) {
		const observation = this.lastAdvisorObservation;
		if (!observation || typeof observation.latestRequestText !== "string") {
			throw new Error("No Advisor provider observation was captured for the latest Ask.");
		}

		expect(observation.latestRequestText).not.toContain(toolActivity);
	},
);

Then("the repeated Ask should keep the same Primary Transcript position", function (this: AdvisorE2EWorld) {
	const previous = this.previousAdvisorObservation?.latestRequestText;
	const current = this.lastAdvisorObservation?.latestRequestText;
	if (typeof previous !== "string" || typeof current !== "string") {
		throw new Error("Two Advisor provider observations are required to compare Primary Transcript positions.");
	}
	const previousPosition = previous.match(/primary_transcript_end_index=(\d+)/)?.[1];
	const currentPosition = current.match(/primary_transcript_end_index=(\d+)/)?.[1];

	expect(previousPosition).toBeDefined();
	expect(currentPosition).toBe(previousPosition);
});

Then("the repeated Ask should not include Ask Context", function (this: AdvisorE2EWorld) {
	const observation = this.lastAdvisorObservation;
	if (!observation || typeof observation.latestRequestText !== "string") {
		throw new Error("No Advisor provider observation was captured for the latest Ask.");
	}

	expect(observation.latestRequestText).not.toContain("Ask Context:");
});

Then(
	"Advisor should reject the busy Ask and restore {string}",
	async function (this: AdvisorE2EWorld, completeCommand: string) {
		const notification = await this.rpcPi.waitForNotificationAfter(
			/Advisor is busy\. Try again when the current run finishes\./i,
			this.lastEventIndex,
			10_000,
		);
		const editorEvent = this.rpcPi.events
			.slice(this.lastEventIndex)
			.find((event) => event.type === "extension_ui_request" && event.method === "set_editor_text");
		const observations = (await readFile(this.rpcPi.advisorObservationsPath, "utf8"))
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line));
		const rejectedQuestion = completeCommand.replace(/^\/advisor\s+/, "");

		expect(notification.notifyType).toBe("warning");
		expect(editorEvent?.text).toBe(completeCommand);
		expect(
			observations.some(
				(observation) =>
					typeof observation.latestQuestionText === "string" &&
					observation.latestQuestionText.includes(rejectedQuestion),
			),
		).toBe(false);
	},
);

Then("the delivered Advice should include {string}", function (this: AdvisorE2EWorld, text: string) {
	expect(JSON.stringify(this.lastAdvisorMessage)).toContain(text);
});

Then("the Advice should be based on the Primary Agent's recent work", function (this: AdvisorE2EWorld) {
	expect(JSON.stringify(this.lastAdvisorMessage)).toContain("primary_transcript=seen");
});

Then("Watch Run should be cancelled without delivering a Concern", async function (this: AdvisorE2EWorld) {
	const notification = await this.rpcPi.waitForNotificationAfter(
		/Advisor Watch Run cancelled/i,
		this.lastEventIndex,
		20_000,
	);
	const messages = await this.rpcPi.getMessages();

	expect(notification.notifyType).toBe("info");
	expect(JSON.stringify(messages)).not.toContain("E2E_WATCH_CONCERN");
});

Then("Advisor should warn with {string}", async function (this: AdvisorE2EWorld, text: string) {
	const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const notification = await this.rpcPi.waitForNotificationAfter(new RegExp(escaped, "i"), this.lastEventIndex, 10_000);

	expect(notification.message).toContain(text);
	expect(notification.notifyType).toBe("warning");
	this.lastNotification = notification;
});

Then("Advisor should offer registered Advisor models", async function (this: AdvisorE2EWorld) {
	const selection = this.rpcPi.events
		.slice(this.lastEventIndex)
		.find(
			(event) =>
				event.type === "extension_ui_request" &&
				event.method === "select" &&
				/Select Advisor model/i.test(event.title ?? ""),
		);
	if (!selection) {
		throw new Error("Advisor model picker was not shown.");
	}

	expect(selection.options).toContain(selectedAdvisorModel);
	this.lastSelect = selection;
});

Then(
	"Advisor should offer thinking levels with default {string}",
	async function (this: AdvisorE2EWorld, thinking: string) {
		const selection = this.rpcPi.events
			.slice(this.lastEventIndex)
			.find(
				(event) =>
					event.type === "extension_ui_request" &&
					event.method === "select" &&
					/Select Advisor thinking/i.test(event.title ?? ""),
			);
		if (!selection) {
			throw new Error("Advisor thinking picker was not shown.");
		}

		expect(selection.title).toContain(`current: ${thinking}`);
		expect(selection.options).toEqual(
			expect.arrayContaining(["off", "minimal", "low", `${thinking} (current)`, "high", "xhigh"]),
		);
		this.lastSelect = selection;
	},
);

Then("Advisor should report that the selected model is unavailable", async function (this: AdvisorE2EWorld) {
	const text = "Model missing-provider/missing-model is not registered in Pi.";
	const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const notification = await this.rpcPi.waitForNotificationAfter(new RegExp(escaped, "i"), this.lastEventIndex, 10_000);

	expect(notification.message).toContain(text);
	expect(notification.notifyType).toBe("error");
	this.lastNotification = notification;
});

Then("Advisor should confirm the transcript was reset", async function (this: AdvisorE2EWorld) {
	const text = "Advisor transcript reset.";
	const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const notification = await this.rpcPi.waitForNotificationAfter(new RegExp(escaped, "i"), this.lastEventIndex, 10_000);

	expect(notification.message).toContain(text);
	expect(notification.notifyType).toBe("info");
	this.lastNotification = notification;
});

Then("Advisor should report that no Watch Run is active", async function (this: AdvisorE2EWorld) {
	const text = "No active Advisor Watch Run.";
	const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const notification = await this.rpcPi.waitForNotificationAfter(new RegExp(escaped, "i"), this.lastEventIndex, 10_000);

	expect(notification.message).toContain(text);
	expect(notification.notifyType).toBe("info");
	this.lastNotification = notification;
});

Then("Advisor should report that Watch Run is already running", async function (this: AdvisorE2EWorld) {
	const text = "Advisor Watch Run is already running.";
	const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const notification = await this.rpcPi.waitForNotificationAfter(new RegExp(escaped, "i"), this.lastEventIndex, 10_000);

	expect(notification.message).toContain(text);
	expect(notification.notifyType).toBe("info");
	this.lastNotification = notification;
});
