import { strict as assert } from "node:assert";
import { defaultConfig } from "../config.ts";
import { stripControls } from "../format.ts";
import { renderFooterLine } from "../renderer.ts";
import type { FooterConfig, FooterState } from "../types.ts";

function stateWithContext(context: Partial<FooterState["context"]>): FooterState {
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
    model: { id: "deepseek-v4.1-flash", provider: "magpie", displayName: "Deepseek-V4.1-Flash", thinking: "off" },
    context: { tokens: 46_800, window: 200_000, percent: 23.4, ...context },
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    speedEngine: null,
    version: 0,
  };
}

function contextLine(
  context: Partial<FooterState["context"]>,
  width: number,
  mutateConfig?: (config: FooterConfig) => void,
): string {
  const config = defaultConfig();
  config.adaptive = true;
  // Flat config: the segment list is the ordered set of enabled ids.
  config.segments = ["context"];
  mutateConfig?.(config);
  return stripControls(renderFooterLine(stateWithContext(context), config, width));
}

// Full width keeps percentage plus used/window.
assert.equal(contextLine({}, 120), "ctx 23% 47k/200k", "full width shows percent and used/window");

// Compact width now carries the window as well.
assert.equal(contextLine({}, 80), "ctx 23%/200k", "compact width appends the window");

// Minimal width stays terse so it still fits narrow terminals.
assert.equal(contextLine({}, 50), "ctx 23%", "minimal width shows only the percent");

// An unknown window must not render a bogus "/0".
assert.equal(contextLine({ window: 0 }, 80), "ctx 23%", "unknown window is omitted in compact");
assert.equal(contextLine({ window: 0 }, 120), "ctx 23% 47k/0", "full width keeps used/window shape");

// Percent-only data still renders.
assert.equal(
  contextLine({ tokens: null, percent: null }, 80),
  "ctx ?/200k",
  "unknown usage still shows the window",
);

// Adaptive off forces full width rendering at any terminal width.
assert.equal(
  contextLine({}, 50, (config) => (config.adaptive = false)),
  "ctx 23% 47k/200k",
  "adaptive off always uses full format",
);

console.log("✓ context segment render checks passed");
