import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect } from "vitest";
import { repoRoot } from "./rpc-pi";

const snapshotDir = join(repoRoot, "e2e", "snapshots");

export async function expectPlainTextSnapshot(name: string, text: string): Promise<void> {
	const snapshotPath = join(snapshotDir, `${name}.txt`);
	if (process.env.PI_ADVISOR_UPDATE_TUI_SNAPSHOTS === "1") {
		await mkdir(dirname(snapshotPath), { recursive: true });
		await writeFile(snapshotPath, text, "utf8");
		return;
	}
	let expected: string;
	try {
		expected = await readFile(snapshotPath, "utf8");
	} catch (error) {
		throw new Error(
			`Missing TUI snapshot ${snapshotPath}. Run PI_ADVISOR_UPDATE_TUI_SNAPSHOTS=1 npm run test:e2e to create it.`,
			{ cause: error },
		);
	}
	expect(text).toBe(expected);
}
