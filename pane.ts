import {
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  type Component,
  type TUI,
} from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import {
  SEGMENT_ORDER,
  applyToggleAll,
  cloneConfig,
  defaultConfig,
  moveSegment,
  toggleSegment,
} from "./config.ts";
import { renderInputSurface, renderInputSurfacePreview } from "./renderer.ts";
import { SEGMENT_BY_ID } from "./segments.ts";
import type {
  FooterConfig,
  FooterState,
  FooterThemeName,
  IconMode,
  ProviderMode,
  SegmentId,
} from "./types.ts";

type PaneResult = { action: "save"; config: FooterConfig } | { action: "cancel" };
type Done = (result: PaneResult) => void;
type Tone = (text: string) => string;

/**
 * One line of the flat settings list. Section rows are non-selectable headings;
 * every setting row is reachable with ↑↓ and changes immediately on Enter.
 */
type Row =
  | { kind: "section"; label: string }
  | {
      kind: "setting";
      label: string;
      value: string;
      hint?: string;
      // Absent on informational rows, which cannot be changed.
      mutate?: () => void;
    };

type SettingRow = Extract<Row, { kind: "setting" }>;

interface PaneColors {
  accent: Tone;
  muted: Tone;
  dim: Tone;
  warn: Tone;
  success: Tone;
}

const ROW_VALUES = [2, 3, 4] as const;
const POLL_INTERVALS = [2000, 5000, 10000, 30000] as const;

function nextIn<T extends string>(current: T, values: readonly T[]): T {
  const index = values.indexOf(current);
  return values[(index + 1) % values.length] ?? values[0]!;
}

function nextNumber(current: number, values: readonly number[]): number {
  const index = values.indexOf(current);
  return values[(index + 1) % values.length] ?? values[0]!;
}

function plainLine(parts: string[], width: number): string {
  return truncateToWidth(parts.join(""), width, "…");
}

function padRightAnsi(text: string, width: number): string {
  const extra = Math.max(0, width - visibleWidth(text));
  return `${text}${" ".repeat(extra)}`;
}

function spreadAnsi(left: string, right: string, width: number): string {
  const leftWidth = visibleWidth(left);
  const rightWidth = visibleWidth(right);
  if (leftWidth + rightWidth + 1 > width) {
    const leftBudget = Math.max(0, width - rightWidth - 1);
    if (leftBudget <= 0) return truncateToWidth(right, width, "…");
    return `${truncateToWidth(left, leftBudget, "…")} ${right}`;
  }
  return `${left}${" ".repeat(Math.max(0, width - leftWidth - rightWidth))}${right}`;
}

function sameConfig(a: FooterConfig, b: FooterConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function shortcut(colors: PaneColors, key: string, label: string): string {
  return `${colors.accent(`[${key}]`)} ${colors.dim(label)}`;
}

function onOff(value: boolean): string {
  return value ? "on" : "off";
}

function segmentLabel(id: SegmentId): string {
  return SEGMENT_BY_ID.get(id)?.label ?? id;
}

function formatPolling(ms: number): string {
  return ms % 1000 === 0 ? `${ms / 1000}s` : `${ms}ms`;
}

class FooterConfigPane implements Component {
  private readonly initial: FooterConfig;
  private draft: FooterConfig;
  // Index into the selectable settings rows, not into the rendered line list.
  private cursor = 0;
  private status = "";

  constructor(
    initial: FooterConfig,
    private readonly theme: Theme,
    private readonly done: Done,
    private readonly requestRender: () => void,
    private readonly previewState?: FooterState,
  ) {
    this.initial = cloneConfig(initial);
    this.draft = cloneConfig(initial);
  }

  invalidate(): void {}

  private isDirty(): boolean {
    return !sameConfig(this.draft, this.initial);
  }

  /**
   * Build the flat list: every setting lives one Enter away, grouped only by
   * dim section headings. Segment rows follow the canonical segment order.
   */
  private rows(): Row[] {
    const rows: Row[] = [
      { kind: "section", label: "EDITOR" },
      {
        kind: "setting",
        label: "Min input rows",
        value: `${this.draft.minContentRows}`,
        hint: "Height of the rounded input box before it grows with content.",
        mutate: () => {
          this.draft.minContentRows = nextNumber(this.draft.minContentRows, ROW_VALUES);
        },
      },
      { kind: "section", label: "DISPLAY" },
      {
        kind: "setting",
        label: "Footer",
        value: onOff(this.draft.enabled),
        hint: "Turns the whole decorated input surface on or off.",
        mutate: () => {
          this.draft.enabled = !this.draft.enabled;
        },
      },
      {
        kind: "setting",
        label: "Theme",
        value: this.draft.theme,
        hint: "Palette used by the borders, title and segments.",
        mutate: () => {
          this.draft.theme = nextIn(this.draft.theme, ["light", "dark"] as FooterThemeName[]);
        },
      },
      {
        kind: "setting",
        label: "Icons",
        value: this.draft.icons,
        hint: "Plain text icons or Nerd Font glyphs.",
        mutate: () => {
          this.draft.icons = nextIn(this.draft.icons, ["plain", "nerd"] as IconMode[]);
        },
      },
      {
        kind: "setting",
        label: "Adaptive width",
        value: onOff(this.draft.adaptive),
        hint: "Drops segment detail as the terminal gets narrower.",
        mutate: () => {
          this.draft.adaptive = !this.draft.adaptive;
        },
      },
      {
        kind: "setting",
        label: "Provider label",
        value: this.draft.showProvider,
        hint: "Auto shows the provider only when several are available.",
        mutate: () => {
          this.draft.showProvider = nextIn(this.draft.showProvider, [
            "auto",
            "always",
            "never",
          ] as ProviderMode[]);
        },
      },
      {
        kind: "setting",
        label: "Model icon",
        value: onOff(this.draft.showModelIcon),
        hint: "Prefix the model name with the segment icon.",
        mutate: () => {
          this.draft.showModelIcon = !this.draft.showModelIcon;
        },
      },
      {
        kind: "setting",
        label: "Thinking level",
        value: onOff(this.draft.showThinkingLevel),
        hint: "Append the active thinking level to the model name.",
        mutate: () => {
          this.draft.showThinkingLevel = !this.draft.showThinkingLevel;
        },
      },
      { kind: "section", label: "SEGMENTS" },
      {
        kind: "setting",
        label: "All segments",
        value: onOff(this.draft.toggleAllEnabled),
        hint: "On resets to the default segment set; off hides every segment.",
        mutate: () => {
          this.draft = applyToggleAll(this.draft, !this.draft.toggleAllEnabled);
        },
      },
    ];

    for (const id of SEGMENT_ORDER) {
      const enabled = this.draft.segments.includes(id);
      rows.push({
        kind: "setting",
        label: segmentLabel(id),
        value: onOff(enabled),
        hint: "Enter toggles it. J / K reorders enabled segments.",
        mutate: () => {
          this.draft = toggleSegment(this.draft, id);
        },
      });
    }

    rows.push(
      { kind: "section", label: "GIT" },
      {
        kind: "setting",
        label: "Dirty marker",
        value: onOff(this.draft.gitShowDirty),
        hint: "Conflict markers are always shown.",
        mutate: () => {
          this.draft.gitShowDirty = !this.draft.gitShowDirty;
        },
      },
      {
        kind: "setting",
        label: "Ahead / behind",
        value: onOff(this.draft.gitShowAheadBehind),
        hint: "Show upstream ahead / behind counts when Git provides them.",
        mutate: () => {
          this.draft.gitShowAheadBehind = !this.draft.gitShowAheadBehind;
        },
      },
      {
        kind: "setting",
        label: "SHA",
        value: this.draft.gitShaMode,
        hint: "off keeps branches quiet; detached shows the SHA only on detached HEAD.",
        mutate: () => {
          this.draft.gitShaMode = nextIn(this.draft.gitShaMode, [
            "off",
            "detached",
            "always",
          ] as const);
        },
      },
      {
        kind: "setting",
        label: "Polling",
        value: formatPolling(this.draft.gitPollIntervalMs),
        hint: "External file changes usually appear on the next poll.",
        mutate: () => {
          this.draft.gitPollIntervalMs = nextNumber(this.draft.gitPollIntervalMs, [
            ...POLL_INTERVALS,
          ]);
        },
      },
    );

    return rows;
  }

  /** Selectable rows only, so the cursor skips section headings. */
  private settingRows(): SettingRow[] {
    return this.rows().filter((row): row is SettingRow => row.kind === "setting");
  }

  private activateCurrent(): void {
    const row = this.settingRows()[this.cursor];
    if (!row) return;
    if (!row.mutate) {
      this.status = row.hint ?? "This row is informational.";
      return;
    }
    row.mutate();
    const next = this.settingRows()[this.cursor];
    this.status = `${row.label} → ${next?.value ?? "updated"}. Press S to save.`;
  }

  /** Reorder the selected segment; a no-op message for non-segment rows. */
  private moveSelectedSegment(direction: -1 | 1): void {
    const row = this.settingRows()[this.cursor];
    const id = row ? this.segmentIdForLabel(row.label) : undefined;
    if (!id) {
      this.status = "Reorder applies to segment rows only.";
      return;
    }
    if (!this.draft.segments.includes(id)) {
      this.status = `${segmentLabel(id)} is hidden — enable it first.`;
      return;
    }
    const before = this.draft.segments.indexOf(id);
    this.draft = moveSegment(this.draft, id, direction);
    const after = this.draft.segments.indexOf(id);
    this.status =
      before === after
        ? direction < 0
          ? `${segmentLabel(id)} is already first.`
          : `${segmentLabel(id)} is already last.`
        : `${segmentLabel(id)} moved ${direction < 0 ? "up" : "down"}. Press S to save.`;
  }

  private segmentIdForLabel(label: string): SegmentId | undefined {
    return SEGMENT_ORDER.find((id) => segmentLabel(id) === label);
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.ctrl("c"))) {
      this.done({ action: "cancel" });
      return;
    }
    if (matchesKey(data, Key.escape) || data === "q" || data === "Q") {
      this.done({ action: "cancel" });
      return;
    }
    if (data === "s" || data === "S") {
      this.done({ action: "save", config: cloneConfig(this.draft) });
      return;
    }
    if (data === "r" || data === "R") {
      this.draft = defaultConfig();
      this.cursor = 0;
      this.status = "Defaults restored locally. Press S to save or Esc to discard.";
      this.requestRender();
      return;
    }

    const count = this.settingRows().length;
    if (matchesKey(data, Key.up)) {
      this.cursor = count === 0 ? 0 : (this.cursor - 1 + count) % count;
      this.requestRender();
      return;
    }
    if (matchesKey(data, Key.down)) {
      this.cursor = count === 0 ? 0 : (this.cursor + 1) % count;
      this.requestRender();
      return;
    }
    if (matchesKey(data, Key.enter)) {
      this.activateCurrent();
      this.requestRender();
      return;
    }
    if (data === "j" || data === "J") {
      this.moveSelectedSegment(1);
      this.requestRender();
      return;
    }
    if (data === "k" || data === "K") {
      this.moveSelectedSegment(-1);
      this.requestRender();
    }
  }

  private renderPreview(lines: string[], width: number, colors: PaneColors): void {
    const preview = this.previewState
      ? renderInputSurface(this.previewState, this.draft, Math.max(24, width - 4), {
          contentLines: ["Ask pi to improve the input surface..."],
          focused: true,
        })
      : renderInputSurfacePreview(this.draft, Math.max(24, width - 4), {
          contentLines: ["Ask pi to improve the input surface..."],
          focused: true,
        });
    lines.push(plainLine(["  ", colors.accent("PREVIEW")], width));
    for (const previewLine of preview) {
      lines.push(plainLine(["  ", previewLine], width));
    }
  }

  private renderRow(row: Row, index: number, labelWidth: number, colors: PaneColors): string {
    if (row.kind === "section") return colors.dim(row.label);

    const selected = index === this.cursor;
    const valueTone = selected
      ? colors.accent
      : row.value === "on"
        ? colors.success
        : row.value === "off"
          ? colors.dim
          : colors.muted;
    const cursor = selected ? colors.accent("› ") : "  ";
    const marker = selected ? colors.accent("●") : colors.dim("●");
    const labelTone = selected ? colors.accent : colors.muted;
    const value = row.mutate
      ? `${colors.dim("[ ")}${valueTone(row.value)}${colors.dim(" ]")}`
      : colors.dim(row.value);
    return `${cursor}${marker} ${padRightAnsi(labelTone(row.label), labelWidth)}${value}`;
  }

  render(width: number): string[] {
    const t = this.theme;
    const colors: PaneColors = {
      accent: (s: string) => t.fg("accent", s),
      muted: (s: string) => t.fg("muted", s),
      dim: (s: string) => t.fg("dim", s),
      warn: (s: string) => t.fg("warning", s),
      success: (s: string) => t.fg("success", s),
    };

    const dirty = this.isDirty();
    const headerLeft = `${colors.accent(t.bold("◌ pi-footer"))} ${colors.dim("settings")}`;
    const headerRight = dirty ? colors.warn("● Unsaved changes") : colors.success("✓ Saved");

    const lines: string[] = [
      plainLine(["  ", spreadAnsi(headerLeft, headerRight, Math.max(10, width - 4))], width),
    ];
    if (this.status) lines.push(plainLine(["  ", colors.dim(this.status)], width));
    lines.push("");

    this.renderPreview(lines, width, colors);
    lines.push("");

    const rows = this.rows();
    const labelWidth = Math.max(
      ...rows.filter((row): row is SettingRow => row.kind === "setting").map((row) => visibleWidth(row.label)),
    ) + 2;

    let settingIndex = 0;
    for (const row of rows) {
      if (row.kind === "section") {
        lines.push(plainLine(["  ", this.renderRow(row, 0, labelWidth, colors)], width));
      } else {
        lines.push(plainLine(["  ", this.renderRow(row, settingIndex, labelWidth, colors)], width));
        settingIndex++;
      }
    }

    const selected = this.settingRows()[this.cursor];
    if (selected?.hint) {
      lines.push("");
      lines.push(plainLine(["  ", colors.dim(selected.hint)], width));
    }

    lines.push("");
    lines.push(
      plainLine(
        [
          "  ",
          [
            shortcut(colors, "↑↓", "nav"),
            shortcut(colors, "Enter", "change"),
            shortcut(colors, "J/K", "reorder"),
            shortcut(colors, "S", "save"),
            shortcut(colors, "R", "reset"),
            shortcut(colors, "Esc", "cancel"),
          ].join(colors.dim(" · ")),
        ],
        width,
      ),
    );
    return lines;
  }
}

interface FooterPaneUI {
  custom<T>(
    factory: (tui: TUI, theme: Theme, keybindings: unknown, done: (result: T) => void) => Component,
  ): Promise<T>;
}

export async function showFooterPane(
  initial: FooterConfig,
  ctx: { ui: FooterPaneUI },
  previewState?: FooterState,
): Promise<PaneResult> {
  return ctx.ui.custom<PaneResult>((tui, theme, _kb, done) => {
    return new FooterConfigPane(initial, theme, done, () => tui.requestRender(), previewState);
  });
}
