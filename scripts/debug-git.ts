import { collectGitSnapshot } from "../git.ts";
import type { GitTiming } from "../types.ts";

// Only the timing fields matter for collection.
const config: GitTiming = {
  gitTimeoutMs: 1000,
  gitRefreshDebounceMs: 0,
  gitPollIntervalMs: 5000,
};

const cwd = process.argv[2] || process.cwd();
const snapshot = await collectGitSnapshot(cwd, config);
console.log(JSON.stringify({ cwd, ...snapshot }, null, 2));
