// VSCode theme -> opencode theme JSON (its semantic schema, direct hex per role).
import type { VscodeTheme } from "../load.ts";
import { pick, stripAlpha } from "../load.ts";
import { project, scopeColor } from "../project.ts";

export function toOpencode(theme: VscodeTheme): string {
  const p = project(theme);
  const c = theme.colors;
  const t = theme.tokenColors;
  const a = p.ansi;
  const sx = (scopes: string[], fb: string) => {
    for (const s of scopes) { const v = scopeColor(t, s); if (v) return v; }
    return fb;
  };
  const dv = (hex: string) => ({ dark: hex, light: hex }); // single-appearance source
  const addBg = pick(c, ["diffEditor.insertedLineBackground", "diffEditor.insertedTextBackground"]) ?? "#1f3320";
  const delBg = pick(c, ["diffEditor.removedLineBackground", "diffEditor.removedTextBackground"]) ?? "#3a1f1f";

  const theme_ = {
    primary: dv(p.accent), secondary: dv(a[6]!), accent: dv(p.accent),
    error: dv(p.error), warning: dv(p.warning), success: dv(p.success), info: dv(a[6]!),
    text: dv(p.fg), textMuted: dv(p.fgMuted),
    background: dv(p.bg), backgroundPanel: dv(p.bgPanel), backgroundElement: dv(p.bgPanel), backgroundMenu: dv(p.bgPanel),
    border: dv(p.border), borderActive: dv(p.borderActive), borderSubtle: dv(p.border),
    diffAdded: dv(p.success), diffRemoved: dv(p.error), diffContext: dv(p.fgMuted), diffHunkHeader: dv(p.accent),
    diffHighlightAdded: dv(a[10]!), diffHighlightRemoved: dv(a[9]!),
    diffAddedBg: dv(addBg), diffRemovedBg: dv(delBg), diffContextBg: dv(p.bg),
    diffLineNumber: dv(p.fgMuted), diffAddedLineNumberBg: dv(addBg), diffRemovedLineNumberBg: dv(delBg),
    markdownText: dv(p.fg), markdownHeading: dv(p.accent), markdownLink: dv(a[4]!), markdownLinkText: dv(a[6]!),
    markdownCode: dv(a[2]!), markdownBlockQuote: dv(p.fgMuted), markdownEmph: dv(p.fg), markdownStrong: dv(p.accent),
    markdownHorizontalRule: dv(p.border), markdownListItem: dv(p.accent), markdownListEnumeration: dv(p.accent),
    markdownImage: dv(a[4]!), markdownImageText: dv(a[6]!), markdownCodeBlock: dv(p.fg),
    syntaxComment: dv(sx(["comment"], a[8]!)),
    syntaxKeyword: dv(sx(["keyword", "storage.type"], a[5]!)),
    syntaxFunction: dv(sx(["entity.name.function", "support.function"], a[3]!)),
    syntaxVariable: dv(sx(["variable"], p.fg)),
    syntaxString: dv(sx(["string"], a[2]!)),
    syntaxNumber: dv(sx(["constant.numeric"], a[1]!)),
    syntaxType: dv(sx(["entity.name.type", "support.type"], a[6]!)),
    syntaxOperator: dv(sx(["keyword.operator"], a[6]!)),
    syntaxPunctuation: dv(sx(["punctuation"], p.fg)),
  };
  return JSON.stringify({ $schema: "https://opencode.ai/theme.json", theme: theme_ }, null, 2) + "\n";
}
