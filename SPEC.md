# Theme Engine — Specification

> One source of truth — a full **VSCode theme JSON** — projected into every tool's
> native format, with a single switcher that live-reloads running apps. Any VSCode
> theme (Shades of Purple, GitHub, Catppuccin, …) becomes your whole-OS theme.

Status: **spec, not yet built.** This document is the implementation guide. It
names exactly what to build, what to steal (with URLs, files, licenses), and where
every target tool's format + live-reload mechanism lives. An implementing agent
should be able to build the v1 slice from this doc without re-researching.

---

## 1. Why & the core thesis

The recurring pain: Shades of Purple (SoP) is hand-ported into ~21 tools, each a
different format (`.tmTheme` XML, shiki JSON, Lua, TOML, btop `.theme`, ghostty
`key=value`, …). Every new tool restarts the shoehorning. Switching themes is
N manual edits.

Prior art (researched — see §8) splits into two camps, neither of which fits:

- **Universal switchers** (omarchy, base16/tinted-theming `tinty`, stylix) use a
  **small palette** as the source of truth (16–24 colors). Great for terminals,
  **lossy for syntax highlighting** — SoP's 143 TextMate scopes collapse into ~16
  buckets.
- **VSCode→X converters** (`code-theme-converter`, shiki) exist but are point tools,
  not a whole-OS switcher.

**Our differentiator: use the FAT format (full VSCode theme JSON) as canonical, and
project _down_ to 16-ANSI for dumb tools while passing _through_ at full fidelity
for smart ones (bat/yazi/shiki/editors).** You can always collapse rich→simple,
never the reverse. That's the variant nobody built because the established players
were palette-first from day one.

### Three goals (from the user)
1. Custom generator, **one source of truth**.
2. **Dark/light** variants.
3. **House multiple themes** — drop in any VSCode theme, get all tools for free.

---

## 2. Canonical format = VSCode theme JSON

The source of truth is a standard VSCode color-theme JSON:

```jsonc
{
  "name": "Shades of Purple",
  "type": "dark",                      // "dark" | "light"  (drives light/dark — see §6)
  "colors": {                          // UI / workbench colors
    "editor.background": "#2D2B55",
    "editor.foreground": "#FFFFFF",
    "editor.selectionBackground": "#B362FF",
    "editorCursor.foreground": "#FAD000",
    "terminal.ansiBlack": "#000000",   // ← the 16 ANSI slots live HERE (see §5 table)
    "terminal.ansiRed": "#EC3A37",
    "...": "terminal.ansiBrightWhite, terminal.background/foreground, etc."
  },
  "tokenColors": [                     // 143 TextMate scope rules (the syntax soul)
    { "name": "Comment", "scope": "comment", "settings": { "foreground": "#B362FF", "fontStyle": "italic" } }
    // ...
  ]
}
```

Why this is the right floor (not a 16-token semantic model):
- **shiki consumes it as-is** (yazi syntax, git-split-diffs, our pagers).
- **tmTheme is mechanically derivable** from `tokenColors` (bat, yazi, oyo).
- **terminals already carry their data**: `terminal.ansi*` → the 16 ANSI slots are
  authored by the theme, not guessed by us.
- **Any marketplace theme drops in** with zero authoring.

### Canonical source = the installed editor extension theme  ★ ingestion model
The authoritative source is the **installed VSCode/Cursor extension's theme JSON** —
the exact file the editor renders. This makes the "any VSCode theme → your OS theme"
promise concrete: the on-ramp is copying a theme JSON out of the editor's extension
folder.

For SoP, the source is the official **`ahmadawais.shades-of-purple` v7.3.6** (Mac):
- `~/.cursor/extensions/ahmadawais.shades-of-purple-7.3.6-universal/themes/`
  (mirrored under `~/.vscode/extensions/…`)
- Variants: `shades-of-purple-color-theme.json` (standard, 143 tokenColors / 484
  `colors{}` keys / 16 ANSI), `…-super-dark.json` (same richness, darker bg),
  `…-italic.json` (thinner, 103 tokenColors). **No light variant — SoP is dark-only**
  (so a light theme must be a *different* VSCode theme, e.g. github-light; §6).

**Ingestion = discover ALL installed editor themes (not just SoP).** `theme list`
scans the editor extension dirs and enumerates **every** installed theme — your whole
library becomes the switchable set (true omarchy model). Don't glob theme JSONs blindly;
**read each extension's `package.json` → `contributes.themes[]`**, which gives the
authoritative `label`, `path`, and `uiTheme` (`vs-dark`/`hc-black` = dark, `vs` = light).

Scan roots (Mac): `~/.cursor/extensions/*/package.json` and `~/.vscode/extensions/*/package.json`
(plus the editors' built-in themes dir for Default Dark/Light). Current inventory on the
user's Mac: **~69 theme files across 9 extensions** — incl. Catppuccin Mocha, Tokyo Night
(storm/light), GitHub Dark Default, Atom One Dark, OneDark Pro, Solarized Dark+, Synthwave,
Bluloco light/dark, SoP ×3.

- `theme list [--json]` → label, source ext, dark/light, resolved JSON path.
- `theme set "<label>"` → resolve label→path, load that theme JSON, project to all tools.
- `theme import <path> [--as <name>]` → optional: copy a theme into `theme/themes/` to pin
  it independent of the editor install (for themes you want version-controlled in dotfiles).
- **dark/light is just each theme's `uiTheme`** — switching light = picking a light theme
  (Tokyo Night Light, Bluloco Light), NOT authoring a light SoP (§6). SoP itself is dark-only.

Themes can be read **live from the extension dir** (no pre-copy needed); `import` is only
for ones you want frozen in the repo. The in-repo copies (`.config/git-split-diffs/`, `hunk/`,
`yazi/*.shiki.json`) become *generated outputs* once the engine exists, not sources.

**Step 0 of implementation:** wire `theme list` to parse `contributes.themes` from the
installed editor extension dirs; confirm it enumerates the available themes. Use Shades
of Purple as the first end-to-end test theme.

---

## 3. Architecture

```
theme/
  SPEC.md                       ← this file
  themes/                       ← canonical inputs (any VSCode theme JSON)
    shades-of-purple-dark.json
    shades-of-purple-light.json   (light = a SEPARATE file, not a computed flip — §6)
    github-dark.json
    github-light.json
  src/
    cli.ts                      ← `theme set|list|current|init` (Bun + TS)
    load.ts                     ← JSON5.parse + normalize (name/type defaults)
    adapters/                   ← pure fns: (vscodeTheme) -> string (file content)
      shiki.ts                  ← passthrough (already VSCode format)
      tmtheme.ts                ← tokenColors[] -> plist  (STEAL — §4.2)
      ghostty.ts                ← colors[terminal.ansi*] -> palette  (§5)
      tmux.ts  btop.ts  herdr.ts  lazygit.ts  hunk.ts  nvim.ts  ...
    project.ts                  ← VSCode colors -> the small per-tool palette/fields
  targets.json                  ← adapter -> dest path(s) + reload hook (the registry)
  state                         ← one line: current theme id (steal tinty's model)
```

Flow of `theme set <name> [--variant dark|light]`:
1. Load `themes/<name>-<variant>.json` (JSON5 parse, normalize).
2. For each entry in `targets.json`: run its adapter → write file to dest path(s).
3. Run each entry's **reload hook** (best-effort live reload — §5).
4. Write `state`.
`theme init` (run from shell rc) re-applies `state` on login for persistence.

### The 3 output families (21 tools collapse into these)
| Family | Adapter | Feeds | Fidelity |
|---|---|---|---|
| **VSCode-JSON passthrough** | `shiki.ts` (≈copy) | git-split-diffs, hunk `syntax_theme`, yazi shiki, opencode, vscode, cursor | full |
| **tmTheme / plist** | `tmtheme.ts` | bat, yazi `tmtheme.xml`, oyo, delta (via bat cache) | full syntax |
| **flat key=color / ANSI-16** | `ghostty/tmux/btop/herdr/lazygit/hunk-ui/nvim` | terminals + TUIs | 16-color projection |

Adding a new tool = pick its family, write (or reuse) one small adapter + a
`targets.json` row. Never a 22nd bespoke format.

### Per-tool generation mode (in `targets.json`)
Each target declares a `mode` — generation owns it by default, but you opt out where
hand-tuning or a native theme wins (decision §10.5):
- **`generated`** (default) — engine projects + writes the file.
- **`manual`** — engine **skips** it entirely; your hand-tuned file stays. Use when a
  bespoke config beats projection (e.g. **herdr `[theme.custom]`** today).
- **`selector`** — engine doesn't generate colors; it just **selects a native theme by
  name** (omarchy-style), via a per-theme name map (theme label → native name). **Falls
  back to `generated` when the current theme has no mapped native name.** Use for **nvim**
  (SoP → `Rigellute/shades-of-purple.vim`; Tokyo Night → its plugin; unmapped → generate a
  `colors/<slug>.lua`), and **vscode/cursor** (just set `workbench.colorTheme` to the
  source theme's own label — trivially always available).
A `manual`/`selector` target still gets its **reload hook** run so switches still apply.

---

## 4. What to steal (do NOT write from scratch)

### 4.1 Switcher ergonomics — from `tinty` (tinted-theming)
- **Repo:** https://github.com/tinted-theming/tinty · **License: GPL-3.0** → *concepts
  only, do not copy Rust source verbatim* (would force GPL on our CLI). Config-format
  and command shapes are not copyrightable; reimplement them.
- **Steal (reimplement in TS):**
  - The **`[[items]]` config model**: per-app `name` / `path` / `hook`, plus a global
    `shell` + `hooks` array. This is our `targets.json`. *Improvement over tinty: add
    an explicit `destination` field* (tinty hides the dest inside the hook's `cp %f …`).
  - The **hook = live-reload contract** with the theme-file path + a rich env block
    (`$THEME_FILE_PATH`, `$THEME_OPERATION=apply|init`, scheme id/variant). Reload
    patterns transfer directly: tmux `source-file`, `systemctl restart`, `bat cache --build`.
  - **State = one flat file** holding `current_scheme` (e.g. `theme/state`), read by
    `init`/`current`. Copy this model wholesale — no DB, no lock.
  - **Command surface:** `apply/set <scheme>`, `current [prop]`, `list`, `init`,
    optional `cycle`, `generate-completion`.
- **Do NOT steal:** the base16/base24 **Mustache builder** and `base00-hex-*` variable
  taxonomy — it assumes a 16-color palette. Our renderer reads the VSCode JSON instead.
  Also drop tinty's git-repo template distribution (`sync`, `revision`, `themes-dir`);
  our themes are local files.
- USAGE reference (real config blocks + hook env): https://raw.githubusercontent.com/tinted-theming/tinty/main/USAGE.md

### 4.2 VSCode → tmTheme converter — from `code-theme-converter`  ★ highest leverage
- **Repo:** https://github.com/tobiastimm/code-theme-converter · **License: MIT** →
  *copy/adapt freely* (keep the copyright notice).
- **The prize file:** `src/sublime/tmTheme.ts`
  https://raw.githubusercontent.com/tobiastimm/code-theme-converter/master/src/sublime/tmTheme.ts
  — `toTmTheme(vscodeTheme)` → full `.tmTheme` plist string in ~140 lines.
- **Key insight:** a VSCode `tokenColors[]` entry is *already* the right shape for a
  tmTheme rule `<dict>`. The **only** per-rule transform is joining the `scope` array
  into a comma-separated string. The real work is the **global `settings` dict** (~9
  `colors{}` keys → tmTheme globals). **`plist.build()` does ALL the XML — never
  hand-write plist.**
- **Deps to pull:** `plist` (MIT, https://www.npmjs.com/package/plist) — the only one
  that matters; `json5` (parse VSCode JSON with comments/trailing commas). Drop
  `ramda` (replace its `curryN` with a closure), `uuid` optional.
- **Helper file worth lifting:** `src/util/vscode.ts` — `findEditorColor(colors)([...keys])`
  (first-match-wins color lookup) + the `CodeTheme`/`TokenColor` types.
  https://raw.githubusercontent.com/tobiastimm/code-theme-converter/master/src/util/vscode.ts

#### tmTheme global `settings` ← VSCode `colors{}` mapping (first-match-wins)
| tmTheme global key | VSCode `colors{}` source |
|---|---|
| `background` | `editor.background` |
| `foreground` | `editor.foreground` |
| `caret` | `editorCursor.background` → `editor.foreground` |
| `selection` | `editor.selectionBackground` |
| `lineHighlight` | `editor.lineHighlightBackground` |
| `invisibles` | `editorWhitespace.foreground` *(add; the tool omits it)* |
| `accent` | `list.highlightForeground` |
| `activeGuide` | `editorIndentGuide.background` |
| `findHighlight` | `editor.findMatchHighlightBackground` |
| `misspelling` | `editorError.foreground` |

#### Per-scope rule: `tokenColors[]` → tmTheme `<dict>` (1:1, one transform)
`name`→`name` (passthrough); `scope`→`scope` (**array → `scope.join(', ')`**);
`settings.{foreground,background,fontStyle}`→passthrough. Then
`plist.build({ name, settings: [globalDict, ...ruleDicts], uuid, colorSpaceName: 'sRGB' })`.

### 4.3 shiki passthrough — no code needed
- A standard VSCode theme JSON is a **drop-in shiki theme.** shiki's `normalizeTheme()`
  (https://github.com/shikijs/shiki/blob/main/packages/primitive/src/textmate/normalize-theme.ts)
  already maps `tokenColors → settings` and derives bg/fg from
  `colors['editor.background'/'editor.foreground']`. Our `shiki.ts` adapter = ensure
  top-level `name`+`type` exist, then write the JSON through. Used by git-split-diffs,
  hunk `syntax_theme`, yazi shiki, any shiki-based pager.

### 4.4 Live-reload catalog & indirection — from `omarchy`
- **Repo:** https://github.com/basecamp/omarchy · **License: MIT** → reuse freely.
- **Steal the per-app reload command catalog** (§5 — this is the single most valuable
  hard-won artifact). Source scripts: `bin/omarchy-restart-*`,
  `bin/omarchy-theme-set-{foot,vscode,browser,gnome}`,
  switch driver `bin/omarchy-theme-set`
  (https://raw.githubusercontent.com/basecamp/omarchy/master/bin/omarchy-theme-set).
- **Steal the "stable include path + atomic dir swap" indirection:** every app's real
  config permanently `include`s a fixed path (e.g. ghostty `config-file = ?…/current/theme/ghostty.conf`);
  switching = render into a staging dir then `mv next-theme current/theme` (atomic,
  instant rollback, no per-app config rewriting). Generator template engine is
  `bin/omarchy-theme-set-templates` (bash+sed, `{{ key }}` / `{{ key_strip }}` /
  `{{ key_rgb }}` three-forms-per-color) — pattern worth copying, but we render from
  VSCode JSON in TS, not sed.
- **Steal `light.mode` marker idea** conceptually (§6), and the post-switch user hook.
- **Differs:** omarchy's source of truth is a flat 22-key `colors.toml` (palette-first);
  ours is the VSCode JSON (fat-first). We plug in *upstream* of their `colors.toml`
  stage and reuse the reload layer.

---

## 5. Per-tool target reference

### The load-bearing fact: ANSI mapping is direct
VSCode `terminal.ansi*` → the 16 ANSI palette slots, in order:

| Slot | VSCode key | Slot | VSCode key |
|---|---|---|---|
| 0 | `terminal.ansiBlack` | 8 | `terminal.ansiBrightBlack` |
| 1 | `terminal.ansiRed` | 9 | `terminal.ansiBrightRed` |
| 2 | `terminal.ansiGreen` | 10 | `terminal.ansiBrightGreen` |
| 3 | `terminal.ansiYellow` | 11 | `terminal.ansiBrightYellow` |
| 4 | `terminal.ansiBlue` | 12 | `terminal.ansiBrightBlue` |
| 5 | `terminal.ansiMagenta` | 13 | `terminal.ansiBrightMagenta` |
| 6 | `terminal.ansiCyan` | 14 | `terminal.ansiBrightCyan` |
| 7 | `terminal.ansiWhite` | 15 | `terminal.ansiBrightWhite` |

Plus: `terminal.background`→bg, `terminal.foreground`→fg,
`terminalCursor.foreground`(→`terminal.foreground`)→cursor,
`terminal.selectionBackground`→selection.
Ref: https://code.visualstudio.com/api/references/theme-color

### Per-tool table
Columns: **family** · **current repo path / how it selects today** · **required fields** ·
**live-reload** (⚠ = can't hot-reload).

| Tool | Family | Repo path & current selection | Required fields | Live-reload |
|---|---|---|---|---|
| **ghostty** | ANSI-16 | `.config/ghostty/config` (inline `background=`, `palette = N=…`) | `palette = 0..15=#hex`, `background`, `foreground`, `cursor-color`, `selection-background/-foreground` | **Yes** — `kill -SIGUSR2 <pid>` (≥1.2; **only SIGUSR2, other signals crash it**) / `reload_config` keybind / `systemctl reload --user app-com.mitchellh.ghostty.service` |
| **tmux** | ANSI-16 | `home/.tmux.conf` | `status-style`, `window-status-current-style`, `pane-border-style`, `pane-active-border-style`, `mode-style`, `message-style` | **Yes** — `tmux source-file <file>` |
| **bat** | tmTheme | `.config/bat/config` (`--theme="Shades-of-Purple"`), theme at `.config/bat/themes/Shades-of-Purple.tmTheme` | full tmTheme | ⚠ next-run **+ mandatory** `bat cache --build` post-write |
| **delta** | tmTheme (via bat) | `home/.gitconfig` `[delta] syntax-theme = Shades-of-Purple` | reuses bat's tmTheme | per-invocation (rerun `bat cache --build` after theme change) |
| **yazi** | tmTheme + shiki | `.config/yazi/theme.toml` `[flavor] dark/light="shades-of-purple"`; pkg `flavors/shades-of-purple.yazi/` (`flavor.toml` + `tmtheme.xml`) | `flavor.toml` UI styles + `tmtheme.xml` syntax | ⚠ **next-launch only** |
| **btop** | flat | `.config/btop/btop.conf` `color_theme = "shades-of-purple"`; theme at `.config/btop/themes/shades-of-purple.theme` | `theme[main_bg]`,`main_fg`,`title`,`hi_fg`,`selected_bg/fg`,`inactive_fg`, box borders `cpu/mem/net/proc_box`,`div_line`, gradient triplets `cpu/temp/mem/net/process_*_{start,mid,end}` | **Yes** — `pkill -SIGUSR2 btop` (file edits not watched; signal or in-app menu) |
| **herdr** | flat | `.config/herdr/config.toml` `[theme.custom]` (`base`,`panel_bg`,`surface0/1`,…, hex) | the `[theme.custom]` key set | server `reload-config` for config-only changes; a code change needs a full restart |
| **hunk** (gh-dash pager) | passthrough + flat | `.config/hunk/config.toml` `theme="custom"` + `[custom_theme]` UI + `syntax_theme="shades-of-purple.json"` (a VSCode JSON!) | `[custom_theme]` UI keys (`label`,`accent`,`panel`,`noteBorder`,…) + `[custom_theme.syntax]` + the passthrough `syntax_theme` JSON | per-invocation |
| **git-split-diffs** | passthrough | `home/.gitconfig` `split-diffs.theme-name`; JSON at `.config/git-split-diffs/shades-of-purple.json` (**= canonical seed**) | `SYNTAX_HIGHLIGHTING_THEME` (shiki id) + line/border color objects | per-invocation |
| **opencode** | flat / projection | `.config/opencode/tui.json` `"theme":"shades-of-purple"`; theme at `.config/opencode/themes/<name>.json` (`$schema` + `defs` named hex + semantic `theme` w/ native dark/light per token) | opencode semantic schema (text, primary, accent, syntax.*, diff*, border) ← projection roles | restart / next-launch |
| **Claude Code** | flat / projection | `ai/.claude/settings.json` `"theme":"custom:<name>"`; theme at `~/.claude/themes/<name>.json` = `{name, base:dark\|light, overrides:{…}}` | agent-semantic `overrides`: `text`,`background`,`success`,`error`,`warning`,`diffAdded/Removed*`,`merged` ← canonical roles; **bespoke keys** `permission`,`planMode`,`claude`,`claudeShimmer`,`ide`,`promptBorder`,`suggestion`,`remember` ← **per-tool remap** (default from accent/primary/secondary) | ⚠ next-launch / restart (tinty precedent: `tinted-claude-code` writes `~/.claude/themes/*.json`) |
| **nvim** | flat | `.config/nvim/lua/plugins/colorscheme.lua` (uses `Rigellute/shades-of-purple.vim` plugin + overrides) | `colors/<name>.lua`: `g:terminal_color_0..15`, `Normal`,`CursorLine`,`Visual`,… | **Yes (remote)** — `nvim --server <sock> --remote-send '<C-\><C-N>:colorscheme <name><CR>'`; enumerate sockets for all instances |
| **lazygit** | flat | `.config/lazygit/config.yml` `gui.theme` | `activeBorderColor`,`inactiveBorderColor`,`selectedLineBgColor`,`defaultFgColor`,`unstagedChangesColor`,… (each = array of attr strings) | ⚠ **restart only** (no reload exists — issue #4193) |
| **vscode / cursor** | passthrough / source | `apps/vscode/settings.json`, `apps/cursor/settings.json` (`workbench.colorTheme`); **source of canonical themes** (`~/.cursor/extensions/*/themes/*.json`) | installs/selects the theme extension by name | patch `workbench.colorTheme` in settings.json (hot-applies); install ext if missing |
| **Zed** *(installed; sink for v1)* | flat / projection | `~/.config/zed/settings.json` `"theme"`; custom themes at `~/.config/zed/themes/<name>.json` (currently empty — uses bundled) | Zed theme schema v0.2.0: `themes[].appearance` + `.style{}` semantic UI keys + `.style.syntax{}` scope map (`{color,font_style,font_weight}`) ← projection roles + tokenColors | **Yes (file-watch)** — Zed watches `~/.config/zed/themes/` and hot-reloads on write; set `settings.json` `"theme"` to the generated name. Both source & sink (sink primary v1) |
| **oyo** | tmTheme + own | `.config/oyo/themes/shades-of-purple.json` (defs+semantic), `…-dark.tmTheme` | oyo theme schema + tmTheme | per-invocation |
| **macOS accent** *(Mac-only, lossy; deferred)* | nearest-preset | System-wide via `defaults write -g` | **No custom hex** — snap theme accent → nearest of 8 presets: `AppleAccentColor` int (`-1`Graphite `0`Red `1`Orange `2`Yellow `3`Green `4`Blue `5`Purple `6`Pink; absent=Multicolor) + `AppleHighlightColor "<r> <g> <b> <Name>"`. SoP gold→Yellow, Tokyo Night→Blue. | ⚠ apps relaunch to pick up; Mac-only → deferred two-machine bucket. Also read `AppleInterfaceStyle` here for optional dark/light OS-follow (§6) |
| **Raycast** *(Mac-only, Pro; v1.x)* | flat / projection | no repo file yet; theme = small palette JSON (`appearance`, `colors{background, backgroundSecondary, text, selection, loader, red, orange, yellow, green, blue, purple, magenta}`) | `background`←`editor.background`, `text`←`editor.foreground`, `selection`←`editor.selectionBackground`, `loader`←accent (`focusBorder`/`progressBar.background`), `red/yellow/green/blue/purple/magenta`←`terminal.ansi*`; **derive** `orange` (`editorWarning.foreground` or yellow↔red interp) + `backgroundSecondary` (`sideBar.background`); `appearance`←`type` | ⚠ **next-select / manual** — no silent file-drop; import via `open 'raycast://…'` deep link or **Switch Theme** command (may need 1 confirm). **Mac/Windows + Pro only** → ties to deferred two-machine work |

### Reload classes (for the hook layer)
- **Signal/IPC (instant):** ghostty `SIGUSR2`, btop `SIGUSR2`, nvim remote RPC, tmux `source-file`, herdr `reload-config`.
- **File-watch:** (none of ours currently; alacritty-style `touch` if added).
- **Post-write build step:** bat `bat cache --build` (also fixes delta).
- **Per-invocation (no-op reload):** delta, git-split-diffs, hunk, opencode, oyo.
- **⚠ Restart / next-launch only:** lazygit, yazi. Hook should respawn or accept next-launch.

---

## 6. Dark / light

- **Light is a SEPARATE canonical file**, not a computed inversion — 143 syntax scope
  colors need real authored choices; SoP ships an official light variant. So:
  `themes/<name>-dark.json` + `themes/<name>-light.json`. The switcher selects the file;
  it never invents colors. Drives off the VSCode `"type"` field.
- **Switch trigger differs per environment:**
  - **Desktop (macOS):** can auto-follow OS appearance (`defaults read -g
    AppleInterfaceStyle` → `Dark`/absent=Light). Optional: a watcher flips variant.
  - **Headless:** no OS appearance → **explicit `--variant` arg / manual** only.
  - Keep the switcher arg-driven; OS-follow is an optional desktop-only layer on top.
- Reuse omarchy's `light.mode` marker idea if a tool needs a boolean "is light" at
  consume time (e.g. yazi `theme.toml` already has separate `dark`/`light` flavor slots).

---

## 7. Cross-machine & build-time constraints

- **Portable across OSes.** The engine runs in whichever shell it's invoked in.
  Don't assume a package manager or init system (Homebrew/launchctl vs apt/systemd).
  Reload hooks must no-op gracefully when a tool isn't running on that machine.
- **Build-time-baked themes are out of scope.** Some tools compile a theme into their
  binary; those can't be live-switched. Name the ceiling rather than trying to
  regenerate compiled artifacts.
- **Config-only reloads.** The engine only writes config/theme files. Prefer a tool's
  config-reload hook over a full restart wherever one exists.
- **Optional cross-machine sync** is opt-in via `THEME_PEER` / `THEME_PEER_CMD` (§see
  README), so a switch on one machine can mirror to another.

---

## 8. Prior art (researched, full reports available)

| Project | What it is | License | Relation |
|---|---|---|---|
| **tinty** (tinted-theming) | base16/24 scheme manager, many-app switcher | GPL-3.0 | steal config/hook/state model (reimplement, don't copy) — §4.1 |
| **base16 / stylix / flavours** | palette-first universal theming | mixed | the "16-color wall" we avoid by going fat-source |
| **omarchy** | Arch/Hyprland distro w/ one-source→many-app theme engine + switcher | MIT | steal reload catalog + atomic-swap indirection — §4.4 |
| **code-theme-converter** | VSCode theme → Sublime/IntelliJ | MIT | steal `tmTheme.ts` converter — §4.2 |
| **shiki** | syntax highlighter, eats VSCode themes natively | MIT | passthrough target, no code — §4.3 |
| `ryrobes/omarchy-theme-generate`, `maxberggren/omarchy-theme-generator` | image→theme | — | proves image→palette→all-apps; possible future front-end |

**Verdict:** the idea holds; both halves (fat-source converters + many-app switcher)
exist separately but nobody combined them. We're building the missing fat-source
variant of a proven pattern — mostly glue, little from scratch.

---

## 9. v1 vertical slice (build this first)

Smallest thing that proves "any VSCode theme → all tools, live":

1. **Promote canonical:** merge the 3 existing full SoP JSONs → `theme/themes/shades-of-purple-dark.json`. (Step 0, §2.)
2. **Two adapters:**
   - `tmtheme.ts` (steal §4.2) — unlocks **bat + yazi tmtheme + oyo** at once.
   - `ghostty.ts` (§5 ANSI table) — proves the `terminal.ansi*` projection.
3. **`theme set <name>`** CLI (Bun+TS): load → run those 2 adapters → write to the
   real repo paths → reload (ghostty `SIGUSR2`, `bat cache --build`). State file + `init`.
4. **`targets.json`** registry seeded with bat, ghostty (+ yazi/oyo sharing tmtheme).
5. **Proof:** add `themes/github-dark.json` (real marketplace theme), run
   `theme set github-dark` → bat output + ghostty palette flip live. If that works,
   the remaining tools are just more `targets.json` rows of the same 3 families.

**Stack:** Bun + TS, ESM, strict. Deps: `plist`, `json5` only. No new framework.
Lives in `theme/`, "for agents and humans" CLI (`--format json` on `list`/`current`).
Non-trivial logic (the tmTheme converter, the ANSI projection) leaves one runnable
self-check behind (assert a known VSCode input → expected ghostty palette / tmTheme
global dict).

### Smoke-test discipline (global rule)
Wire each adapter's output into the user's live config, have the user verify visually
(open bat, reload ghostty), then clean up / commit. Don't claim "themed" without a
real visual confirm.

---

## 10. Decisions (resolved — build to these)

1. **Output: write in place, but pin each tool's SELECTOR to a stable slot.**
   Adapters write to each tool's theme path (§5). **Learning from v1:** writing the
   theme *file* is not enough — each tool also has a *selector* (bat `--theme`, ghostty
   `theme=`, btop `color_theme`, …) that must point at the generated theme, or the tool
   keeps rendering its old one. Rewriting the selector on every switch would dirty the
   repo each time (configs are symlinked in). So use a **stable slot**: the tool's config
   permanently selects a fixed name (bat `--theme="Dotfiles"`, ghostty `theme = dotfiles`),
   and the engine **overwrites that slot** each switch. One-time selector pin per tool
   (a `manual` setup step), zero churn thereafter. This is the *selector half* of
   omarchy's stable-include idea, without the full `current/theme/` atomic-swap dir.
2. **Flat-tool UI fields: a canonical projection map + per-tool override.** Define
   `project.ts` — a **canonical semantic role set** seeded from the existing oyo
   `defs`/semantic mapping (`.config/oyo/themes/shades-of-purple.json`): text, textMuted,
   primary, secondary, accent, border, borderActive, background, backgroundPanel,
   error/success/warning, diff*, plus the 16 ANSI. Each role has a **documented
   `colors{}` fallback chain** so any theme yields reasonable chrome. **Allow per-tool
   override:** a `targets.json` entry may remap specific roles → its fields when the
   canonical pick is wrong for that tool. Canonical by default, bespoke where needed.
   - **Missing `terminal.ansi*`:** prefer the theme's ANSI keys; if absent, **derive the
     16 slots from the syntax palette** (red/green/yellow/blue/magenta/cyan from nearest
     tokenColor scope colors; bg/fg from `editor.background`/`foreground`) and **print a
     warning** that terminal colors were inferred. Keeps "any theme works" true + honest.
3. **Light/dark: manual for now.** Switcher is `--variant dark|light` (arg-driven).
   No OS-follow watcher in v1; Mac auto-follow (`AppleInterfaceStyle`) is a later
   optional layer.
4. **Cross-machine: deferred.** Build single-machine first (run `theme set` on
   whichever box). Reload hooks should still no-op gracefully when a tool isn't
   running. Cross-machine sync (now `THEME_PEER`) is a later add-on, not a v1 concern.
5. **Per-tool generation mode: generate by default, opt out per tool** (`generated` /
   `manual` / `selector` — see §3 "Per-tool generation mode"). nvim = `selector`→plugin
   with generated fallback; herdr = `manual` (keep hand-tuned); cursor/vscode = `selector`
   (set `workbench.colorTheme`). Reload hook still runs for manual/selector targets.
6. **Scope: dotfiles-internal first, OSS-ready boundaries.** Build in `theme/` inside
   dotfiles for fast iteration, BUT keep the engine clean for later extraction: no
   dotfiles-specific paths hardcoded in `src/` — **all tool paths/hooks/modes live in
   `targets.json`** (the only machine-specific surface). The converters/projection/CLI
   stay generic. This is the genuine OSS gap (fat-source universal switcher); extracting
   to a standalone forkable repo later should be near-free if boundaries hold.
7. **Trigger UX: CLI only for v1.** `theme set <name>` / `theme list` / `theme current`
   in the shell. No tmux-palette entry or hotkey in v1 — wire a "Switch Theme" command
   into `.config/tmux-palette/commands.json` (fuzzy picker over installed themes) **after**
   the engine works. Prove the engine first.
