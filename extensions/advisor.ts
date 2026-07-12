import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Box, Key, Text } from "@earendil-works/pi-tui";
import { ADVISOR_ADVICE_CUSTOM_TYPE } from "./advisor/types";
import { AdvisorRuntime, renderAdviceMessage } from "./advisor/session";

const ADVISOR_OVERLAY_SHORTCUT = Key.alt("/");

export default function advisorExtension(pi: ExtensionAPI): void {
	const runtime = new AdvisorRuntime(pi);

	pi.registerMessageRenderer(ADVISOR_ADVICE_CUSTOM_TYPE, (message, _options, theme) => {
		const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));
		box.addChild(new Text(renderAdviceMessage(message.content, message.details), 0, 0));
		return box;
	});

	pi.on("session_start", async (_event, ctx) => {
		runtime.bindPrimaryContext(ctx);
	});

	pi.on("session_shutdown", async () => {
		await runtime.dispose();
	});

	pi.on("before_agent_start", async (event, ctx) => {
		runtime.handlePrimaryEvent(event, ctx);
	});

	pi.on("agent_start", async (event, ctx) => {
		runtime.handlePrimaryEvent(event, ctx);
	});

	pi.on("agent_end", async (event, ctx) => {
		runtime.handlePrimaryEvent(event, ctx);
	});

	pi.on("message_end", async (event, ctx) => {
		runtime.handlePrimaryEvent(event, ctx);
	});

	pi.on("message_update", async (event, ctx) => {
		runtime.handlePrimaryEvent(event, ctx);
	});

	pi.on("turn_end", async (event, ctx) => {
		runtime.handlePrimaryEvent(event, ctx);
	});

	pi.on("session_compact", async (event, ctx) => {
		runtime.handlePrimaryEvent(event, ctx);
	});

	pi.on("session_tree", async (event, ctx) => {
		runtime.handlePrimaryEvent(event, ctx);
	});

	pi.registerShortcut(ADVISOR_OVERLAY_SHORTCUT, {
		description: "Open or close the Advisor overlay.",
		handler: async (ctx) => {
			runtime.toggleOverlay(ctx);
		},
	});

	pi.registerCommand("advisor", {
		description: "Ask an idle Advisor with context, or message a running Advisor directly.",
		handler: async (args, ctx) => {
			await runtime.ask(args, ctx);
		},
	});

	pi.registerCommand("advisor:watch", {
		description: "Start one asynchronous Advisor Watch Run.",
		handler: async (_args, ctx) => {
			await runtime.startWatch(ctx);
		},
	});

	pi.registerCommand("advisor:watch-off", {
		description: "Cancel the current Advisor Watch Run and preserve Advisor transcript.",
		handler: async (_args, ctx) => {
			await runtime.cancelWatch(ctx);
		},
	});

	pi.registerCommand("advisor:handoff", {
		description: "Hand off the latest Advisor Second Opinion to the Primary Agent.",
		handler: async (args, ctx) => {
			await runtime.handoff(args, ctx);
		},
	});

	pi.registerCommand("advisor:new", {
		description: "Start a fresh Advisor context and open its overlay.",
		handler: async (_args, ctx) => {
			await runtime.reset(ctx);
		},
	});

	pi.registerCommand("advisor:model", {
		description: "Show or set the user-level Advisor model, e.g. /advisor:model openai/gpt-5.5.",
		handler: async (args, ctx) => {
			await runtime.handleModelCommand(args, ctx);
		},
	});

	pi.registerCommand("advisor:thinking", {
		description: "Show or set the Advisor thinking level.",
		handler: async (args, ctx) => {
			await runtime.handleThinkingCommand(args, ctx);
		},
	});
}
