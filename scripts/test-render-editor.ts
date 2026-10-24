import { strict as assert } from "node:assert";
import { visibleWidth } from "@mariozechner/pi-tui";
import { defaultConfig } from "../config.ts";
import { FooterEditor } from "../editor.ts";
import type { FooterState } from "../types.ts";

function testState(): FooterState {
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
    model: { id: "gpt-5.5", provider: "openai", displayName: "GPT 5.5", thinking: "off" },
    context: { tokens: 1000, window: 100_000, percent: 1 },
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    speedEngine: null,
    version: 0,
  };
}

// Minimal TUI/theme doubles: the editor only needs terminal rows, requestRender, and borderColor.
const tui = { terminal: { rows: 40 }, requestRender() {} };
const theme = { borderColor: (text: string) => text };
const keybindings = { matches: () => false };

function renderEditorWidth(text: string, width = 60): string[] {
  const config = defaultConfig();
  const editor = new FooterEditor(
    tui as never,
    theme as never,
    keybindings as never,
    testState,
    () => config,
  );
  editor.setText(text);
  return editor.render(width);
}

function plain(line: string): string {
  return line.replace(/\x1b\[[0-9;]*m/g, "");
}

// First content row carries the prompt glyph framed by the box borders.
const lines = renderEditorWidth("hello world\nsecond line");
const body = lines.slice(1, -1).map(plain);
assert.equal(body[0], "│› hello world                                             │");
assert.equal(body[1], "│  second line                                             │");

// Continuation rows indent to the glyph so the text stays aligned.
assert.equal(
  body[0]!.indexOf("hello"),
  body[1]!.indexOf("second"),
  "continuation row aligns with the first row",
);

// Every rendered row must keep the exact requested width.
for (const line of lines) {
  assert.equal(visibleWidth(line), 60, `row keeps width: ${plain(line)}`);
}

// An empty prompt still shows the glyph on the first content row.
const emptyBody = renderEditorWidth("").slice(1, -1).map(plain);
assert.equal(emptyBody[0], "│›                                                         │");
assert.equal(emptyBody[1], "│                                                          │");

// Exactly one gap column separates the glyph from the text.
assert.equal(body[0]!.indexOf("hello"), body[0]!.indexOf("›") + 2, "one gap after the glyph");

console.log("✓ editor prompt marker checks passed");
