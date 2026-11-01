import { strict as assert } from "node:assert";
import { defaultConfig } from "../config.ts";
import { stripControls } from "../format.ts";
import { renderFooterLine, renderLeadingSegments } from "../renderer.ts";
import { readSandboxStatus } from "../sandbox.ts";
import type { FooterConfig, FooterState } from "../types.ts";

function emptyState(): FooterState {
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
    model: { id: "test-model", provider: "test", displayName: "Test", thinking: "off" },
    context: { tokens: 0, window: 1000, percent: 0 },
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    speedEngine: null,
    version: 0,
  };
}

function leadingBadge(mutateConfig?: (config: FooterConfig) => void): string {
  const config = defaultConfig();
  mutateConfig?.(config);
  return stripControls(renderLeadingSegments(emptyState(), config));
}

const originalCapFile = process.env.NONO_CAP_FILE;

// Detection is driven purely by NONO_CAP_FILE, the manifest the outer sandbox exports.
delete process.env.NONO_CAP_FILE;
assert.equal(readSandboxStatus().active, false, "no cap file means unsandboxed");
assert.equal(leadingBadge(), "", "sandbox badge is hidden outside nono");

process.env.NONO_CAP_FILE = "/tmp/nono-cap.json";
assert.equal(readSandboxStatus().active, true, "cap file means sandboxed");
assert.equal(leadingBadge(), "sandbox", "plain mode renders the badge alone");

assert.equal(
  leadingBadge((config) => (config.icons = "nerd")),
  "󰒃 sandbox",
  "nerd mode prefixes the shield icon",
);

// The badge is pinned to the title, so it never leaks into the right-hand stats.
const status = stripControls(renderFooterLine(emptyState(), defaultConfig(), 120));
assert.equal(status.includes("sandbox"), false, "sandbox stays out of the status group");

// A whitespace-only value must not count as an active sandbox.
process.env.NONO_CAP_FILE = "   ";
assert.equal(readSandboxStatus().active, false, "blank cap file is ignored");

if (originalCapFile === undefined) delete process.env.NONO_CAP_FILE;
else process.env.NONO_CAP_FILE = originalCapFile;

console.log("✓ sandbox segment render checks passed");
