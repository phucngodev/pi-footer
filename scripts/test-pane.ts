import { strict as assert } from "node:assert";
import { defaultConfig } from "../config.ts";
import { showFooterPane } from "../pane.ts";
import type { FooterConfig } from "../types.ts";

const DOWN = "\u001b[B";
const UP = "\u001b[A";
const ENTER = "\r";
const ESC = "\u001b";

// Minimal theme double: the pane only needs fg() and bold().
const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

function plain(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

interface Harness {
  pane: {
    render(width: number): string[];
    handleInput(data: string): void;
  };
  result: Promise<{ action: "save"; config: FooterConfig } | { action: "cancel" }>;
}

/** Drive the pane headlessly: capture the component and its result promise. */
function openPane(initial: FooterConfig): Harness {
  let pane: Harness["pane"] | undefined;
  const ctx = {
    ui: {
      custom: async (factory: (tui: unknown, theme: unknown, kb: unknown, done: unknown) => unknown) =>
        new Promise((resolve) => {
          pane = factory({ requestRender() {} }, theme, {}, resolve) as Harness["pane"];
        }),
    },
  };
  const result = showFooterPane(initial, ctx as never) as Harness["result"];
  return { pane: pane!, result };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

function lines(h: Harness): string[] {
  return h.pane.render(80).map(plain);
}

/** Setting rows are the only lines with a "[ value ]" cell (the preview has none). */
function settingLines(h: Harness): string[] {
  return lines(h).filter((line) => line.includes("[ "));
}

/** The label of the row currently under the cursor. */
function selectedLabel(h: Harness): string | undefined {
  const selected = settingLines(h).find((line) => line.includes("› "));
  // Strip the cursor, marker and value cell to leave the plain label.
  return selected?.replace(/^\s*›\s*●\s*/, "").replace(/\s*\[.*$/, "");
}

function moveCursorTo(h: Harness, label: string): void {
  // Every setting row is reachable with ↓ only, so walk down from the top.
  for (let i = 0; i < 40; i++) {
    if (selectedLabel(h) === label) return;
    h.pane.handleInput(DOWN);
  }
  assert.fail(`could not select "${label}", stuck on "${selectedLabel(h)}"`);
}

/** Every setting row is one Enter away — no nested navigation exists. */
async function assertFlatSingleLevel(): Promise<void> {
  const h = openPane(defaultConfig());
  await settle();

  const text = lines(h).join("\n");
  for (const section of ["EDITOR", "DISPLAY", "SEGMENTS", "GIT"]) {
    assert.ok(text.includes(section), `section ${section} rendered`);
  }
  // Settings from every former sub-page appear in the same list.
  for (const label of [
    "Min input rows",
    "Theme",
    "Model icon",
    "All segments",
    "Context",
    "Dirty marker",
    "Polling",
  ]) {
    assert.ok(text.includes(label), `${label} is a top-level row`);
  }

  // A single Enter changes the selected setting; no second panel is entered.
  const before = lines(h).join("\n");
  h.pane.handleInput(DOWN);
  h.pane.handleInput(DOWN);
  h.pane.handleInput(ENTER);
  const after = lines(h).join("\n");
  assert.notEqual(before, after, "Enter mutates the selected setting directly");
  assert.ok(after.includes("Press S to save"), "status confirms the change");
}

/** The whole config survives save, and cancel discards edits. */
async function assertSaveAndCancel(): Promise<void> {
  const h = openPane(defaultConfig());
  await settle();

  moveCursorTo(h, "Theme");
  h.pane.handleInput(ENTER);
  h.pane.handleInput("s");
  const saved = await h.result;
  assert.equal(saved.action, "save", "S resolves with save");
  assert.equal(
    saved.action === "save" ? saved.config.theme : undefined,
    "dark",
    "saved config keeps the change",
  );

  const cancelled = openPane(defaultConfig());
  await settle();
  moveCursorTo(cancelled, "Theme");
  cancelled.pane.handleInput(ENTER);
  cancelled.pane.handleInput(ESC);
  const result = await cancelled.result;
  assert.equal(result.action, "cancel", "Esc resolves with cancel");
}

/** Segment rows toggle visibility from the same list. */
async function assertSegmentToggle(): Promise<void> {
  const h = openPane(defaultConfig());
  await settle();

  moveCursorTo(h, "Git");
  h.pane.handleInput(ENTER);
  h.pane.handleInput("s");
  const saved = await h.result;
  assert.equal(saved.action, "save");
  assert.deepEqual(
    saved.action === "save" ? saved.config.segments : undefined,
    ["context", "speed", "git"],
    "toggling Git appends it to the segment list",
  );
}

/** J / K reorder the selected segment in place. */
async function assertSegmentReorder(): Promise<void> {
  const initial = defaultConfig();
  const h = openPane(initial);
  await settle();

  moveCursorTo(h, "Speed");
  h.pane.handleInput("k");
  h.pane.handleInput("s");
  const saved = await h.result;
  assert.equal(saved.action, "save");
  assert.deepEqual(
    saved.action === "save" ? saved.config.segments : undefined,
    ["speed", "context"],
    "K moves the segment to the front",
  );
}

/** ↑ wraps to the last row and skips all section headings. */
async function assertCursorNavigation(): Promise<void> {
  const h = openPane(defaultConfig());
  await settle();

  h.pane.handleInput(UP);
  assert.equal(selectedLabel(h), "Polling", "↑ wraps to the last setting row");
}

await assertFlatSingleLevel();
await assertSaveAndCancel();
await assertSegmentToggle();
await assertSegmentReorder();
await assertCursorNavigation();

console.log("✓ settings pane flat-list checks passed");
