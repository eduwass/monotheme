// VSCode theme -> TextMate .tmTheme (plist). Used by bat, delta, yazi, oyo.
// Mapping adapted from MIT-licensed tobiastimm/code-theme-converter
// (src/sublime/tmTheme.ts). The only per-rule transform is joining the scope
// array into a comma string; plist.build() does all XML serialization.
import plist from "plist";
import type { VscodeTheme } from "../load.ts";
import { pick, stripAlpha } from "../load.ts";

export function toTmTheme(theme: VscodeTheme): string {
  const c = theme.colors;
  const slug = theme.name.replace(/\s+/g, "-").toLowerCase();

  const globals: Record<string, string> = {};
  const setIf = (k: string, keys: string[]) => {
    const v = pick(c, keys);
    if (v) globals[k] = v;
  };
  setIf("background", ["editor.background"]);
  setIf("foreground", ["editor.foreground"]);
  setIf("caret", ["editorCursor.foreground", "editorCursor.background", "editor.foreground"]);
  setIf("selection", ["editor.selectionBackground"]);
  setIf("lineHighlight", ["editor.lineHighlightBackground"]);
  setIf("invisibles", ["editorWhitespace.foreground"]);
  setIf("activeGuide", ["editorIndentGuide.activeBackground", "editorIndentGuide.background"]);
  setIf("findHighlight", ["editor.findMatchHighlightBackground"]);
  setIf("misspelling", ["editorError.foreground"]);

  const rules = theme.tokenColors
    .filter((t) => t.settings)
    .map((t) => {
      const settings: Record<string, string> = {};
      if (t.settings.foreground) settings.foreground = stripAlpha(t.settings.foreground);
      if (t.settings.background) settings.background = stripAlpha(t.settings.background);
      if (t.settings.fontStyle != null) settings.fontStyle = t.settings.fontStyle;
      const scope = Array.isArray(t.scope) ? t.scope.join(", ") : t.scope;
      const rule: Record<string, unknown> = { settings };
      if (t.name) rule.name = t.name;
      if (scope) rule.scope = scope;
      return rule;
    });

  const doc = {
    name: theme.name,
    settings: [{ settings: globals }, ...rules],
    uuid: uuidFrom(slug),
    colorSpaceName: "sRGB",
    semanticClass: `theme.${theme.type}.${slug}`,
  };
  return plist.build(doc as plist.PlistValue);
}

// Deterministic UUID from the slug — stable output across runs (no Date/random).
function uuidFrom(slug: string): string {
  let h = 0x811c9dc5;
  for (const ch of `tmtheme:${slug}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const hex = (n: number) => (h = Math.imul(h ^ n, 0x01000193) >>> 0).toString(16).padStart(8, "0");
  const s = (hex(1) + hex(2) + hex(3) + hex(4)).slice(0, 32);
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}
