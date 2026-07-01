// Generate a code-sample preview card (SVG) for ANY theme, rendered from the
// theme's own colors + tokenColors. Works uniformly for every theme — Marketplace,
// vendored, or hand-rolled custom — because it doesn't depend on an external
// preview service; it colors a fixed snippet the way the theme would. Mirrors the
// familiar vscodethemes.com card (title bar + syntax-highlit code).
import type { VscodeTheme } from "./load.ts";
import { project, resolveToken } from "./project.ts";

export type Kind = "kw" | "fn" | "str" | "num" | "com" | "prop" | "var" | "punct" | "plain";
export type Tok = [string, Kind];

// A fixed, hand-tokenized snippet (no tokenizer needed — same sample every time).
export const SNIPPET: Tok[][] = [
  [["// monotheme preview", "com"]],
  [["const", "kw"], [" btn ", "plain"], ["=", "punct"], [" document", "var"], [".", "punct"], ["getElementById", "fn"], ["(", "punct"], ["'btn'", "str"], [")", "punct"]],
  [["let", "kw"], [" count ", "plain"], ["=", "punct"], [" 0", "num"]],
  [[" ", "plain"]],
  [["function", "kw"], [" ", "plain"], ["render", "fn"], ["() {", "punct"]],
  [["  btn", "var"], [".", "punct"], ["innerText", "prop"], [" = ", "punct"], ["`Count: ${count}`", "str"]],
  [["}", "punct"]],
  [[" ", "plain"]],
  [["if", "kw"], [" (count ", "plain"], ["< 10", "num"], [") {", "plain"]],
  [["  count ", "plain"], ["+=", "punct"], [" 1", "num"]],
  [["}", "punct"]],
];

export const SCOPES: Record<Kind, string[]> = {
  kw: ["keyword", "storage.type", "keyword.control"],
  fn: ["entity.name.function", "support.function", "meta.function-call"],
  str: ["string", "string.template", "string.quoted"],
  num: ["constant.numeric", "constant.language"],
  com: ["comment", "comment.line"],
  prop: ["variable.other.property", "meta.object-literal.key", "support.variable.property"],
  var: ["variable", "variable.other"],
  punct: ["punctuation", "meta.brace"],
  plain: [],
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Common Nerd Font glyphs (branch · folder · file · star · github · code · bolt ·
// home) — render as icons in a Nerd Font, tofu otherwise, so only add for NF fonts.
export const NF_GLYPHS = "              ";

const DEFAULT_MONO = "ui-monospace, 'SF Mono', Menlo, monospace";

export interface PreviewOpts {
  /** font-family for the code (used by the font grid to preview a specific font). */
  fontFamily?: string;
  /** append a line of Nerd Font glyphs (only meaningful for NF fonts). */
  nerdGlyphs?: boolean;
}

/** Resolve the theme's colors for the specimen: chrome + a style per token kind.
 *  Shared by the raw-SVG (toPreviewSvg) and the Satori faithful renderer. */
export function specimenStyles(theme: VscodeTheme) {
  const p = project(theme);
  const t = theme.tokenColors;
  const colorFor = (kind: Kind): { fill: string; italic: boolean } => {
    for (const s of SCOPES[kind]) {
      const r = resolveToken(t, s);
      if (r?.fg) return { fill: r.fg, italic: !!r.italic };
    }
    return { fill: p.fg, italic: false };
  };
  const styles = Object.fromEntries((Object.keys(SCOPES) as Kind[]).map((k) => [k, colorFor(k)])) as Record<Kind, { fill: string; italic: boolean }>;
  return { p, styles };
}

export function toPreviewSvg(theme: VscodeTheme, opts: PreviewOpts = {}): string {
  const codeFont = opts.fontFamily ? `${opts.fontFamily}, ${DEFAULT_MONO}` : DEFAULT_MONO;
  const { p, styles } = specimenStyles(theme);

  const W = 480, H = 300, pad = 16, bar = 30, lh = 21, fs = 13;
  const dots = [p.ansi[1], p.ansi[3], p.ansi[2]];

  const rows: Tok[][] = opts.nerdGlyphs ? [...SNIPPET, [[`// ${NF_GLYPHS}`, "com"]]] : SNIPPET;
  const lines = rows.map((line, i) => {
    const y = bar + pad + 4 + i * lh;
    let x = pad;
    const spans = line
      .map(([text, kind]) => {
        const st = styles[kind];
        const span = `<tspan x="${x}" xml:space="preserve" fill="${st.fill}"${st.italic ? ' font-style="italic"' : ""}>${esc(text)}</tspan>`;
        x += text.length * (fs * 0.6); // monospace advance
        return span;
      })
      .join("");
    return `<text y="${y}" font-family="${esc(codeFont)}" font-size="${fs}">${spans}</text>`;
  }).join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" rx="10" fill="${p.bg}"/>
  <rect width="${W}" height="${bar}" rx="10" fill="${p.bgPanel}"/>
  <rect y="${bar - 10}" width="${W}" height="10" fill="${p.bgPanel}"/>
  <line x1="0" y1="${bar}" x2="${W}" y2="${bar}" stroke="${p.border}" stroke-width="1"/>
  ${dots.map((c, i) => `<circle cx="${16 + i * 16}" cy="${bar / 2}" r="5" fill="${c}"/>`).join("")}
  <text x="${W / 2}" y="${bar / 2 + 4}" text-anchor="middle" font-family="ui-sans-serif, system-ui" font-size="11" fill="${p.fgMuted}">main.js</text>
  ${lines}
</svg>`;
}
