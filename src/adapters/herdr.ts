// VSCode theme -> herdr [theme.custom] block (Catppuccin-style palette).
// https://herdr.dev/docs/preview/configuration/#theme
import type { VscodeTheme } from "../load.ts";
import { project } from "../project.ts";

export function toHerdrTheme(theme: VscodeTheme): string {
  const p = project(theme);
  const a = p.ansi;
  return `[theme.custom]
base        = "${p.bg}"
panel_bg    = "${p.bgPanel}"
surface_dim = "${p.bg}"
surface0    = "${p.bgPanel}"
surface1    = "${p.border}"
overlay0    = "${p.border}"
overlay1    = "${p.fgMuted}"
subtext0    = "${p.fgMuted}"
text        = "${p.fgMuted}"
accent      = "${p.accent}"
mauve       = "${a[5]}"
blue        = "${a[4]}"
green       = "${a[2]}"
yellow      = "${a[3]}"
peach       = "${p.warning}"
red         = "${p.error}"
`;
}
