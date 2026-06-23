// VSCode theme -> a tmux-palette user theme (~/.config/tmux-palette/themes/*.json).
// tmux-palette's Theme is a small 6-color set: bg/panel/selected/fg/muted/accent.
// We project into a stable "dotfiles" slot and point theme.json at it, so a switch
// overwrites the slot rather than churning the palette config.
// https://github.com/eduwass/tmux-palette — src/types.ts `Theme`.
import type { VscodeTheme } from "../load.ts";
import { project } from "../project.ts";

export interface TmuxPaletteTheme {
  bg: string;
  panel: string;
  selected: string;
  fg: string;
  muted: string;
  accent: string;
}

export function toTmuxPalette(theme: VscodeTheme): TmuxPaletteTheme {
  const p = project(theme);
  return {
    bg: p.bg,
    panel: p.bgPanel,
    selected: p.selection,
    fg: p.fg,
    muted: p.fgMuted,
    accent: p.accent,
  };
}
