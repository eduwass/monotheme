<p align="center">
  <img src="assets/monotheme-logo.png?v=2" alt="monotheme" width="40%">
</p>

https://github.com/user-attachments/assets/7d154016-a72d-4e58-b390-9d886b22e64c

> got tired of hand-porting my theme to every single tool, so i made little theme engine - [tweet](https://x.com/eduwass/status/2069421542027502066)

# monotheme

> [!WARNING]
> **Alpha.** monotheme is early and evolving — APIs, adapters and theme output may
> change without notice. Expect rough edges; issues and PRs welcome.

One source of truth — a **standard editor theme** (the `colors` + `tokenColors`
JSON that VSCode, Cursor, Zed and [shiki](https://shiki.style) all read) —
projected into every tool's native format, switched with a single command that
live-reloads running apps.

Drop in any such theme (Shades of Purple, GitHub, Catppuccin, Tokyo Night, …) and
your whole terminal/editor/OS follows. No per-tool hand-porting.

> The `tokenColors` half is plain TextMate scopes (same model as a `.tmTheme`); the
> `colors` half adds the UI + `terminal.ansi*` keys a `.tmTheme` lacks — which is
> exactly what lets one file drive your terminal, btop and tmux as well as syntax.

```sh
theme set shades-of-purple
```

That one command reskins your terminal, multiplexer, editors, git UI, file
manager, system accent — live, no restarts.

## Why

Most theming tools use a **small palette** (16–24 colors) as the source of truth.
Great for terminals, lossy for syntax highlighting — a theme's ~140 TextMate
scopes collapse into ~16 buckets and everything subtly loses its identity.

monotheme keeps the **fat format** (the full VSCode theme) as canonical, and:

- **projects down** to 16-color ANSI for dumb tools (terminals, btop, fzf, …)
- **passes through** at full fidelity for smart ones (bat, editors, anything that
  reads a TextMate/shiki theme)

You can always collapse rich → simple, never the reverse. The syntax projection is
a faithful port of the vscode-textmate theme matcher, verified token-for-token
against [shiki](https://shiki.style) (the highlighter Cursor/VSCode use) so colors
match what you'd see in the editor.

## Supported tools

| Surface | Tools |
| --- | --- |
| Terminals | ghostty, any 16-ANSI terminal |
| Multiplexers / TUI | tmux, btop, fzf, yazi, lazygit |
| Editors | VSCode, Cursor, Zed, Neovim (chrome + TextMate syntax) |
| Agents / dev | opencode, Claude Code, hunk |
| Syntax export | `.tmTheme` (bat/Sublime), shiki JSON, base16 |
| macOS / extras | system accent color, Raycast, herdr |

Each target detects whether the tool is present and no-ops if not, so you only
theme what you have.

## Install

Requires [Bun](https://bun.sh).

```sh
git clone https://github.com/eduwass/monotheme
cd monotheme
bun install
bun link          # exposes the `theme` command on your PATH
theme list
```

`bun link` registers the `theme` (and `monotheme`) command into Bun's global bin
dir. Prefer not to link? Run it directly: `bun src/cli.ts list`. See
[`docs/INSTALL.md`](docs/INSTALL.md) for per-tool wiring and `theme init`.

## Usage

```sh
theme list                 # installed + bundled themes
theme set <name>           # project a theme to every tool + live-reload
theme current              # the active theme
theme init                 # re-apply the active theme (run from your shell rc)
theme sync                 # vendor every installed editor theme into the config home
theme browse "<query>"     # search the VS Code Marketplace for themes
theme add <publisher.ext>  # download + vendor a Marketplace theme extension
theme preview [<name>]     # render a code-sample preview card (SVG) for a theme
theme raycast              # open the active theme as a Raycast import (macOS)
theme check                # self-check, no writes
```

### System light/dark switching (macOS)

Pick a theme for each appearance, and monotheme follows the OS — whether you
toggle it by hand or the schedule flips it at sunset:

```sh
theme pair set github-light tokyo-night   # light theme, dark theme
theme watch install                       # launchd agent: switches within ~2s of the flip
theme auto                                # one-shot: apply whichever half matches right now
theme watch status|uninstall              # inspect / remove the agent
```

Themes resolve from bundled defaults, your **installed editor extensions** (it
discovers Cursor/VSCode themes on disk — including each editor's *built-in* themes
like Dark Modern / Monokai), and `~/.config/monotheme/themes/` (vendored + custom).
`theme browse` / `theme add` pull any theme from the VS Code Marketplace on demand.

All runtime state lives in `~/.config/monotheme/` (active theme, vendored themes,
`fonts.json`) — decoupled from the clone.

## Fonts

An orthogonal **font axis**, opt-in via `~/.config/monotheme/fonts.json`. Set one
font *everywhere*, or override per surface (editor / terminal / ui). `mono` is the
inherited base.

```sh
theme font set "<font>" [size]         # set the font everywhere (the mono base)
theme font set editor "<font>" [size]  # override one surface: editor|terminal|ui
theme font show                        # current resolved fonts
theme font catalog [--nerd]            # ~200 curated programming fonts (Nerd-Font-aware)
theme font install <id>                # install a font (Homebrew cask, or nerd-fonts .tar.xz)
```

The catalog reuses the open-source **programmingfonts** + **nerd-fonts** databases,
so `<font>` can be a catalog id (`jetbrains-mono`) or a family name. The Nerd Font
variant is preferred automatically when installed — install it for terminal/editor
so prompts and file-explorer glyphs render.

Font targets: ghostty, kitty, alacritty (terminal); VSCode, Cursor, Zed, Sublime
(editor/ui). TUIs inherit the terminal font. **ghostty** needs a one-time include —
add `config-file = monotheme-fonts` to `~/.config/ghostty/config`, *after* any
existing `font-family` line (ghostty's `font-family` is additive, so the include
must come later to win).

## Cross-machine sync (optional)

Set `THEME_PEER=<ssh-host>` and every `theme set` mirrors the switch to that
machine, so all tools on both stay on the same theme. For non-SSH transports, set
`THEME_PEER_CMD='mytool run {}'` ( `{}` is replaced with the remote command).

## How it works

`load` parses the VSCode theme → `project` derives a normalized palette (bg, fg,
ANSI 16, accents, …) and `resolveToken` resolves any TextMate scope to its color
via the ported matcher → each **adapter** renders that into one tool's format →
**targets** write the file to the right place and reload the running app.

## Adding a tool

Adapters are small and self-contained — one file per tool. Two places to put one:

- **`src/targets/`** (in the repo) — for tools worth shipping to everyone. PRs welcome.
- **`~/.config/monotheme/targets/`** (your config dir) — personal adapters, no repo
  checkout needed. Export a plain object; same-name overrides a built-in; a broken
  file warns and is skipped. Perfect for sketchybar, waybar, a personal dashboard, …

See [`docs/ADAPTERS.md`](docs/ADAPTERS.md) for the contract and a step-by-step
walkthrough. If you theme a tool, others get it for free.

## License

MIT — see [`LICENSE`](LICENSE).
