// Re-emit the active theme as a self-contained VSCode color theme named
// "Monotheme", plus the minimal extension manifest nvim-textmate needs to load it.
// Feeding nvim-textmate OUR slot (instead of pointing it at raw editor extensions)
// avoids per-theme quirks: multi-variant naming ("GitHub Light" vs "GitHub Light
// Default"), include resolution, etc. We control one stable name.
import type { VscodeTheme, TokenColor } from "../load.ts";
import { stripAlpha } from "../load.ts";

// nvim-textmate's C module caches parsed themes BY NAME, and exposes no reload —
// so a stable name ("Monotheme") never re-reads the rewritten file on switch
// (dark↔light breaks). Register each theme under its OWN name instead: a real
// switch is then always a cache miss → fresh read.
export const labelFor = (theme: VscodeTheme) => `Monotheme ${theme.name}`;

// nvim-textmate's C color parser wants #rrggbb — normalize #rgb shorthand / alpha
// (raw editor themes like github-light use "#fff", which renders as black).
const norm = (v: unknown) => (typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v) ? stripAlpha(v) : v);
function normColors(c: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k in c) out[k] = norm(c[k]) as string;
  return out;
}
function normTokens(tokens: TokenColor[]): TokenColor[] {
  return tokens.map((t) =>
    t.settings
      ? { ...t, settings: { ...t.settings, ...(t.settings.foreground ? { foreground: norm(t.settings.foreground) as string } : {}), ...(t.settings.background ? { background: norm(t.settings.background) as string } : {}) } }
      : t,
  );
}

/** The VSCode theme JSON (colors + tokenColors) under a per-theme name. */
export function toVscodeTheme(theme: VscodeTheme): string {
  return JSON.stringify(
    { name: labelFor(theme), type: theme.type, colors: normColors(theme.colors), tokenColors: normTokens(theme.tokenColors) },
    null,
    2,
  ) + "\n";
}

/** Minimal VSCode-extension package.json pointing at the theme file. uiTheme
 *  picks the light/dark base so the host's defaults match. */
export function toVscodeThemeManifest(theme: VscodeTheme): string {
  return JSON.stringify(
    {
      name: "monotheme-theme",
      version: "1.0.0",
      engines: { vscode: "*" },
      contributes: {
        themes: [
          { label: labelFor(theme), uiTheme: theme.type === "light" ? "vs" : "vs-dark", path: "./themes/monotheme.json" },
        ],
      },
    },
    null,
    2,
  ) + "\n";
}
