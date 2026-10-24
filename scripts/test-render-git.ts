import { strict as assert } from "node:assert";
import { defaultConfig } from "../config.ts";
import { stripControls } from "../format.ts";
import { renderFooterLine } from "../renderer.ts";
import type { GitSnapshot, FooterState } from "../types.ts";

function stateWithGit(git: Partial<GitSnapshot>): FooterState {
  return {
    workspace: { name: "repo", path: "/repo" },
    git: {
      repo: true,
      branch: "main",
      detached: false,
      sha: "a1b2c3d",
      upstream: "origin/main",
      ahead: 0,
      behind: 0,
      staged: 0,
      unstaged: 0,
      untracked: 0,
      conflicts: 0,
      dirty: false,
      status: "clean",
      updatedAt: 0,
      ...git,
    },
    providers: { availableCount: 1 },
    model: { id: "gpt-5.5", provider: "openai", displayName: "GPT 5.5", thinking: "off" },
    context: { tokens: 10_000, window: 100_000, percent: 10 },
    usage: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, cost: 0.01 },
    speedEngine: {
      isStreaming: false,
      tokenCount: 1234,
      elapsedMs: 10000,
      elapsedSeconds: 10,
      tps: 45.2,
      tps_avg: 45.2,
    } as any,
    version: 0,
  };
}

function gitLine(
  git: Partial<GitSnapshot>,
  mutateConfig?: (config: ReturnType<typeof defaultConfig>) => void,
): string {
  const config = defaultConfig();
  // Flat config: the segment list is the ordered set of enabled ids.
  config.segments = ["git"];
  mutateConfig?.(config);
  return stripControls(renderFooterLine(stateWithGit(git), config, 120));
}

assert.equal(gitLine({ status: "clean" }), "git main", "clean branch stays quiet");
assert.equal(
  gitLine({ status: "dirty", dirty: true, unstaged: 1 }),
  "git main *",
  "dirty marker defaults on",
);
assert.equal(
  gitLine({ status: "dirty", dirty: true, unstaged: 1 }, (config) => {
    config.gitShowDirty = false;
  }),
  "git main",
  "dirty marker can be hidden",
);
assert.equal(
  gitLine({ status: "conflict", dirty: true, conflicts: 1 }, (config) => {
    config.gitShowDirty = false;
  }),
  "git main !",
  "conflict marker remains visible when dirty marker is disabled",
);
assert.equal(gitLine({ ahead: 2, behind: 1 }), "git main ↑2 ↓1", "ahead/behind defaults on");
assert.equal(
  gitLine({ ahead: 2, behind: 1 }, (config) => {
    config.gitShowAheadBehind = false;
  }),
  "git main",
  "ahead/behind can be hidden",
);
assert.equal(
  gitLine({}, (config) => (config.gitShaMode = "always")),
  "git main a1b2c3d",
  "sha always shows branch sha",
);
assert.equal(
  gitLine({ branch: null, detached: true }, (config) => (config.gitShaMode = "off")),
  "git HEAD",
  "sha off keeps detached head quiet",
);
assert.equal(
  gitLine({ branch: null, detached: true }, (config) => (config.gitShaMode = "detached")),
  "git a1b2c3d",
  "sha detached shows sha on detached head",
);

console.log("✓ git render settings checks passed");
