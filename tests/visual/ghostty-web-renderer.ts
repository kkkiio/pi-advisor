import { createServer, type Server } from "node:http";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright-core";

export interface TerminalScreenshotInput {
	ansiText: string;
	columns: number;
	rows: number;
	outputPath: string;
	crop?: { startColumn: number; columns: number };
}

export interface GhosttyWebRendererMetadata {
	engine: "ghostty-web CanvasRenderer";
	ghosttyWeb: string;
	browser: string;
	deviceScaleFactor: number;
	fontFamily: string;
	fontSize: number;
}

const DEVICE_SCALE_FACTOR = 2;
const FONT_FAMILY = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace';
const FONT_SIZE = 14;
const HARNESS_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
html,body{margin:0;background:#fdf6e3}
#terminal{display:inline-block}
#terminal canvas{display:block}
</style>
</head>
<body>
<div id="terminal"></div>
<script type="module">
import { init, Terminal } from "/ghostty-web.js";
await init();
window.renderTerminal = async (input) => {
  const host = document.getElementById("terminal");
  host.replaceChildren();
  const terminal = new Terminal({
    cols: input.columns,
    rows: input.rows,
    cursorBlink: false,
    disableStdin: true,
    convertEol: false,
    allowTransparency: false,
    scrollback: 100,
    fontFamily: input.fontFamily,
    fontSize: input.fontSize,
    theme: {
      background: "#fdf6e3",
      foreground: "#586e75",
      cursor: "#657b83",
      cursorAccent: "#fdf6e3",
      selectionBackground: "#eee8d5",
      black: "#073642",
      red: "#dc322f",
      green: "#859900",
      yellow: "#b58900",
      blue: "#268bd2",
      magenta: "#d33682",
      cyan: "#2aa198",
      white: "#eee8d5",
      brightBlack: "#002b36",
      brightRed: "#cb4b16",
      brightGreen: "#586e75",
      brightYellow: "#657b83",
      brightBlue: "#839496",
      brightMagenta: "#6c71c4",
      brightCyan: "#93a1a1",
      brightWhite: "#fdf6e3"
    }
  });
  terminal.open(host);
  await new Promise((resolve) => terminal.write(input.ansiText + "\u001b[?25l", resolve));
  window.currentTerminal = terminal;
};
</script>
</body>
</html>`;

export class GhosttyWebScreenshotRenderer {
	readonly metadata: GhosttyWebRendererMetadata;
	readonly #browser: Browser;
	readonly #server: Server;
	readonly #origin: string;

	static async start(): Promise<GhosttyWebScreenshotRenderer> {
		const modulePath = fileURLToPath(import.meta.resolve("ghostty-web"));
		const moduleBytes = await readFile(modulePath);
		const packageJson = JSON.parse(await readFile(resolve(dirname(modulePath), "../package.json"), "utf8")) as {
			version: string;
		};
		const server = createServer((request, response) => {
			if (request.url === "/ghostty-web.js") {
				response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
				response.end(moduleBytes);
				return;
			}
			response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
			response.end(HARNESS_HTML);
		});
		const listening = Promise.withResolvers<void>();
		server.once("error", listening.reject);
		server.listen(0, "127.0.0.1", listening.resolve);
		await listening.promise;
		const address = server.address();
		if (!address || typeof address === "string") {
			server.close();
			throw new Error("ghostty-web screenshot server did not expose a TCP port");
		}

		const candidates = [
			process.env.PI_ADVISOR_VISUAL_BROWSER,
			chromium.executablePath(),
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"/Applications/Chromium.app/Contents/MacOS/Chromium",
			"/usr/bin/google-chrome",
			"/usr/bin/google-chrome-stable",
			"/usr/bin/chromium",
			"/usr/bin/chromium-browser",
		].filter((candidate): candidate is string => Boolean(candidate));
		let executablePath: string | undefined;
		for (const candidate of candidates) {
			try {
				await access(candidate);
				executablePath = candidate;
				break;
			} catch {
				// Continue through Playwright and common system browser locations.
			}
		}
		if (!executablePath) {
			server.close();
			throw new Error(
				"Visual capture requires Chromium or Chrome. Run `npx playwright-core install chromium` or set PI_ADVISOR_VISUAL_BROWSER.",
			);
		}
		try {
			const browser = await chromium.launch({ executablePath, headless: true });
			return new GhosttyWebScreenshotRenderer(server, browser, `http://127.0.0.1:${address.port}`, {
				engine: "ghostty-web CanvasRenderer",
				ghosttyWeb: packageJson.version,
				browser: await browser.version(),
				deviceScaleFactor: DEVICE_SCALE_FACTOR,
				fontFamily: FONT_FAMILY,
				fontSize: FONT_SIZE,
			});
		} catch (error) {
			server.close();
			throw error;
		}
	}

	private constructor(server: Server, browser: Browser, origin: string, metadata: GhosttyWebRendererMetadata) {
		this.#server = server;
		this.#browser = browser;
		this.#origin = origin;
		this.metadata = metadata;
	}

	async screenshot(input: TerminalScreenshotInput): Promise<void> {
		if (
			input.crop &&
			(input.crop.startColumn < 0 ||
				input.crop.columns < 1 ||
				input.crop.startColumn + input.crop.columns > input.columns)
		) {
			throw new Error(
				`Invalid terminal crop [${input.crop.startColumn}, ${input.crop.startColumn + input.crop.columns}) for ${input.columns} columns`,
			);
		}
		const page = await this.#browser.newPage({
			viewport: {
				width: Math.max(1200, input.columns * 16),
				height: Math.max(800, input.rows * 28),
			},
			deviceScaleFactor: DEVICE_SCALE_FACTOR,
			colorScheme: "light",
		});
		try {
			await page.goto(this.#origin);
			await page.waitForFunction(
				() => typeof (window as unknown as { renderTerminal?: unknown }).renderTerminal === "function",
			);
			const lines = input.ansiText.replace(/\r/g, "").split("\n");
			if (lines.at(-1) === "") lines.pop();
			await page.evaluate(
				async (terminal) => {
					await (
						window as unknown as {
							renderTerminal(input: typeof terminal): Promise<void>;
						}
					).renderTerminal(terminal);
				},
				{
					ansiText: `\u001b[?25l\u001b[H\u001b[2J${lines.join("\r\n")}`,
					columns: input.columns,
					rows: input.rows,
					fontFamily: FONT_FAMILY,
					fontSize: FONT_SIZE,
				},
			);
			const canvas = page.locator("#terminal canvas");
			await canvas.waitFor({ state: "visible" });
			if (!input.crop) {
				await canvas.screenshot({ path: input.outputPath, animations: "disabled", caret: "hide" });
				return;
			}
			const box = await canvas.boundingBox();
			if (!box) throw new Error("ghostty-web renderer did not expose a canvas bounding box");
			const cellWidth = box.width / input.columns;
			await page.screenshot({
				path: input.outputPath,
				animations: "disabled",
				caret: "hide",
				clip: {
					x: box.x + input.crop.startColumn * cellWidth,
					y: box.y,
					width: input.crop.columns * cellWidth,
					height: box.height,
				},
			});
		} finally {
			await page.close();
		}
	}

	async close(): Promise<void> {
		await this.#browser.close();
		const closed = Promise.withResolvers<void>();
		this.#server.close((error) => {
			if (error) closed.reject(error);
			else closed.resolve();
		});
		await closed.promise;
	}
}
