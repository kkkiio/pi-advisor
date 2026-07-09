import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { AdvisorModelRef, AdvisorResolvedSettings, AdvisorSettings } from "./types";

export const ADVISOR_DEFAULT_THINKING: ThinkingLevel = "medium";
export const ADVISOR_THINKING_LEVELS: readonly ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];

export function getAdvisorAgentDir(): string {
	return join(homedir(), ".pi", "agent");
}

export function getAdvisorSettingsPath(): string {
	return join(getAdvisorAgentDir(), "advisor.json");
}

export function parseAdvisorModelRef(input: string): AdvisorModelRef | undefined {
	const trimmed = input.trim();
	const separator = trimmed.indexOf("/");
	if (separator <= 0 || separator === trimmed.length - 1) {
		return undefined;
	}
	const provider = trimmed.slice(0, separator).trim();
	const id = trimmed.slice(separator + 1).trim();
	if (!provider || !id) {
		return undefined;
	}
	return { provider, id };
}

export function formatAdvisorModelRef(ref: AdvisorModelRef): string {
	return `${ref.provider}/${ref.id}`;
}

export function isAdvisorThinkingLevel(value: string): value is ThinkingLevel {
	return (ADVISOR_THINKING_LEVELS as readonly string[]).includes(value);
}

export class AdvisorSettingsStore {
	readonly path: string;

	constructor(path = getAdvisorSettingsPath()) {
		this.path = path;
	}

	async read(): Promise<AdvisorSettings> {
		try {
			const raw = await readFile(this.path, "utf8");
			const parsed = JSON.parse(raw) as Record<string, unknown>;
			const settings: AdvisorSettings = {};
			if (typeof parsed.model === "string" && parseAdvisorModelRef(parsed.model)) {
				settings.model = parsed.model;
			}
			if (typeof parsed.thinking === "string" && isAdvisorThinkingLevel(parsed.thinking)) {
				settings.thinking = parsed.thinking;
			}
			return settings;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				return {};
			}
			throw error;
		}
	}

	async write(next: AdvisorSettings): Promise<void> {
		const serialized: AdvisorSettings = {};
		if (next.model) {
			const parsed = parseAdvisorModelRef(next.model);
			if (!parsed) {
				throw new Error(`Invalid Advisor model "${next.model}". Use provider/model.`);
			}
			serialized.model = formatAdvisorModelRef(parsed);
		}
		if (next.thinking) {
			if (!isAdvisorThinkingLevel(next.thinking)) {
				throw new Error(`Invalid Advisor thinking level "${next.thinking}".`);
			}
			serialized.thinking = next.thinking;
		}
		await mkdir(dirname(this.path), { recursive: true });
		await writeFile(this.path, `${JSON.stringify(serialized, null, 2)}\n`, "utf8");
	}

	async patch(patch: AdvisorSettings): Promise<AdvisorSettings> {
		const current = await this.read();
		const next: AdvisorSettings = { ...current, ...patch };
		await this.write(next);
		return next;
	}
}

export function resolveAdvisorSettings(
	settings: AdvisorSettings,
	modelRegistry: ModelRegistry,
): AdvisorResolvedSettings | { error: string } {
	if (!settings.model) {
		return { error: `Advisor model is not set. Run /advisor:model <provider/model> first. Config: ${getAdvisorSettingsPath()}` };
	}
	const ref = parseAdvisorModelRef(settings.model);
	if (!ref) {
		return { error: `Advisor model "${settings.model}" is invalid. Use provider/model.` };
	}
	const model = modelRegistry.find(ref.provider, ref.id);
	if (!model) {
		return { error: `Advisor model "${settings.model}" is not registered in Pi.` };
	}
	return {
		model,
		modelRef: formatAdvisorModelRef(ref),
		thinkingLevel: settings.thinking ?? ADVISOR_DEFAULT_THINKING,
	};
}
