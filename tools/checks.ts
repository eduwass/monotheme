// File-tree/sidebar contrast checks for both targets, built from the SAME code
// each target actually uses at build time — not a reimplementation. VS Code
// reads theme.colors directly (see src/targets/vscode.ts: no transform), so its
// checks read theme.colors with the identical pick() fallback chain project.ts
// uses. Zed's checks read the real toZed() JSON output.
import type { VscodeTheme } from "../src/load.ts";
import { pick } from "../src/load.ts";
import { project } from "../src/project.ts";
import { toZed } from "../src/targets/zed.ts";
import type { ContrastCheck } from "../src/contrast.ts";

export function vscodeFileTreeChecks(theme: VscodeTheme): ContrastCheck[] {
  const c = theme.colors;
  const p = project(theme); // for fallbacks VS Code itself applies when a theme omits a key
  const sideBarBg = pick(c, ["sideBar.background"]) ?? p.bgPanel;
  const sideBarFg = pick(c, ["sideBar.foreground"]) ?? p.fg;
  const activeBg = pick(c, ["list.activeSelectionBackground"]) ?? p.selection;
  const activeFg = pick(c, ["list.activeSelectionForeground"]) ?? p.fg;
  const inactiveBg = pick(c, ["list.inactiveSelectionBackground"]) ?? p.selection;
  const inactiveFg = pick(c, ["list.inactiveSelectionForeground"]) ?? p.fg;
  const hoverBg = pick(c, ["list.hoverBackground"]) ?? p.selection;
  const modifiedFg = pick(c, ["gitDecoration.modifiedResourceForeground"]) ?? p.warning;
  const addedFg = pick(c, ["gitDecoration.addedResourceForeground"]) ?? p.success;
  const deletedFg = pick(c, ["gitDecoration.deletedResourceForeground"]) ?? p.error;
  return [
    { label: "sidebar text", fg: sideBarFg, bg: sideBarBg },
    { label: "active selection text", fg: activeFg, bg: activeBg },
    { label: "inactive selection text", fg: inactiveFg, bg: inactiveBg },
    { label: "row on hover", fg: sideBarFg, bg: hoverBg },
    { label: "git: modified label", fg: modifiedFg, bg: sideBarBg },
    { label: "git: added label", fg: addedFg, bg: sideBarBg },
    { label: "git: deleted label", fg: deletedFg, bg: sideBarBg },
  ];
}

export function zedFileTreeChecks(theme: VscodeTheme): ContrastCheck[] {
  const style = JSON.parse(toZed(theme)).themes[0].style as Record<string, any>;
  const panelBg: string = style["panel.background"];
  const fg: string = style.text;
  const fgMuted: string = style["text.muted"];
  const selectedBg: string = style["element.selected"];
  const hoverBg: string = style["element.hover"];
  const created: string = style.created;
  const modified: string = style.modified;
  const deleted: string = style.deleted;
  return [
    { label: "sidebar text", fg, bg: panelBg },
    { label: "sidebar muted text (path/dim)", fg: fgMuted, bg: panelBg },
    { label: "selected row text", fg, bg: selectedBg },
    { label: "row on hover", fg, bg: hoverBg },
    { label: "git: modified label", fg: modified, bg: panelBg },
    { label: "git: added label", fg: created, bg: panelBg },
    { label: "git: deleted label", fg: deleted, bg: panelBg },
  ];
}

// The branch-picker pill (title_bar.rs render_worktree_and_branch, ButtonStyle::
// Tinted(TintColor::Accent)) — draws `text` on `info.background`, bordered by
// `info.border`. Distinct from the file-tree/picker checks above.
export function zedTintedButtonChecks(theme: VscodeTheme): ContrastCheck[] {
  const style = JSON.parse(toZed(theme)).themes[0].style as Record<string, any>;
  return [
    { label: "branch pill text", fg: style.text, bg: style["info.background"] },
    { label: "branch pill border vs bg", fg: style["info.border"], bg: style["info.background"] },
  ];
}

// Zed's picker/overlay surface (command palette, worktree picker, quick-open) —
// crates/git_ui/src/worktree_picker.rs styles rows with generic Color::Accent /
// Color::Muted on elevated_surface.background, matching the theme keys below.
export function zedPickerChecks(theme: VscodeTheme): ContrastCheck[] {
  const style = JSON.parse(toZed(theme)).themes[0].style as Record<string, any>;
  const bg: string = style["elevated_surface.background"];
  const fg: string = style.text;
  const fgMuted: string = style["text.muted"];
  const accent: string = style["text.accent"];
  const selectedBg: string = style["element.selected"];
  const hoverBg: string = style["element.hover"];
  const border: string = style.border;
  return [
    { label: "picker text", fg, bg },
    { label: "picker muted text", fg: fgMuted, bg },
    { label: "picker accent (current item icon)", fg: accent, bg },
    { label: "picker selected row text", fg, bg: selectedBg },
    { label: "picker row on hover", fg, bg: hoverBg },
    { label: "picker border vs surface", fg: border, bg },
  ];
}

// VS Code's closest equivalent: the Quick Open / Command Palette overlay.
export function vscodePickerChecks(theme: VscodeTheme): ContrastCheck[] {
  const c = theme.colors;
  const p = project(theme);
  const bg = pick(c, ["quickInput.background", "editorWidget.background"]) ?? p.bgPanel;
  const fg = pick(c, ["quickInput.foreground", "editorWidget.foreground"]) ?? p.fg;
  const fgMuted = pick(c, ["descriptionForeground"]) ?? p.fgMuted;
  const accent = pick(c, ["pickerGroup.foreground", "textLink.foreground"]) ?? p.accent;
  const selectedBg = pick(c, ["quickInputList.focusBackground", "list.activeSelectionBackground"]) ?? p.selection;
  const selectedFg = pick(c, ["quickInputList.focusForeground", "list.activeSelectionForeground"]) ?? fg;
  const hoverBg = pick(c, ["list.hoverBackground"]) ?? p.selection;
  const border = pick(c, ["widget.border", "editorWidget.border"]) ?? p.border;
  return [
    { label: "picker text", fg, bg },
    { label: "picker muted text", fg: fgMuted, bg },
    { label: "picker accent (current item icon)", fg: accent, bg },
    { label: "picker selected row text", fg: selectedFg, bg: selectedBg },
    { label: "picker row on hover", fg, bg: hoverBg },
    { label: "picker border vs surface", fg: border, bg },
  ];
}
