import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import type {
  GitShaMode,
  FooterConfig,
  FooterThemeName,
  IconMode,
  ProviderMode,
  SegmentId,
} from "./types.js";

const CONFIG_PATH = join(getAgentDir(), "pi-footer", "config.json");
const CONFIG_VERSION = 3 as const;

/**
 * Segments enabled on a fresh install, in render order.
 * Users can reorder or hide them from the settings pane.
 */
const DEFAULT_SEGMENTS: SegmentId[] = ["context", "speed"];

/** Every segment id in canonical render order. */
export const SEGMENT_ORDER: SegmentId[] = ["git", "model", "cost", "context", "tokens", "speed"];

const SEGMENT_IDS = new Set<SegmentId>(SEGMENT_ORDER);
const THEMES = new Set<FooterThemeName>(["light", "dark"]);
const ICON_MODES = new Set<IconMode>(["nerd", "plain"]);
const PROVIDER_MODES = new Set<ProviderMode>(["auto", "always", "never"]);
const GIT_SHA_MODES = new Set<GitShaMode>(["off", "detached", "always"]);

export function defaultConfig(): FooterConfig {
  return {
    version: CONFIG_VERSION,
    enabled: true,
    theme: "light",
    icons: "plain",
    minContentRows: 2,
    adaptive: true,
    showProvider: "auto",
    showModelIcon: false,
    showThinkingLevel: false,
    segments: [...DEFAULT_SEGMENTS],
    customNames: {},
    toggleAllEnabled: true,
    gitShowDirty: true,
    gitShowAheadBehind: true,
    gitShaMode: "off",
    gitTimeoutMs: 1000,
    gitRefreshDebounceMs: 1500,
    gitPollIntervalMs: 5000,
  };
}

export function cloneConfig(config: FooterConfig): FooterConfig {
  return {
    ...config,
    segments: [...config.segments],
    customNames: { ...config.customNames },
  };
}

function parseBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function parseStringEnum<T extends string>(value: unknown, allowed: Set<T>, fallback: T): T {
  return typeof value === "string" && allowed.has(value as T) ? (value as T) : fallback;
}

function parseIntInRange(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function parseIntAtLeast(value: unknown, fallback: number, min: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.floor(value));
}

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/**
 * Normalize the segment list to enabled ids in render order.
 * Accepts the flat v3 form (`["git", "model"]`) and the legacy v2 form
 * (`[{ id, enabled }]`). A missing list falls back to the defaults; an empty
 * list stays empty so "no segments" survives a round trip.
 */
function parseSegmentIds(value: unknown, fallback: SegmentId[]): SegmentId[] {
  if (!Array.isArray(value)) return [...fallback];
  const ids: SegmentId[] = [];
  for (const raw of value) {
    // Legacy entries are objects with an explicit enabled flag.
    const id = typeof raw === "string" ? raw : recordOf(raw).id;
    const enabled = typeof raw === "string" ? true : recordOf(raw).enabled !== false;
    if (!enabled || typeof id !== "string" || !SEGMENT_IDS.has(id as SegmentId)) continue;
    if (!ids.includes(id as SegmentId)) ids.push(id as SegmentId);
  }
  return ids;
}

function parseCustomNames(value: unknown): Record<string, string> {
  const record = recordOf(value);
  return Object.fromEntries(
    Object.entries(record).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

/**
 * Accept both the flat v3 schema and the nested v2 schema.
 * Nested groups (editor/display/git/model) are flattened so upgrades keep user settings.
 */
function normalizeConfig(raw: unknown): FooterConfig {
  const defaults = defaultConfig();
  if (!raw || typeof raw !== "object") return defaults;
  const record = raw as Record<string, unknown>;

  const editor = recordOf(record.editor);
  const display = recordOf(record.display);
  const model = recordOf(record.model);
  const git = recordOf(record.git);

  const pick = <T>(flat: unknown, nested: Record<string, unknown>, key: string, fallback: T): T =>
    (flat ?? nested[key] ?? fallback) as T;

  const segments = parseSegmentIds(record.segments, defaults.segments);

  return {
    version: CONFIG_VERSION,
    enabled: parseBool(record.enabled, defaults.enabled),
    theme: parseStringEnum(record.theme, THEMES, defaults.theme),
    icons: parseStringEnum(record.icons, ICON_MODES, defaults.icons),
    minContentRows: parseIntInRange(
      pick(record.minContentRows, editor, "minContentRows", defaults.minContentRows),
      defaults.minContentRows,
      2,
      4,
    ),
    adaptive: parseBool(pick(record.adaptive, display, "adaptive", defaults.adaptive), defaults.adaptive),
    showProvider: parseStringEnum(
      pick(record.showProvider, display, "showProvider", defaults.showProvider),
      PROVIDER_MODES,
      defaults.showProvider,
    ),
    showModelIcon: parseBool(
      pick(record.showModelIcon, display, "showModelIcon", defaults.showModelIcon),
      defaults.showModelIcon,
    ),
    showThinkingLevel: parseBool(
      pick(record.showThinkingLevel, display, "showThinkingLevel", defaults.showThinkingLevel),
      defaults.showThinkingLevel,
    ),
    segments,
    customNames: parseCustomNames(record.customNames ?? model.customNames),
    toggleAllEnabled: parseBool(
      pick(record.toggleAllEnabled, record, "toggleAll", defaults.toggleAllEnabled),
      defaults.toggleAllEnabled,
    ),
    gitShowDirty: parseBool(
      pick(record.gitShowDirty, git, "showDirty", defaults.gitShowDirty),
      defaults.gitShowDirty,
    ),
    gitShowAheadBehind: parseBool(
      pick(record.gitShowAheadBehind, git, "showAheadBehind", defaults.gitShowAheadBehind),
      defaults.gitShowAheadBehind,
    ),
    gitShaMode: parseStringEnum(
      pick(record.gitShaMode, git, "shaMode", defaults.gitShaMode),
      GIT_SHA_MODES,
      defaults.gitShaMode,
    ),
    gitTimeoutMs: parseIntAtLeast(
      pick(record.gitTimeoutMs, git, "timeoutMs", defaults.gitTimeoutMs),
      defaults.gitTimeoutMs,
      100,
    ),
    gitRefreshDebounceMs: parseIntAtLeast(
      pick(record.gitRefreshDebounceMs, git, "refreshDebounceMs", defaults.gitRefreshDebounceMs),
      defaults.gitRefreshDebounceMs,
      0,
    ),
    gitPollIntervalMs: parseIntAtLeast(
      pick(record.gitPollIntervalMs, git, "pollIntervalMs", defaults.gitPollIntervalMs),
      defaults.gitPollIntervalMs,
      1000,
    ),
  };
}

// Reads the footer config
export async function loadConfig(): Promise<FooterConfig> {
  const current = await readConfigFile(CONFIG_PATH);
  return current ?? defaultConfig();
}

async function readConfigFile(path: string): Promise<FooterConfig | undefined> {
  try {
    const text = await readFile(path, "utf8");
    return normalizeConfig(JSON.parse(text));
  } catch {
    return undefined;
  }
}

export async function saveConfig(config: FooterConfig): Promise<void> {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, `${JSON.stringify(normalizeConfig(config), null, "\t")}\n`, "utf8");
}

/** Hide or show a segment while keeping the render order of the rest intact. */
export function toggleSegment(config: FooterConfig, id: SegmentId): FooterConfig {
  const next = cloneConfig(config);
  next.segments = next.segments.includes(id)
    ? next.segments.filter((segmentId) => segmentId !== id)
    : [...next.segments, id];
  next.toggleAllEnabled = false;
  return next;
}

/** Move a segment one slot earlier or later in the render order. */
export function moveSegment(config: FooterConfig, id: SegmentId, direction: -1 | 1): FooterConfig {
  const next = cloneConfig(config);
  const index = next.segments.indexOf(id);
  if (index < 0) return next;
  const target = index + direction;
  if (target < 0 || target >= next.segments.length) return next;
  [next.segments[index], next.segments[target]] = [next.segments[target]!, next.segments[index]!];
  return next;
}

/** Enable every default segment (used by the \"all segments\" toggle). */
export function applyToggleAll(config: FooterConfig, enabled: boolean): FooterConfig {
  const next = cloneConfig(config);
  next.toggleAllEnabled = enabled;
  next.segments = enabled ? [...DEFAULT_SEGMENTS] : [];
  return next;
}
