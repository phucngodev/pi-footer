import { formatCost, formatPercent, formatTokens } from "./format.ts";
import { TokenSpeedEngine } from "./engine.ts";
import type {
  SegmentData,
  SegmentDefinition,
  SegmentRenderContext,
  SegmentRenderResult,
} from "./types.ts";

function displayForMode(data: SegmentData, widthMode: SegmentRenderContext["widthMode"]): string {
  if (widthMode === "minimal" && data.display?.minimal !== undefined) return data.display.minimal;
  if (widthMode === "compact" && data.display?.compact !== undefined) return data.display.compact;
  if (widthMode === "full" && data.display?.full !== undefined) return data.display.full;
  const secondary = data.secondary ? ` ${data.secondary}` : "";
  return `${data.primary}${secondary}`.trim();
}

function renderCollectedSegment(
  ctx: SegmentRenderContext,
  segment: SegmentDefinition,
  data: SegmentData,
): SegmentRenderResult {
  const icon = ctx.icons[segment.id];
  // The model segment can opt out of its icon prefix via display.showModelIcon.
  const showIcon = segment.id === "model" ? ctx.showModelIcon : true;
  const value = displayForMode(data, ctx.widthMode);
  const prefix = icon && showIcon ? `${icon} ` : "";
  return {
    id: segment.id,
    text: `${prefix}${value}`.trim(),
  };
}

function gitBranchLabel(ctx: SegmentRenderContext): string {
  const git = ctx.state.git;
  if (git.branch) {
    if (ctx.config.gitShaMode === "always" && git.sha) return `${git.branch} ${git.sha}`;
    return git.branch;
  }
  if (git.detached && git.sha && ctx.config.gitShaMode !== "off") return git.sha;
  return "HEAD";
}

function gitStatusMark(ctx: SegmentRenderContext): string {
  const status = ctx.state.git.status;
  if (status === "conflict") return ctx.config.icons === "nerd" ? "⚠" : "!";
  if (status === "dirty") return ctx.config.icons === "nerd" ? "●" : "*";
  return "";
}

function gitDetailParts(ctx: SegmentRenderContext): string[] {
  const git = ctx.state.git;
  const parts: string[] = [];
  const status = gitStatusMark(ctx);
  if (status && (ctx.config.gitShowDirty || git.status === "conflict")) parts.push(status);
  if (ctx.config.gitShowAheadBehind) {
    if (git.ahead > 0) parts.push(`↑${git.ahead}`);
    if (git.behind > 0) parts.push(`↓${git.behind}`);
  }
  return parts;
}

const SEGMENTS: SegmentDefinition[] = [
  {
    id: "git",
    label: "Git",
    collect(ctx) {
      const git = ctx.state.git;
      if (!git.repo) return undefined;
      const branch = gitBranchLabel(ctx);
      const parts = gitDetailParts(ctx);
      const secondary = parts.join(" ") || undefined;
      const minimalStatus =
        git.status === "conflict" || ctx.config.gitShowDirty ? gitStatusMark(ctx) : "";
      return {
        primary: branch,
        secondary,
        display: {
          full: [branch, secondary].filter(Boolean).join(" "),
          compact: [branch, secondary].filter(Boolean).join(" "),
          minimal: [branch, minimalStatus].filter(Boolean).join(" "),
        },
      };
    },
  },
  {
    id: "model",
    label: "Model",
    collect(ctx) {
      let model = ctx.state.model.displayName || ctx.state.model.id || "no-model";
      if (ctx.showProvider && ctx.state.model.provider && ctx.widthMode === "full") {
        model = `${ctx.state.model.provider}/${model}`;
      }
      const thinking =
        ctx.config.showThinkingLevel &&
        ctx.state.model.thinking &&
        ctx.state.model.thinking !== "off"
          ? ctx.state.model.thinking
          : "";
      return {
        primary: model,
        secondary: thinking || undefined,
        display: {
          full: thinking ? `${model} ${thinking}` : model,
          compact: thinking ? `${model} ${thinking}` : model,
          minimal: model,
        },
      };
    },
  },
  {
    id: "context",
    label: "Context",
    collect(ctx) {
      const pct = formatPercent(ctx.state.context.percent);
      const tokens = formatTokens(ctx.state.context.tokens);
      const window = formatTokens(ctx.state.context.window);
      // Unknown windows (0) are omitted so the label never shows "/0".
      const windowLabel = ctx.state.context.window > 0 ? `/${window}` : "";
      return {
        primary: pct,
        secondary: `${tokens}/${window}`,
        display: {
          full: `${pct} ${tokens}/${window}`,
          compact: `${pct}${windowLabel}`,
          minimal: pct,
        },
      };
    },
  },
  {
    id: "tokens",
    label: "Tokens",
    collect(ctx) {
      const usage = ctx.state.usage;
      const primary = `↑${formatTokens(usage.input)} ↓${formatTokens(usage.output)}`;
      const cacheParts = [];
      if (usage.cacheRead) cacheParts.push(`R${formatTokens(usage.cacheRead)}`);
      if (usage.cacheWrite) cacheParts.push(`W${formatTokens(usage.cacheWrite)}`);
      return {
        primary,
        secondary: cacheParts.join(" ") || undefined,
        display: {
          full: [primary, ...cacheParts].join(" "),
          compact: primary,
          minimal: primary,
        },
      };
    },
  },
  {
    id: "cost",
    label: "Cost",
    collect(ctx) {
      return {
        primary: formatCost(ctx.state.usage.cost),
      };
    },
  },
  {
    id: "speed",
    label: "Speed",
    collect(ctx) {
      const engine = ctx.state.speedEngine;
      if (!engine) return undefined;
      // The engine freezes its rate on stop(), so this stays put between turns
      // instead of decaying with the wall clock.
      return {
        primary: `${engine.tps.toFixed(1)} tok/s`,
      };
    },
  },
];

export function renderSegment(
  ctx: SegmentRenderContext,
  segment: SegmentDefinition,
): SegmentRenderResult | undefined {
  const data = segment.collect(ctx);
  return data ? renderCollectedSegment(ctx, segment, data) : undefined;
}

export const SEGMENT_BY_ID = new Map(SEGMENTS.map((segment) => [segment.id, segment]));
