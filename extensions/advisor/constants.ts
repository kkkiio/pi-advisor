/** Runtime constants independent of Advisor prompt and tool definitions. */
export const PULL_TIMEOUT_MAX_MS = 20_000;
export const PULL_ELAPSED_VISIBLE_MS = 3_000;
export const ADVISOR_DISABLED_PRIMARY_TOOL_NAMES: ReadonlySet<string> = new Set(["edit", "write"]);
