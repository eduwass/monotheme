// Projection map: a VSCode theme -> the small role set flat tools need
// (16 ANSI + semantic chrome roles). Roles seeded from the user's oyo mapping.
// Per spec: prefer the theme's terminal.ansi* keys; if absent, derive from the
// syntax palette and warn.
import type { VscodeTheme, TokenColor } from "./load.ts";
import { pick, stripAlpha } from "./load.ts";

export interface Projection {
  bg: string;
  bgPanel: string;
  fg: string;
  fgMuted: string;
  accent: string;
  border: string;
  borderActive: string;
  selection: string;
  cursor: string;
  success: string;
  error: string;
  warning: string;
  /** ANSI 0..15 */
  ansi: string[];
  /** non-fatal notes (e.g. "terminal colors were inferred") */
  warnings: string[];
}

export const ANSI_KEYS = [
  "terminal.ansiBlack", "terminal.ansiRed", "terminal.ansiGreen", "terminal.ansiYellow",
  "terminal.ansiBlue", "terminal.ansiMagenta", "terminal.ansiCyan", "terminal.ansiWhite",
  "terminal.ansiBrightBlack", "terminal.ansiBrightRed", "terminal.ansiBrightGreen",
  "terminal.ansiBrightYellow", "terminal.ansiBrightBlue", "terminal.ansiBrightMagenta",
  "terminal.ansiBrightCyan", "terminal.ansiBrightWhite",
];

/** Find the foreground a scope resolves to (first matching tokenColor rule). */
function scopeColor(tokens: TokenColor[], scope: string): string | undefined {
  for (const t of tokens) {
    const scopes = Array.isArray(t.scope) ? t.scope : t.scope ? [t.scope] : [];
    if (scopes.some((s) => s.split(",").map((x) => x.trim()).includes(scope))) {
      if (t.settings?.foreground) return stripAlpha(t.settings.foreground);
    }
  }
  return undefined;
}

export function project(theme: VscodeTheme): Projection {
  const c = theme.colors;
  const t = theme.tokenColors;
  const warnings: string[] = [];

  const bg = pick(c, ["editor.background", "terminal.background"]) ?? "#000000";
  const fg = pick(c, ["editor.foreground", "terminal.foreground", "foreground"]) ?? "#ffffff";

  // ANSI: prefer authored terminal.ansi*, else derive from syntax palette + warn.
  let ansi: string[];
  if (ANSI_KEYS.every((k) => c[k])) {
    ansi = ANSI_KEYS.map((k) => stripAlpha(c[k]!));
  } else {
    warnings.push("terminal colors not defined by theme — inferred from syntax palette");
    const hue = (scope: string, fb: string) => scopeColor(t, scope) ?? fb;
    const red = hue("keyword.operator", pick(c, ["editorError.foreground"]) ?? "#e06c75");
    const green = hue("string", pick(c, ["gitDecoration.addedResourceForeground"]) ?? "#98c379");
    const yellow = hue("entity.name.function", pick(c, ["editorWarning.foreground"]) ?? "#e5c07b");
    const blue = hue("entity.name.tag", pick(c, ["textLink.foreground"]) ?? "#61afef");
    const magenta = hue("keyword", pick(c, ["editorBracketHighlight.foreground3"]) ?? "#c678dd");
    const cyan = hue("support.type", pick(c, ["editorInfo.foreground"]) ?? "#56b6c2");
    const blk = pick(c, ["terminal.ansiBlack"]) ?? bg;
    const wht = pick(c, ["terminal.ansiWhite"]) ?? fg;
    ansi = [blk, red, green, yellow, blue, magenta, cyan, wht,
            blk, red, green, yellow, blue, magenta, cyan, wht];
  }

  return {
    bg,
    bgPanel: pick(c, ["editorGroupHeader.tabsBackground", "sideBar.background", "editorWidget.background"]) ?? bg,
    fg,
    fgMuted: pick(c, ["descriptionForeground", "editorLineNumber.foreground", "tab.inactiveForeground"]) ?? fg,
    accent: pick(c, ["focusBorder", "progressBar.background", "button.background", "textLink.foreground"]) ?? ansi[3]!,
    border: pick(c, ["editorGroup.border", "panel.border", "widget.border"]) ?? ansi[8]!,
    borderActive: pick(c, ["focusBorder", "tab.activeBorderTop", "progressBar.background"]) ?? ansi[3]!,
    selection: pick(c, ["editor.selectionBackground", "terminal.selectionBackground"]) ?? ansi[8]!,
    cursor: pick(c, ["editorCursor.foreground", "terminalCursor.foreground", "editor.foreground"]) ?? fg,
    success: pick(c, ["editorGutter.addedBackground", "gitDecoration.addedResourceForeground"]) ?? ansi[2]!,
    error: pick(c, ["editorError.foreground", "errorForeground", "gitDecoration.deletedResourceForeground"]) ?? ansi[1]!,
    warning: pick(c, ["editorWarning.foreground", "list.warningForeground"]) ?? ansi[3]!,
    ansi,
    warnings,
  };
}
