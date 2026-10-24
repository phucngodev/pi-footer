<div align="center">

# ◌ pi-footer

**A calm input surface for [pi](https://github.com/badlogic/pi-mono)**

Replace the default prompt with a rounded multiline editor
and an inline status footer for model, context, tokens, cost, and Git.

[![npm](https://img.shields.io/npm/v/pi-footer?style=flat-square&color=blue)](https://www.npmjs.com/package/pi-footer)
[![license](https://img.shields.io/badge/license-MIT-64748b?style=flat-square)](LICENSE)
[![pi](https://img.shields.io/badge/pi-package-7c3aed?style=flat-square)](https://github.com/badlogic/pi-mono)

</div>

---

## Install

From npm:

```bash
pi install npm:pi-footer
```

Or clone as a traditional pi extension directory:

```bash
git clone https://github.com/phucngodev/pi-footer.git ~/.pi/agent/extensions/pi-footer
```

Then restart pi or run `/reload`.

For development/testing:

```bash
pi -e /path/to/pi-footer
```

Local Git diagnostics:

```bash
npm run test:git
npm run debug:git
```

## Use

```text
/footer
```

That's the only command — opens a single flat settings list. Every option is one `Enter` away: no nested pages.

## What you see

![pi-footer demo](https://raw.githubusercontent.com/phucngodev/pi-footer/main/assets/demo.png)

|     |                    |                                                                                  |
| --- | ------------------ | -------------------------------------------------------------------------------- |
| 🖊️  | **Rounded editor** | Configurable 2 / 3 / 4 min rows, prompt `›` marker, preserves all pi defaults           |
| 🏷️  | **Project title**  | Current folder name on the top-left border                                       |
| 📊  | **Inline status**  | Model · context · tokens · cost · Git status — top-right                         |
| ⚙️  | **`/footer` pane** | One flat settings list — ↑↓ to move, Enter to change, Save / Cancel            |
| 💤  | **Dim unfocused**  | Surface quiets down when you scroll the chat                                     |
| 🎨  | **Two themes**     | `light` and `dark` with tuned grey-green borders                                 |

## Notes

- Icons default to `plain` so pi-footer works with normal terminal fonts.
- If you use a Nerd Font, open `/footer` and set `Icons` to `nerd` for richer symbols.
- The model segment shows the `name` field from your `models.json` entry, falling back to a shortened model id. Custom names in `customNames` still win.
- `Model icon` and `Thinking level` toggles sit in the **DISPLAY** group of `/footer`. Both default to off, so the segment renders just the model name.

## Settings

`/footer` shows one flat list. Section labels (`EDITOR`, `DISPLAY`, `SEGMENTS`, `GIT`) are only headings —
every setting is reachable with `↑↓` and changes immediately with `Enter`.

| Key     | Action                                    |
| ------- | ----------------------------------------- |
| `↑` `↓` | Move between settings (skips headings)    |
| `Enter` | Change the selected setting               |
| `J` `K` | Move the selected segment down / up       |
| `S`     | Save and close                            |
| `R`     | Restore defaults locally                  |
| `Esc`   | Cancel without saving                     |

The config file at `~/.pi/agent/pi-footer/config.json` is flat too, so it can be edited by hand:

```json
{
  "version": 3,
  "enabled": true,
  "theme": "light",
  "icons": "plain",
  "minContentRows": 2,
  "adaptive": true,
  "showProvider": "auto",
  "showModelIcon": false,
  "showThinkingLevel": false,
  "segments": ["context", "speed"],
  "customNames": {},
  "toggleAllEnabled": true,
  "gitShowDirty": true,
  "gitShowAheadBehind": true,
  "gitShaMode": "off",
  "gitTimeoutMs": 1000,
  "gitRefreshDebounceMs": 1500,
  "gitPollIntervalMs": 5000
}
```

`segments` is the ordered list of visible segment ids; anything missing is hidden.
Older nested `config.json` files (`editor` / `display` / `git` / `model` groups) are migrated
automatically on load, and the file is rewritten flat on the next save.

## Git status

The Git segment is intentionally quiet:

- Clean repositories show only the branch name.
- Dirty repositories add `*` in plain mode or `●` in Nerd Font mode.
- Conflicts add `!` in plain mode or `⚠` in Nerd Font mode.
- Ahead/behind counts appear when Git reports an upstream, for example `↑2 ↓1`.
- Non-Git directories hide the Git segment.

The Git options live in the **GIT** group of the flat `/footer` list:

- `Dirty marker` — hide/show normal dirty markers; conflict markers stay visible.
- `Ahead / behind` — hide/show upstream counts.
- `SHA` — `off`, `detached`, or `always`.
- `Polling` — `2s`, `5s`, `10s`, or `30s`.

Git is collected asynchronously and cached. External file changes usually appear within a few seconds. For local development/debugging you can compare pi-footer with Git directly:

```bash
git status --short --branch
npm run debug:git
```

## Design

- No pi core patches — public extension APIs only
- No render-time IO — Git is collected asynchronously and cached
- Global config at `~/.pi/agent/pi-footer/config.json`
