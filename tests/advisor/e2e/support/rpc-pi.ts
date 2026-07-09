import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";

export type RpcJson = Record<string, any>;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const advisorExtensionPath = join(repoRoot, "extensions", "advisor.ts");
const fauxProviderExtensionPath = join(here, "..", "fixtures", "faux-provider.ts");
const advisorProvider = "advisor-e2e";
const primaryModel = "faux-primary";
const advisorModel = "faux-advisor";

export const e2eTestTimeoutMs = 60_000;

export interface RpcPiOptions {
	advisorModelConfigured?: boolean;
	script?: "default" | "watch-wait";
}

export async function withRpcPi(options: RpcPiOptions, run: (pi: RpcPi) => Promise<void>): Promise<void> {
	const pi = await RpcPi.start(options);
	try {
		await run(pi);
	} finally {
		await pi.dispose();
	}
}

export class RpcPi {
	readonly root: string;
	readonly cwd: string;
	readonly home: string;
	readonly advisorSettingsPath: string;
	private readonly proc: ChildProcessWithoutNullStreams;
	private readonly events: RpcJson[] = [];
	private readonly pending = new Map<
		string,
		{ resolve: (response: RpcJson) => void; reject: (error: Error) => void }
	>();
	private stderr = "";
	private nextRequestId = 0;

	static async start(options: RpcPiOptions): Promise<RpcPi> {
		const root = await mkdtemp(join(tmpdir(), "pi-advisor-e2e-"));
		const cwd = join(root, "project");
		const home = join(root, "home");
		const agentDir = join(home, ".pi", "agent");
		await mkdir(cwd, { recursive: true });
		await mkdir(agentDir, { recursive: true });
		await writeFile(join(cwd, "README.md"), "# Advisor E2E\n\nE2E_PRIMARY_SENTINEL lives here.\n", "utf8");
		await writeFile(
			join(cwd, "package.json"),
			`${JSON.stringify(
				{
					name: "pi-advisor-e2e-project",
					type: "module",
					pi: { extensions: [advisorExtensionPath, fauxProviderExtensionPath] },
				},
				null,
				2,
			)}\n`,
			"utf8",
		);
		if (options.advisorModelConfigured) {
			await writeFile(
				join(agentDir, "advisor.json"),
				`${JSON.stringify({ model: `${advisorProvider}/${advisorModel}`, thinking: "medium" }, null, 2)}\n`,
				"utf8",
			);
		}

		const env = {
			...process.env,
			HOME: home,
			PI_ADVISOR_TEST_FAUX_API_KEY: "test-faux-key",
			PI_ADVISOR_TEST_SCRIPT: options.script ?? "default",
			NO_COLOR: "1",
			CI: "1",
		};
		const proc = spawn(
			resolvePiBin(),
			[
				"--mode",
				"rpc",
				"--extension",
				advisorExtensionPath,
				"--extension",
				fauxProviderExtensionPath,
				"--session-dir",
				join(root, ".sessions"),
			],
			{ cwd, env, stdio: ["pipe", "pipe", "pipe"] },
		);
		const pi = new RpcPi(root, cwd, home, proc);
		pi.attachReaders();
		await pi.request({ type: "get_state" }, 20_000);
		await pi.setModel(advisorProvider, primaryModel);
		return pi;
	}

	private constructor(root: string, cwd: string, home: string, proc: ChildProcessWithoutNullStreams) {
		this.root = root;
		this.cwd = cwd;
		this.home = home;
		this.proc = proc;
		this.advisorSettingsPath = join(home, ".pi", "agent", "advisor.json");
	}

	async prompt(message: string): Promise<RpcJson> {
		return this.request({ type: "prompt", message }, 30_000);
	}

	async promptAndWait(message: string, timeoutMs: number): Promise<RpcJson[]> {
		const before = this.events.length;
		await this.prompt(message);
		await this.waitFor(
			() => this.events.slice(before).some((event) => event.type === "agent_end"),
			timeoutMs,
			"agent_end",
		);
		return this.events.slice(before);
	}

	async getCommands(): Promise<RpcJson[]> {
		const response = await this.request({ type: "get_commands" }, 20_000);
		return response.data?.commands ?? [];
	}

	async setModel(provider: string, modelId: string): Promise<RpcJson> {
		const response = await this.request({ type: "set_model", provider, modelId }, 20_000);
		return response.data ?? {};
	}

	async getMessages(): Promise<RpcJson[]> {
		const response = await this.request({ type: "get_messages" }, 20_000);
		return response.data?.messages ?? [];
	}

	async waitForNotification(pattern: RegExp, timeoutMs: number): Promise<RpcJson> {
		return this.waitFor(
			() =>
				this.events.find(
					(event) =>
						event.type === "extension_ui_request" && event.method === "notify" && pattern.test(event.message ?? ""),
				),
			timeoutMs,
			`notification matching ${pattern}`,
		);
	}

	async waitForMessage(predicate: (message: RpcJson) => boolean, timeoutMs: number, label: string): Promise<RpcJson> {
		const started = Date.now();
		while (Date.now() - started < timeoutMs) {
			const message = (await this.getMessages()).find(predicate);
			if (message) {
				return message;
			}
			await this.sleep(150);
		}
		throw new Error(`timeout waiting for ${label}\nStderr:\n${this.stderr}`);
	}

	async sleep(ms: number): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, ms));
	}

	async dispose(): Promise<void> {
		for (const pending of this.pending.values()) {
			pending.reject(new Error("RPC process disposed"));
		}
		this.pending.clear();
		if (!this.proc.killed) {
			this.proc.kill("SIGTERM");
			await Promise.race([
				new Promise<void>((resolve) => this.proc.once("exit", () => resolve())),
				this.sleep(1_000).then(() => {
					if (!this.proc.killed) {
						this.proc.kill("SIGKILL");
					}
				}),
			]);
		}
		await rm(this.root, { recursive: true, force: true });
	}

	private request(command: RpcJson, timeoutMs: number): Promise<RpcJson> {
		const id = `req_${++this.nextRequestId}`;
		const request = { ...command, id };
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`timeout waiting for ${command.type} response\nStderr:\n${this.stderr}`));
			}, timeoutMs);
			this.pending.set(id, {
				resolve: (response) => {
					clearTimeout(timeout);
					if (response.success === false) {
						reject(new Error(response.error ?? `RPC ${command.type} failed`));
						return;
					}
					resolve(response);
				},
				reject: (error) => {
					clearTimeout(timeout);
					reject(error);
				},
			});
			this.proc.stdin.write(`${JSON.stringify(request)}\n`);
		});
	}

	private attachReaders(): void {
		let buffer = "";
		const decoder = new StringDecoder("utf8");
		this.proc.stdout.on("data", (chunk) => {
			buffer += decoder.write(chunk);
			for (;;) {
				const nextLine = buffer.indexOf("\n");
				if (nextLine === -1) {
					break;
				}
				let line = buffer.slice(0, nextLine);
				buffer = buffer.slice(nextLine + 1);
				if (line.endsWith("\r")) {
					line = line.slice(0, -1);
				}
				this.handleLine(line);
			}
		});
		this.proc.stderr.on("data", (chunk) => {
			this.stderr += String(chunk);
		});
		this.proc.on("exit", (code) => {
			for (const [id, pending] of this.pending) {
				pending.reject(new Error(`RPC process exited with code ${code}\nStderr:\n${this.stderr}`));
				this.pending.delete(id);
			}
		});
	}

	private handleLine(line: string): void {
		if (!line.trim()) {
			return;
		}
		let event: RpcJson;
		try {
			event = JSON.parse(line);
		} catch {
			return;
		}
		this.events.push(event);
		if (event.type === "response" && event.id && this.pending.has(event.id)) {
			const pending = this.pending.get(event.id);
			this.pending.delete(event.id);
			pending?.resolve(event);
		}
		if (event.type === "extension_ui_request" && ["select", "input", "editor", "confirm"].includes(event.method)) {
			const response =
				event.method === "confirm"
					? { type: "extension_ui_response", id: event.id, confirmed: false }
					: { type: "extension_ui_response", id: event.id, cancelled: true };
			this.proc.stdin.write(`${JSON.stringify(response)}\n`);
		}
	}

	private async waitFor<T>(predicate: () => T | undefined | false, timeoutMs: number, label: string): Promise<T> {
		const started = Date.now();
		while (Date.now() - started < timeoutMs) {
			const value = predicate();
			if (value) {
				return value;
			}
			await this.sleep(100);
		}
		throw new Error(`timeout waiting for ${label}\nStderr:\n${this.stderr}`);
	}
}

function resolvePiBin(): string {
	const localPi = join(repoRoot, "node_modules", ".bin", "pi");
	if (existsSync(localPi)) {
		return localPi;
	}
	return execFileSync("sh", ["-lc", "command -v pi"], { encoding: "utf8" }).trim();
}
