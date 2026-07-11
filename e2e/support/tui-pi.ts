import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { advisorExtensionPath, fauxProviderExtensionPath, resolvePiBin } from "./rpc-pi";

export interface TuiPiOptions {
	advisorModelConfigured?: boolean;
	color?: boolean;
	script?: "default" | "watch-wait";
	width?: number;
	height?: number;
}

export class TuiPi {
	readonly root: string;
	readonly cwd: string;
	readonly home: string;
	private readonly tmp: string;
	private readonly socketName: string;
	private readonly sessionName = "pi";
	private readonly stderrPath: string;

	static async start(options: TuiPiOptions): Promise<TuiPi> {
		execFileSync("tmux", ["-V"], { stdio: "pipe" });
		const root = await realpath(await mkdtemp(join(tmpdir(), "pi-advisor-tui-")));
		const homePath = join(root, "home");
		const cwdPath = join(homePath, "work", "project");
		const tmpPath = join(root, "tmp");
		const agentDirPath = join(homePath, ".pi", "agent");
		await mkdir(cwdPath, { recursive: true });
		await mkdir(tmpPath, { recursive: true });
		await mkdir(agentDirPath, { recursive: true });
		const home = await realpath(homePath);
		const cwd = await realpath(cwdPath);
		const tmp = await realpath(tmpPath);
		const agentDir = join(home, ".pi", "agent");
		await writeFile(join(cwd, "README.md"), "# Advisor TUI E2E\n\nE2E_PRIMARY_SENTINEL lives here.\n", "utf8");
		await writeFile(
			join(cwd, "package.json"),
			`${JSON.stringify(
				{
					name: "pi-advisor-tui-e2e-project",
					type: "module",
					pi: { extensions: [advisorExtensionPath, fauxProviderExtensionPath] },
				},
				null,
				2,
			)}\n`,
			"utf8",
		);
		await writeFile(
			join(agentDir, "settings.json"),
			`${JSON.stringify(
				{
					quietStartup: true,
					defaultProjectTrust: "always",
					theme: "light",
					enableInstallTelemetry: false,
				},
				null,
				2,
			)}\n`,
			"utf8",
		);
		if (options.advisorModelConfigured) {
			await writeFile(
				join(agentDir, "advisor.json"),
				`${JSON.stringify({ model: "advisor-e2e/faux-advisor", thinking: "medium" }, null, 2)}\n`,
				"utf8",
			);
		}
		const pi = new TuiPi(root, cwd, home, tmp, `pi-advisor-tui-${process.pid}-${Date.now().toString(36)}`);
		try {
			pi.startTmuxServer();
			pi.startPiProcess(options);
			await pi.waitForScreen(
				(screen) => screen.includes("~/work/project") && screen.includes("faux-primary"),
				20_000,
				"Pi TUI startup",
			);
			return pi;
		} catch (error) {
			await pi.dispose();
			throw error;
		}
	}

	private constructor(root: string, cwd: string, home: string, tmp: string, socketName: string) {
		this.root = root;
		this.cwd = cwd;
		this.home = home;
		this.tmp = tmp;
		this.socketName = socketName;
		this.stderrPath = join(root, "pi.stderr.log");
	}

	async submit(text: string, keys: string[] = ["Enter"]): Promise<void> {
		if (text) {
			this.tmux(["send-keys", "-t", this.sessionName, "-l", text]);
		}
		for (const key of keys) {
			this.tmux(["send-keys", "-t", this.sessionName, key]);
		}
	}

	sendRawInput(data: string): void {
		const bytes = [...Buffer.from(data)].map((byte) => byte.toString(16).padStart(2, "0"));
		this.tmux(["send-keys", "-t", this.sessionName, "-H", ...bytes]);
	}

	capturePlainText(): string {
		return this.tmux(["capture-pane", "-t", this.sessionName, "-p"]);
	}

	captureAnsiText(): string {
		return this.tmux(["capture-pane", "-t", this.sessionName, "-p", "-e"]);
	}

	captureCursorPosition(): { column: number; row: number } {
		const output = this.tmux(["list-panes", "-t", this.sessionName, "-F", "#{cursor_x}:#{cursor_y}"]).trim();
		const match = output.match(/^(\d+):(\d+)$/);
		if (!match) {
			throw new Error(`Could not read TUI cursor position from tmux output: ${output}`);
		}
		return {
			column: Number(match[1]),
			row: Number(match[2]),
		};
	}

	async waitForMouseReporting(expected: boolean, timeoutMs: number, label: string): Promise<void> {
		const started = Date.now();
		let lastOutput = "";
		while (Date.now() - started < timeoutMs) {
			lastOutput = this.tmux([
				"list-panes",
				"-t",
				this.sessionName,
				"-F",
				"#{mouse_standard_flag}:#{mouse_sgr_flag}",
			]).trim();
			if ((lastOutput === "1:1") === expected) {
				return;
			}
			await this.sleep(25);
		}
		throw new Error(`timeout waiting for ${label}; terminal mouse flags were ${lastOutput}`);
	}

	captureAdvisorOverlayPlainText(): string {
		const lines = this.capturePlainText().split("\n");
		const header = lines.find((line) => line.includes("Advisor ·") && line.includes("╭") && line.includes("╮"));
		const overlayStart = header?.indexOf("╭") ?? -1;
		const overlayEnd = header?.indexOf("╮", overlayStart) ?? -1;
		if (overlayStart < 0 || overlayEnd < overlayStart) {
			throw new Error(`Advisor overlay was not found.\n\nScreen:\n${lines.join("\n")}`);
		}
		return lines.map((line) => (line.length > overlayStart ? line.slice(overlayStart, overlayEnd + 1) : "")).join("\n");
	}

	async waitForScreen(predicate: (screen: string) => boolean, timeoutMs: number, label: string): Promise<string> {
		const started = Date.now();
		let lastScreen = "";
		while (Date.now() - started < timeoutMs) {
			lastScreen = this.capturePlainText();
			if (predicate(lastScreen)) {
				return lastScreen;
			}
			await this.sleep(150);
		}
		throw new Error(`timeout waiting for ${label}\n\nLast screen:\n${lastScreen}\n\nStderr:\n${await this.stderr()}`);
	}

	async dispose(): Promise<void> {
		try {
			this.tmux(["kill-server"]);
		} catch {
			// The Pi process may have exited before scenario cleanup.
		}
		await rm(this.root, { recursive: true, force: true });
	}

	private startTmuxServer(): void {
		execFileSync(
			"tmux",
			["-L", this.socketName, "-f", "/dev/null", "new-session", "-d", "-s", "holder", "sleep", "300"],
			{
				stdio: "pipe",
			},
		);
		this.tmux(["set-option", "-g", "extended-keys", "on"]);
		try {
			this.tmux(["set-option", "-g", "extended-keys-format", "csi-u"]);
		} catch {
			// tmux before 3.5 does not support extended-keys-format.
		}
	}

	private startPiProcess(options: TuiPiOptions): void {
		const width = String(options.width ?? 100);
		const height = String(options.height ?? 30);
		const colorEnvironment = options.color ? ["COLORTERM=truecolor", "FORCE_COLOR=3"] : ["NO_COLOR=1"];
		const command = [
			"env",
			"-i",
			'TMUX="$TMUX"',
			`HOME=${shellQuote(this.home)}`,
			"USER=pi-advisor-e2e",
			`PATH=${shellQuote(process.env.PATH ?? "/usr/bin:/bin:/usr/sbin:/sbin")}`,
			"TERM=tmux-256color",
			"LANG=C.UTF-8",
			"LC_ALL=C.UTF-8",
			`TMPDIR=${shellQuote(this.tmp)}`,
			`PI_CODING_AGENT_DIR=${shellQuote(join(this.home, ".pi", "agent"))}`,
			"PI_ADVISOR_TEST_FAUX_API_KEY=test-faux-key",
			`PI_ADVISOR_TEST_SCRIPT=${options.script ?? "default"}`,
			...colorEnvironment,
			"CI=1",
			"PI_OFFLINE=1",
			shellQuote(resolvePiBin()),
			"--offline",
			"--no-session",
			"--no-extensions",
			"--no-skills",
			"--no-prompt-templates",
			"--no-context-files",
			"--no-themes",
			"--extension",
			shellQuote(advisorExtensionPath),
			"--extension",
			shellQuote(fauxProviderExtensionPath),
			"--model",
			"advisor-e2e/faux-primary",
			`2>${shellQuote(this.stderrPath)}`,
		].join(" ");
		this.tmux(["new-session", "-d", "-s", this.sessionName, "-x", width, "-y", height, "-c", this.cwd, command]);
	}

	private tmux(args: string[]): string {
		return execFileSync("tmux", ["-L", this.socketName, ...args], { encoding: "utf8", stdio: "pipe" });
	}

	private async stderr(): Promise<string> {
		try {
			return await readFile(this.stderrPath, "utf8");
		} catch {
			return "";
		}
	}

	private async sleep(ms: number): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, ms));
	}
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, "'\\''")}'`;
}
