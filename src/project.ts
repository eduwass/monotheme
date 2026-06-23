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

// A theme rule selector matches a target scope when it's equal or a dot-prefix
// (TextMate descendant rule on dot boundaries). For selectors with spaces
// (descendant selectors like "meta.x entity.y") the rightmost component is the
// element being styled, so match against that.
function selectorScore(selector: string, target: string): number {
  const key = selector.trim().split(/\s+/).pop()!;
  if (!key) return -1;
  if (target === key || target.startsWith(key + ".")) return key.split(".").length;
  return -1;
}

/**
 * Resolve a TextMate scope to the color + font style the theme gives it, the
 * same way shiki/VSCode do: among all matching tokenColor rules, the most
 * specific selector wins; ties break toward the later (overriding) rule.
 */
export function resolveToken(tokens: TokenColor[], scope: string): TokenStyle | undefined {
  // foreground and fontStyle resolve independently (TextMate): a later
  // fontStyle-only rule adds italic without clobbering an earlier color.
  let fgTok: TokenColor | undefined, fgScore = 0;
  let fsTok: TokenColor | undefined, fsScore = 0, matched = false;
  tokens.forEach((t) => {
    const scopes = Array.isArray(t.scope) ? t.scope : t.scope ? [t.scope] : [];
    let score = 0;
    for (const group of scopes) {
      for (const sel of group.split(",")) score = Math.max(score, selectorScore(sel, scope));
    }
    if (score === 0) return;
    matched = true;
    if (t.settings?.foreground && score >= fgScore) { fgScore = score; fgTok = t; }
    if (t.settings?.fontStyle !== undefined && score >= fsScore) { fsScore = score; fsTok = t; }
  });
  if (!matched) return undefined;
  const fs = fsTok?.settings?.fontStyle ?? "";
  return {
    fg: fgTok?.settings?.foreground ? stripAlpha(fgTok.settings.foreground) : undefined,
    italic: /\bitalic\b/.test(fs),
    bold: /\bbold\b/.test(fs),
    underline: /\bunderline\b/.test(fs),
    strikethrough: /\bstrikethrough\b/.test(fs),
  };
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
