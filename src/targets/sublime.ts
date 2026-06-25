import { defineTarget } from "../target-kit.ts";
// VSCode theme -> Sublime Text .sublime-color-scheme (JSON). Sublime uses the
// same TextMate scope model as .tmTheme, so the per-rule handling mirrors
// formats/tmtheme.ts (join scope arrays, pass fontStyle through). The globals
// mapping (which colors{} key feeds each Sublime global) is adapted from
// MIT-licensed tobiastimm/code-theme-converter (src/sublime/colorScheme.ts),
// with c.palette fallbacks so every key still gets a sensible value.
import type { VscodeTheme } from "../load.ts";
import { stripAlpha } from "../load.ts";
import { project } from "../project.ts";

export function toSublime(theme: VscodeTheme, opts: { name?: string } = {}): string {
  const c = theme.colors;
  const p = project(theme);

  // First defined colors{} key wins; fall back to a palette role. Sublime accepts
  // #RRGGBB / #RRGGBBAA — strip shorthand/normalize via stripAlpha (keeps 8-digit
  // alpha intact, which Sublime supports for washes like selection/line_highlight).
  const g = (keys: string[], fb: string) => {
    for (const k of keys) {
      const v = c[k];
      if (v) return /^#[0-9a-fA-F]{8}$/.test(v.trim()) ? v.trim() : stripAlpha(v);
    }
    return fb;
  };

  const globals: Record<string, string> = {
    background: g(["editor.background"], p.bg),
    foreground: g(["editor.foreground"], p.fg),
    caret: g(["editorCursor.foreground", "editorCursor.background"], p.cursor),
    block_caret: g(["editorCursor.foreground", "editorCursor.background"], p.cursor),
    line_highlight: g(["editor.lineHighlightBackground"], p.bgPanel),
    selection: g(["editor.selectionBackground"], p.selection),
    inactive_selection: g(["editor.inactiveSelectionBackground", "list.inactiveSelectionBackground"], p.selection),
    selection_border: g(["editor.selectionHighlightBorder", "focusBorder"], p.border),
    misspelling: g(["editorError.foreground"], p.error),
    gutter: g(["editorGutter.background", "editor.background"], p.bg),
    gutter_foreground: g(["editorLineNumber.foreground"], p.fgMuted),
    guide: g(["editorIndentGuide.background"], p.border),
    active_guide: g(["editorIndentGuide.activeBackground", "editorIndentGuide.background"], p.accent),
    stack_guide: g(["editorIndentGuide.background"], p.border),
    highlight: g(["editor.findMatchHighlightBackground", "editor.wordHighlightBackground"], p.accent),
    find_highlight: g(["editor.findMatchBackground", "editor.findMatchHighlightBackground"], p.accent),
    find_highlight_foreground: g(["list.highlightForeground", "editor.foreground"], p.fg),
    brackets_foreground: g(["editorBracketMatch.border", "editorBracketHighlight.foreground1"], p.accent),
    accent: g(["list.highlightForeground", "button.background"], p.accent),
  };

  // Rules: same scope/fontStyle handling as formats/tmtheme.ts. Skip entries
  // without a usable foreground or background.
  const rules = theme.tokenColors
    .filter((t) => t.settings && (t.settings.foreground || t.settings.background || (t.settings.fontStyle ?? "").trim()))
    .map((t) => {
      const scope = Array.isArray(t.scope) ? t.scope.join(", ") : t.scope;
      const rule: Record<string, string> = {};
      if (t.name) rule.name = t.name;
      if (scope) rule.scope = scope;
      if (t.settings.foreground) rule.foreground = stripAlpha(t.settings.foreground);
      if (t.settings.background) rule.background = stripAlpha(t.settings.background);
      const fs = (t.settings.fontStyle ?? "").trim();
      if (fs && fs !== "normal") rule.font_style = fs; // Sublime: space-separated italic/bold/underline
      return rule;
    });

  return JSON.stringify({ name: opts.name ?? theme.name, globals, rules }, null, 2) + "\n";
}

export default defineTarget({
  name: "sublime",
  // Lenient: write the slot if Sublime is present (app, config dir, or `subl`).
  detect: (c) =>
    c.mac
      ? c.has("/Applications/Sublime Text.app") || c.has(c.appSupport("Sublime Text"))
      : c.has(c.config("sublime-text")) || c.hasCmd("subl"),
  // mac: ~/Library/Application Support/Sublime Text/Packages/User/<slot>.sublime-color-scheme
  // linux/win: <config>/sublime-text/Packages/User/<slot>.sublime-color-scheme
  file: (c) =>
    c.mac
      ? c.appSupport("Sublime Text", "Packages", "User", `${c.slot}.sublime-color-scheme`)
      : c.config("sublime-text", "Packages", "User", `${c.slot}.sublime-color-scheme`),
  render: (c) => toSublime(c.theme, { name: c.entry?.label ?? "monotheme" }),
  // reload: omitted — Sublime watches Packages/User and live-reloads color schemes on change.
});
