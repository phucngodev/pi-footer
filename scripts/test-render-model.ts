import { strict as assert } from "node:assert";
import { defaultConfig } from "../config.ts";
import { stripControls } from "../format.ts";
import { renderFooterLine } from "../renderer.ts";
import type { FooterConfig, FooterState } from "../types.ts";

function stateWithModel(model: Partial<FooterState["model"]>): FooterState {
  return {
    workspace: { name: "repo", path: "/repo" },
    git: {
      repo: false,
      branch: null,
      detached: false,
      sha: null,
      upstream: null,
      ahead: 0,
      behind: 0,
      staged: 0,
      unstaged: 0,
      untracked: 0,
      conflicts: 0,
      dirty: false,
      status: "unknown",
      updatedAt: 0,
    },
    providers: { availableCount: 1 },
    model: {
      id: "workbuddy-ai/deepseek-v4.1-flash",
      provider: "magpie",
      displayName: "Deepseek-V4.1-Flash",
      thinking: "low",
      ...model,
    },
    context: { tokens: 1000, window: 100_000, percent: 1 },
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    speedEngine: null,
    version: 0,
  };
}

function modelLine(
  model: Partial<FooterState["model"]>,
  mutateConfig?: (config: FooterConfig) => void,
): string {
  const config = defaultConfig();
  // Flat config: the segment list is the ordered set of enabled ids.
  config.segments = ["model"];
  mutateConfig?.(config);
  return stripControls(renderFooterLine(stateWithModel(model), config, 120));
}

// Defaults render the catalog name alone: no icon prefix and no thinking suffix.
assert.equal(modelLine({}), "Deepseek-V4.1-Flash", "model name renders without icon or thinking");

assert.equal(
  modelLine({}, (config) => (config.showThinkingLevel = true)),
  "Deepseek-V4.1-Flash low",
  "thinking level can be appended",
);

assert.equal(
  modelLine({ thinking: "off" }, (config) => (config.showThinkingLevel = true)),
  "Deepseek-V4.1-Flash",
  "off thinking level stays hidden",
);

assert.equal(
  modelLine({}, (config) => (config.showModelIcon = true)),
  "ai Deepseek-V4.1-Flash",
  "model icon can be restored",
);

// Provider prefixing still works independently of the new toggles.
assert.equal(
  modelLine({}, (config) => (config.showProvider = "always")),
  "magpie/Deepseek-V4.1-Flash",
  "provider label still available",
);

console.log("✓ model segment render checks passed");
