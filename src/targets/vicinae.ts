import { defineTarget } from "../target-kit.ts";
import { flattenAlpha, pick, type VscodeTheme } from "../load.ts";
import { project } from "../project.ts";

/** Native Vicinae TOML; use VS Code's separate text and list selections. */
export function toVicinae(theme: VscodeTheme): string {
  const p = project(theme);
  const c = theme.colors;
  const variant = theme.type === "light" ? "light" : "dark";
  const selection = flattenAlpha(c["editor.selectionBackground"] ?? p.selection, p.bg);
  const listSelection = flattenAlpha(c["list.activeSelectionBackground"] ?? p.listSelected, p.bg);
  const selectedFg = pick(c, ["list.activeSelectionForeground"]) ?? p.fg;
  return `[meta]
version = 1
name = "Monotheme"
description = ${JSON.stringify(`Generated from ${theme.name || "editor theme"}`)}
variant = "${variant}"
inherits = "vicinae-${variant}"

[colors.core]
background = "${p.bg}"
foreground = "${p.fg}"
secondary_background = "${p.bgPanel}"
border = "${p.border}"
accent = "${p.accent}"
accent_foreground = "${pick(c, ["button.foreground"]) ?? p.bg}"

[colors.accents]
red = "${p.ansi[1]}"
green = "${p.ansi[2]}"
yellow = "${p.ansi[3]}"
blue = "${p.ansi[4]}"
magenta = "${p.ansi[5]}"
cyan = "${p.ansi[6]}"
purple = "${p.ansi[5]}"
orange = "${p.warning}"

[colors.text]
default = "${p.fg}"
muted = "${p.fgMuted}"
placeholder = "${p.fgMuted}"
danger = "${p.error}"
success = "${p.success}"
selection = { background = "${selection}", foreground = "${pick(c, ["editor.selectionForeground"]) ?? p.fg}" }

[colors.text.links]
default = "${pick(c, ["textLink.foreground"]) ?? p.ansi[4]}"
visited = "${p.ansi[5]}"

[colors.input]
border = "${p.border}"
border_focus = "${p.accent}"
border_error = "${p.error}"

[colors.button.primary]
background = "${p.accent}"
foreground = "${pick(c, ["button.foreground"]) ?? p.bg}"
hover = { background = "${pick(c, ["button.hoverBackground"]) ?? p.accent}" }

[colors.list.item.selection]
background = "${listSelection}"
foreground = "${selectedFg}"
secondary_background = "${listSelection}"
secondary_foreground = "${selectedFg}"

[colors.grid.item]
background = "${p.bgPanel}"
hover = { outline = "${p.accent}" }
selection = { outline = "${p.accent}" }

[colors.scrollbars]
background = "${p.border}"

[colors.loading]
bar = "${p.accent}"
spinner = "${p.fg}"
`;
}

export default defineTarget({
  name: "vicinae",
  detect: (c) => c.has(c.config("vicinae")) || c.hasCmd("vicinae") || (c.mac && c.has("/Applications/Vicinae.app")),
  file: (c) => c.data("vicinae", "themes", `${c.slot}.toml`),
  render: (c) => toVicinae(c.theme),
  // DMG installs don't put the CLI on PATH; use the bundled executable on macOS.
  reload: (c) => `${c.mac && c.has("/Applications/Vicinae.app") ? '"/Applications/Vicinae.app/Contents/MacOS/vicinae-cli"' : "vicinae"} theme set ${c.slot}`,
});
