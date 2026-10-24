import { strict as assert } from "node:assert";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyToggleAll, defaultConfig, moveSegment, toggleSegment } from "../config.ts";
import type { FooterConfig } from "../types.ts";

// Each query string produces a fresh module instance so the config path
// captured at import time is recomputed against the current agent dir.
async function loadConfigModule(tag: string): Promise<{
  loadConfig(): Promise<FooterConfig>;
}> {
  return import(`../config.js?${tag}`);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(value), "utf8");
}

const agentDir = await mkdtemp(join(tmpdir(), "pi-footer-config-"));
process.env.PI_CODING_AGENT_DIR = agentDir;

const currentPath = join(agentDir, "pi-footer", "config.json");

// Defaults are flat: no nested editor/display/git/model groups.
const defaults = defaultConfig();
for (const legacyKey of ["editor", "display", "git", "model"]) {
  assert.equal(
    Object.hasOwn(defaults, legacyKey),
    false,
    `defaults have no nested "${legacyKey}" group`,
  );
}
assert.equal(defaults.minContentRows, 2, "default min content rows");
assert.equal(defaults.gitPollIntervalMs, 5000, "default git poll interval");
assert.deepEqual(defaults.segments, ["context", "speed"], "default segments");

// Nested v2 config is migrated into flat keys.
await writeJson(currentPath, {
  version: 2,
  enabled: false,
  theme: "dark",
  icons: "nerd",
  editor: { minContentRows: 3 },
  display: {
    adaptive: false,
    showProvider: "always",
    showModelIcon: true,
    showThinkingLevel: true,
  },
  segments: [
    { id: "git", enabled: true },
    { id: "model", enabled: false },
    { id: "tokens", enabled: true },
  ],
  model: { customNames: { sonnet: "Fast Sonnet" } },
  git: {
    showDirty: false,
    showAheadBehind: false,
    shaMode: "always",
    timeoutMs: 2500,
    refreshDebounceMs: 500,
    pollIntervalMs: 10_000,
  },
  toggleAllEnabled: false,
});

const migrated = await (await loadConfigModule("migrate-v2")).loadConfig();
assert.equal(migrated.version, 3, "migration bumps version");
assert.equal(migrated.enabled, false, "migrated enabled");
assert.equal(migrated.theme, "dark", "migrated theme");
assert.equal(migrated.icons, "nerd", "migrated icons");
assert.equal(migrated.minContentRows, 3, "migrated editor rows");
assert.equal(migrated.adaptive, false, "migrated adaptive");
assert.equal(migrated.showProvider, "always", "migrated provider mode");
assert.equal(migrated.showModelIcon, true, "migrated model icon");
assert.equal(migrated.showThinkingLevel, true, "migrated thinking level");
assert.deepEqual(migrated.segments, ["git", "tokens"], "migrated segments drop disabled ids");
assert.deepEqual(migrated.customNames, { sonnet: "Fast Sonnet" }, "migrated custom names");
assert.equal(migrated.gitShowDirty, false, "migrated git dirty marker");
assert.equal(migrated.gitShowAheadBehind, false, "migrated git ahead/behind");
assert.equal(migrated.gitShaMode, "always", "migrated git sha mode");
assert.equal(migrated.gitTimeoutMs, 2500, "migrated git timeout");
assert.equal(migrated.gitRefreshDebounceMs, 500, "migrated git debounce");
assert.equal(migrated.gitPollIntervalMs, 10_000, "migrated git poll interval");
assert.equal(migrated.toggleAllEnabled, false, "migrated toggle all");

// Flat config wins over a leftover nested group.
await writeJson(currentPath, {
  theme: "light",
  minContentRows: 4,
  gitPollIntervalMs: 2000,
  editor: { minContentRows: 2 },
  git: { pollIntervalMs: 30_000 },
});
const flat = await (await loadConfigModule("flat-wins")).loadConfig();
assert.equal(flat.minContentRows, 4, "flat rows win over nested");
assert.equal(flat.gitPollIntervalMs, 2000, "flat poll interval wins over nested");

// Unknown segment ids and duplicates are dropped.
await writeJson(currentPath, { segments: ["model", "model", "bogus", "git"] });
const cleaned = await (await loadConfigModule("segment-cleanup")).loadConfig();
assert.deepEqual(cleaned.segments, ["model", "git"], "unknown and duplicate ids removed");

// Empty agent dir: fall back to defaults instead of throwing.
await rm(currentPath);
const fallback = await (await loadConfigModule("defaults")).loadConfig();
assert.equal(fallback.theme, "light", "default theme when no config exists");
assert.equal(fallback.icons, "plain", "default icons when no config exists");
assert.deepEqual(fallback.segments, ["context", "speed"], "default segments when none exist");

// Mutation helpers keep the flat list consistent.
const toggled = toggleSegment(defaults, "git");
assert.deepEqual(toggled.segments, ["context", "speed", "git"], "toggle appends a hidden segment");
assert.equal(toggled.toggleAllEnabled, false, "manual toggle clears the all-segments flag");
assert.deepEqual(toggleSegment(toggled, "git").segments, ["context", "speed"], "toggle removes it again");

const reordered = moveSegment(toggled, "git", -1);
assert.deepEqual(reordered.segments, ["context", "git", "speed"], "move swaps neighbours");
assert.deepEqual(moveSegment(toggled, "git", 1).segments, toggled.segments, "move past the end is a no-op");

const allOff = applyToggleAll(defaults, false);
assert.deepEqual(allOff.segments, [], "all-off hides every segment");
assert.deepEqual(applyToggleAll(allOff, true).segments, ["context", "speed"], "all-on restores defaults");

// Cloning must not alias the segment array or custom names.
const original = defaultConfig();
const copy = toggleSegment(original, "git");
assert.deepEqual(original.segments, ["context", "speed"], "source config is untouched");

await rm(agentDir, { recursive: true, force: true });
console.log("✓ flat config, v2 migration and mutation checks passed");
