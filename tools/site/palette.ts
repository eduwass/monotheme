// One theme → every CSS custom property the browser preview needs. Nothing here
// invents a colour: the herdr block comes from the real herdr adapter, the
// sketchybar pills follow the same tiering as the real bar config, the editor
// chrome reads the VS Code keys the editor itself reads (falling back to the
// projection exactly like the zed adapter does).
import { project, type Projection } from "../../src/project.ts";
import { contrastRatio } from "../../src/contrast.ts";
import { flattenAlpha, mix, type VscodeTheme } from "../../src/load.ts";
import { toHerdrTheme } from "../../src/targets/herdr.ts";

export type Vars = Record<string, string>;

/** The `[theme.custom]` block herdr actually receives, as key → #rrggbb. */
export function herdrPalette(theme: VscodeTheme): Vars {
  const out: Vars = {};
  for (const [, k, v] of toHerdrTheme(theme).matchAll(/^\s*(\w+)\s*=\s*"(#[0-9a-fA-F]{6})"/gm)) out[k!] = v!.toLowerCase();
  return out;
}

/** herdr.dev's mock is themed through --term-* variables; feed it the herdr palette. */
export function herdrVars(h: Vars): Vars {
  return {
    "--term-bg": h.panel_bg!, "--term-sidebar-bg": h.surface_dim!, "--term-active-bg": h.active_row_bg!,
    "--term-tab-bg": h.surface0!, "--term-border": h.surface1!, "--term-text": h.text!,
    "--term-muted": h.overlay1!, "--term-dim": h.overlay0!,
    "--term-tab-active-bg": h.accent!, "--term-tab-active-text": h.panel_bg!,
    "--term-prompt": h.accent!, "--term-blue": h.blue!, "--term-cmd": h.green!, "--term-str": h.yellow!,
    "--term-green-bright": h.green!, "--term-accent": h.accent!,
    "--term-red": h.red!, "--term-yellow": h.yellow!, "--term-green": h.green!,
  };
}

/** Sketchybar pill tiers — same choice the real bar makes on a solo display. */
export function pillVars(h: Vars): Vars {
  return {
    "--pill-focused-bg": h.accent!, "--pill-focused-ink": h.panel_bg!,
    "--pill-active-bg": h.surface1!, "--pill-active-ink": h.text!,
    "--pill-filled-bg": h.surface0!, "--pill-filled-ink": h.overlay1!,
    "--pill-empty-bg": h.surface_dim!, "--pill-empty-ink": h.overlay0!,
    "--pill-ok": h.green!, "--pill-down": h.red!,
  };
}

export type Flavor = "vscode" | "zed";

/** Editor chrome. VS Code: the workbench keys themselves. Zed: the projection, as targets/zed.ts writes it. */
export function editorVars(theme: VscodeTheme, p: Projection, flavor: Flavor): Vars {
  const c = (key: string, fb: string) => { const v = theme.colors[key]; return v ? flattenAlpha(v, p.bg) : fb; };
  if (flavor === "zed") {
    return {
      "--ed-title-bg": p.bgPanel, "--ed-title-fg": p.fgMuted,
      "--ed-activity-bg": p.bgPanel, "--ed-activity-fg": p.fg, "--ed-activity-dim": p.fgMuted, "--ed-badge": p.accent,
      "--ed-side-bg": p.bgPanel, "--ed-side-fg": p.fgMuted, "--ed-side-sel": p.listSelected,
      "--ed-tabs-bg": p.bgPanel, "--ed-tab-bg": p.bg, "--ed-tab-fg": p.fg, "--ed-tab-inactive-bg": p.bgPanel, "--ed-tab-inactive-fg": p.fgMuted, "--ed-tab-border": p.accent,
      "--ed-bg": p.bg, "--ed-fg": p.fg, "--ed-ln": p.fgMuted, "--ed-ln-active": p.accent, "--ed-line-hl": p.bgPanel,
      "--ed-status-bg": p.bgPanel, "--ed-status-fg": p.fgMuted, "--ed-border": p.border,
    };
  }
  return {
    "--ed-title-bg": c("titleBar.activeBackground", p.bgPanel), "--ed-title-fg": c("titleBar.activeForeground", p.fgMuted),
    "--ed-activity-bg": c("activityBar.background", p.bgPanel), "--ed-activity-fg": c("activityBar.foreground", p.fg),
    "--ed-activity-dim": c("activityBar.inactiveForeground", p.fgMuted), "--ed-badge": c("activityBarBadge.background", p.accent),
    "--ed-side-bg": c("sideBar.background", p.bgPanel), "--ed-side-fg": c("sideBar.foreground", p.fgMuted), "--ed-side-sel": c("list.activeSelectionBackground", p.listSelected),
    "--ed-tabs-bg": c("editorGroupHeader.tabsBackground", p.bgPanel), "--ed-tab-bg": c("tab.activeBackground", p.bg), "--ed-tab-fg": c("tab.activeForeground", p.fg),
    "--ed-tab-inactive-bg": c("tab.inactiveBackground", p.bgPanel), "--ed-tab-inactive-fg": c("tab.inactiveForeground", p.fgMuted), "--ed-tab-border": c("tab.activeBorderTop", c("tab.activeBorder", p.accent)),
    "--ed-bg": c("editor.background", p.bg), "--ed-fg": c("editor.foreground", p.fg),
    "--ed-ln": c("editorLineNumber.foreground", p.fgMuted), "--ed-ln-active": c("editorLineNumber.activeForeground", p.fg), "--ed-line-hl": c("editor.lineHighlightBackground", p.bgPanel),
    "--ed-status-bg": c("statusBar.background", p.bgPanel), "--ed-status-fg": c("statusBar.foreground", p.fgMuted), "--ed-border": c("editorGroup.border", p.border),
  };
}

/** The tweakable roles: each names the VS Code key that WINS its pick chain in
 *  project(), so writing that key into theme.colors overrides the role for the
 *  whole pipeline (editor, herdr block, pills, ring). Tested in test/site.test.ts
 *  so this table can't drift from project() silently. */
export interface RoleSpec { role: string; key: string; get: (p: Projection) => string; note: string }
export const ROLE_SPECS: RoleSpec[] = [
  { role: "background",  key: "editor.background",                        get: (p) => p.bg,          note: "editor · herdr panel_bg · terminal bg" },
  { role: "panel",       key: "sideBar.background",                       get: (p) => p.bgPanel,     note: "sidebars · tab strips · status bars · herdr surface_dim" },
  { role: "foreground",  key: "editor.foreground",                        get: (p) => p.fg,          note: "text everywhere · herdr text · surface ladder" },
  { role: "muted",       key: "descriptionForeground",                    get: (p) => p.fgMuted,     note: "line numbers · inactive tabs · secondary text" },
  { role: "accent",      key: "button.background",                        get: (p) => p.accent,      note: "window ring · focused pill · active tab · herdr accent" },
  { role: "border",      key: "editorGroup.border",                       get: (p) => p.border,      note: "pane splits · widget borders" },
  { role: "selection",   key: "editor.selectionBackground",               get: (p) => p.selection,   note: "text selection wash" },
  { role: "list select", key: "list.activeSelectionBackground",           get: (p) => p.listSelected, note: "file-tree selected row" },
  { role: "cursor",      key: "editorCursor.foreground",                  get: (p) => p.cursor,      note: "caret" },
  { role: "success",     key: "editorGutter.addedBackground",             get: (p) => p.success,     note: "git added · agent done dot" },
  { role: "error",       key: "editorError.foreground",                   get: (p) => p.error,       note: "errors · git deleted · blocked dot" },
  { role: "warning",     key: "editorWarning.foreground",                 get: (p) => p.warning,     note: "warnings · working dot" },
];
export const ANSI_NAMES = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
  "bright black", "bright red", "bright green", "bright yellow", "bright blue", "bright magenta", "bright cyan", "bright white"];

/** The portable theme JSON — same shape the CLI vendors and `theme set <file>` accepts. */
export function canonicalTheme(theme: VscodeTheme): string {
  return JSON.stringify({ name: theme.name, type: theme.type, colors: theme.colors, tokenColors: theme.tokenColors }, null, 2) + "\n";
}

export interface Desktop { p: Projection; herdr: Vars; vars: Vars }

/** Everything the desktop mock needs for one theme, as CSS custom properties. */
export function desktopVars(theme: VscodeTheme, flavor: Flavor = "vscode"): Desktop {
  const p = project(theme);
  const h = herdrPalette(theme);
  const vars: Vars = {
    ...herdrVars(h), ...pillVars(h), ...editorVars(theme, p, flavor),
    "--accent": p.accent, "--red": p.error, "--yellow": p.warning, "--green": p.success, "--muted": h.overlay0!,
    "--wall-a": mix(p.bg, p.accent, 0.28), "--wall-b": mix(p.bg, theme.type === "light" ? "#ffffff" : "#000000", 0.35),
    "--win-shadow": theme.type === "light" ? "rgba(0,0,0,.25)" : "rgba(0,0,0,.55)",
  };
  return { p, herdr: h, vars };
}

/** Re-skin the page shell itself with the selected theme — same tokens the
 *  landing page uses, derived from the projection. Ink on accent is picked by
 *  contrast so chips/buttons stay readable on light or dark accents. */
export function shellVars(p: Projection): Vars {
  const ink = contrastRatio("#111111", p.accent) >= contrastRatio("#ffffff", p.accent) ? "#111111" : "#ffffff";
  return {
    "--bg": p.bg, "--bg2": p.bgPanel, "--panel": mix(p.bg, p.fg, 0.06), "--line": mix(p.bg, p.fg, 0.14),
    "--fg": p.fg, "--muted": p.fgMuted, "--theme-accent": p.accent, "--accent": p.accent, "--accent-ink": ink,
  };
}

const HEX = /^#[0-9a-f]{6}$/i;
/** Every var must be a solid hex (the mock paints with them directly). */
export function invalidVars(vars: Vars): string[] {
  return Object.entries(vars).filter(([k, v]) => !k.startsWith("--wall") && k !== "--win-shadow" && !HEX.test(v)).map(([k, v]) => `${k}=${v}`);
}

export function invalidShellVars(vars: Vars): string[] {
  return Object.entries(vars).filter(([, v]) => !HEX.test(v)).map(([k, v]) => `${k}=${v}`);
}
