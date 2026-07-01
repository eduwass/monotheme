// Projection map: a VSCode theme -> the small role set flat tools need
// (16 ANSI + semantic chrome roles). Roles seeded from the user's oyo mapping.
// Per spec: prefer the theme's terminal.ansi* keys; if absent, derive from the
// syntax palette and warn.
import type { VscodeTheme, TokenColor } from "./load.ts";
import { pick, stripAlpha } from "./load.ts";
import { buildMatcher, FontStyleFlags } from "./tm-match.ts";

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
export function scopeColor(tokens: TokenColor[], scope: string): string | undefined {
  for (const t of tokens) {
    const scopes = Array.isArray(t.scope) ? t.scope : t.scope ? [t.scope] : [];
    if (scopes.some((s) => s.split(",").map((x) => x.trim()).includes(scope))) {
      if (t.settings?.foreground) return stripAlpha(t.settings.foreground);
    }
  }
  return undefined;
}

export interface TokenStyle {
  fg?: string;
  italic?: boolean;
  bold?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
}

/**
 * Resolve a TextMate scope (or full outer→inner scope stack) to the color + font
 * style the theme gives it — byte-identical to shiki/VSCode, via a faithful port
 * of vscode-textmate's Theme matcher (see ./tm-match.ts). A bare scope string is
 * treated as a 1-deep stack. Returns undefined when no rule sets a foreground
 * (caller falls back to its own default).
 */
export function resolveToken(tokens: TokenColor[], scope: string | string[]): TokenStyle | undefined {
  const stack = Array.isArray(scope) ? scope : [scope];
  const { fg, fontStyle } = buildMatcher(tokens).match(stack);
  if (fg === null) return undefined;
  const F = FontStyleFlags;
  return {
    fg,
    italic: (fontStyle & F.Italic) !== 0,
    bold: (fontStyle & F.Bold) !== 0,
    underline: (fontStyle & F.Underline) !== 0,
    strikethrough: (fontStyle & F.Strikethrough) !== 0,
  };
}

export function project(theme: VscodeTheme): Projection {
  const c = theme.colors;
  const t = theme.tokenColors;
  const warnings: string[] = [];

  // Fall back on the theme's declared type, not always dark: some themes (e.g. the
  // built-in "Light+" / "Light High Contrast") omit editor.background and rely on
  // VS Code's programmatic default, so a hardcoded black bg renders a light theme dark.
  const light = theme.type === "light";
  const bg = pick(c, ["editor.background", "terminal.background"]) ?? (light ? "#ffffff" : "#000000");
  const fg = pick(c, ["editor.foreground", "terminal.foreground", "foreground"]) ?? (light ? "#1f2328" : "#ffffff");

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

  // The theme's primary brand/highlight color. button.background &
  // activityBarBadge.background carry it reliably; focusBorder is a last resort
  // (it's a dark border in some themes, e.g. Shades of Purple).
  const accent = pick(c, [
    "button.background", "activityBarBadge.background", "badge.background",
    "progressBar.background", "textLink.activeForeground", "focusBorder",
  ]) ?? ansi[3]!;
  // A subtle chrome border — avoid panel.border (often the accent color).
  const border = pick(c, ["editorGroup.border", "sideBar.border", "editorWidget.border", "input.border"]) ?? ansi[8]!;

  return {
    bg,
    bgPanel: pick(c, ["sideBar.background", "editorWidget.background", "panel.background", "editorGroupHeader.tabsBackground"]) ?? bg,
    fg,
    fgMuted: pick(c, ["descriptionForeground", "editorLineNumber.foreground", "tab.inactiveForeground"]) ?? fg,
    accent,
    border,
    borderActive: pick(c, ["tab.activeBorder", "focusBorder"]) ?? accent,
    selection: pick(c, ["editor.selectionBackground", "terminal.selectionBackground"]) ?? ansi[8]!,
    cursor: pick(c, ["editorCursor.foreground", "terminalCursor.foreground", "editor.foreground"]) ?? fg,
    success: pick(c, ["editorGutter.addedBackground", "gitDecoration.addedResourceForeground"]) ?? ansi[2]!,
    error: pick(c, ["editorError.foreground", "errorForeground", "gitDecoration.deletedResourceForeground"]) ?? ansi[1]!,
    warning: pick(c, ["editorWarning.foreground", "list.warningForeground"]) ?? ansi[3]!,
    ansi,
    warnings,
  };
}
