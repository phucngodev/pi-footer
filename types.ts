export type SegmentId = "git" | "model" | "context" | "tokens" | "cost" | "speed";
export type FooterThemeName = "light" | "dark";
export type IconMode = "nerd" | "plain";
export type WidthMode = "full" | "compact" | "minimal";
export type GitStatus = "clean" | "dirty" | "conflict" | "unknown";
export type GitShaMode = "off" | "detached" | "always";
export type ProviderMode = "auto" | "always" | "never";

/**
 * Git timing settings, kept flat so the whole config can be edited one level deep.
 */
export interface GitTiming {
  gitTimeoutMs: number;
  gitRefreshDebounceMs: number;
  gitPollIntervalMs: number;
}

/**
 * Flat config: every setting is a top-level key so the settings pane needs no
 * nested navigation and the JSON file stays readable and hand-editable.
 */
export interface FooterConfig extends GitTiming {
  version: 3;
  enabled: boolean;
  theme: FooterThemeName;
  icons: IconMode;
  // Minimum number of content rows rendered inside the input box.
  minContentRows: number;
  // When true, segment density adapts to the available footer width.
  adaptive: boolean;
  // Controls when the provider name is shown on the model segment.
  showProvider: ProviderMode;
  // Controls the icon prefix on the model segment only; other segments keep their icons.
  showModelIcon: boolean;
  // Controls whether the active thinking level is appended to the model name.
  showThinkingLevel: boolean;
  // Enabled segments in render order; ids missing from this list are hidden.
  segments: SegmentId[];
  // Overrides model display names by id substring.
  customNames: Record<string, string>;
  // Mirrors the last "all segments" choice so the pane can restore defaults.
  toggleAllEnabled: boolean;
  gitShowDirty: boolean;
  gitShowAheadBehind: boolean;
  gitShaMode: GitShaMode;
}

export interface UsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

export interface GitSnapshot {
  repo: boolean;
  branch: string | null;
  detached: boolean;
  sha: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  staged: number;
  unstaged: number;
  untracked: number;
  conflicts: number;
  dirty: boolean;
  status: GitStatus;
  updatedAt: number;
}

import type { TokenSpeedEngine } from "./engine.ts";

export interface FooterState {
  workspace: {
    name: string;
    path: string;
  };
  git: GitSnapshot;
  providers: {
    availableCount: number;
  };
  model: {
    id?: string;
    provider?: string;
    displayName?: string;
    thinking: string;
  };
  context: {
    tokens: number | null;
    window: number;
    percent: number | null;
  };
  usage: UsageTotals;
  //
  // The engine owns the live and final tokens-per-second value; the speed
  // segment reads it directly so there is no second, drifting copy.
  speedEngine: TokenSpeedEngine | null;
  version: number;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface SegmentPalette {
  fg: Rgb;
}

export interface FooterPalette {
  name: FooterThemeName;
  text: Rgb;
  dim: Rgb;
  warn: Rgb;
  error: Rgb;
  separator: Rgb;
  border: Rgb;
  title: Rgb;
  segments: Record<SegmentId, SegmentPalette>;
}

export interface IconSet extends Record<SegmentId, string> {}

interface SegmentDisplay {
  full?: string;
  compact?: string;
  minimal?: string;
}

export interface SegmentData {
  primary: string;
  secondary?: string;
  display?: SegmentDisplay;
}

export interface SegmentRenderContext {
  state: FooterState;
  config: FooterConfig;
  widthMode: WidthMode;
  icons: IconSet;
  showProvider: boolean;
  // Set when the model segment should render its icon prefix.
  showModelIcon: boolean;
}

export interface SegmentRenderResult {
  id: SegmentId;
  text: string;
}

export interface SegmentDefinition {
  id: SegmentId;
  label: string;
  collect(ctx: SegmentRenderContext): SegmentData | undefined;
}
