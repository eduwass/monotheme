// Faithful font specimens via Satori — renders the code snippet in the ACTUAL
// font, with text converted to vector <path> outlines, so the real typeface shows
// even when the font isn't installed (and renders anywhere, incl. Raycast). No
// headless browser: Satori is pure JS. Font files come from the free fontsource
// CDN (jsDelivr), cached under ~/.config/monotheme/font-files/.
import satori from "satori";
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VscodeTheme } from "./load.ts";
import { SNIPPET, NF_GLYPHS, specimenStyles } from "./preview.ts";
import { CONFIG_HOME } from "./paths.ts";

const FONT_CACHE = join(CONFIG_HOME, "font-files");

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Fetch a plain TTF for a font (fontsource CDN), cached. Returns null if the
 *  font isn't on fontsource (caller falls back to the name-based SVG). */
export async function resolveFontFile(id: string, name: string): Promise<Buffer | null> {
  mkdirSync(FONT_CACHE, { recursive: true });
  const cached = join(FONT_CACHE, id + ".ttf");
  if (existsSync(cached)) return readFileSync(cached);
  const miss = join(FONT_CACHE, id + ".miss");
  if (existsSync(miss)) return null; // remember 404s so we don't refetch every time
  for (const slug of new Set([id, slugify(name)])) {
    const url = `https://cdn.jsdelivr.net/fontsource/fonts/${slug}@latest/latin-400-normal.ttf`;
    try {
      const res = await fetch(url);
      if (res.ok) { const buf = Buffer.from(await res.arrayBuffer()); writeFileSync(cached, buf); return buf; }
    } catch { /* try next slug */ }
  }
  writeFileSync(miss, "");
  return null;
}

// Download a nerd-fonts release .tar.xz and extract one usable font file (ttf/otf).
// `preferRe` picks the variant we want; falls back to any Regular, then any file.
async function fetchNerdRelease(asset: string, cacheFile: string, preferRe: RegExp, cacheMiss = true): Promise<Buffer | null> {
  mkdirSync(FONT_CACHE, { recursive: true });
  const cached = join(FONT_CACHE, cacheFile);
  if (existsSync(cached)) return readFileSync(cached);
  const miss = cached + ".miss";
  if (cacheMiss && existsSync(miss)) return null;
  const tmp = mkdtempSync(join(tmpdir(), "monotheme-nf-"));
  try {
    const res = await fetch(`https://github.com/ryanoasis/nerd-fonts/releases/latest/download/${asset}.tar.xz`);
    if (!res.ok) throw new Error("dl");
    const tar = join(tmp, "f.tar.xz");
    writeFileSync(tar, Buffer.from(await res.arrayBuffer()));
    execSync(`tar -xJf "${tar}" -C "${tmp}"`, { stdio: "ignore" });
    const fonts = readdirSync(tmp, { recursive: true }).map(String).filter((f) => /\.(ttf|otf)$/i.test(f));
    const pick = fonts.find((f) => preferRe.test(f)) ?? fonts.find((f) => /regular/i.test(f)) ?? fonts[0];
    if (!pick) throw new Error("no font file");
    const buf = readFileSync(join(tmp, pick));
    writeFileSync(cached, buf);
    return buf;
  } catch {
    if (cacheMiss) writeFileSync(miss, ""); // symbols: never give up permanently
    return null;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** The Nerd-Font-patched build of a font (for the typeface when it's not on the
 *  base CDN). Prefers the plain "NerdFont-Regular" variant (not Mono/Propo). */
export function resolveNerdFontFile(id: string, nfAsset?: string): Promise<Buffer | null> {
  if (!nfAsset) return Promise.resolve(null);
  return fetchNerdRelease(nfAsset, id + "-nf", /NerdFont-Regular\.(ttf|otf)$/i);
}

let _symbols: Buffer | null | undefined;
/** The shared "Symbols Only" Nerd Font (~2MB) — downloaded ONCE and reused for the
 *  glyph row of every specimen (NF icons are identical across fonts), so we never
 *  fetch a multi-MB per-font archive just to show glyphs. */
export async function resolveSymbolsFont(): Promise<Buffer | null> {
  if (_symbols !== undefined) return _symbols;
  _symbols = await fetchNerdRelease("NerdFontsSymbolsOnly", "symbols-nf", /SymbolsNerdFontMono-Regular\.(ttf|otf)$/i, false);
  return _symbols;
}

const div = (style: any, children: any) => ({ type: "div", props: { style, children } });

// A simple, font-only specimen: name + sample glyphs + ligatures (+ Nerd Font
// icons). Neutral colours → theme-INDEPENDENT, so it's generated once and cached
// forever. Rendered in the actual font via Satori (vector paths), so it's faithful
// even when the font isn't installed.
// GitHub-Light syntax colours (fixed, theme-independent) for the code snippet.
const GH: Record<string, string> = {
  kw: "#cf222e", fn: "#8250df", str: "#0a3069", num: "#0550ae",
  com: "#6e7781", prop: "#0550ae", punct: "#1f2328", plain: "#1f2328",
};
// Hand-tokenized snippet — shows letterforms, ligatures (<=, =>, ++, ===) and colour.
const CODE: [string, keyof typeof GH][][] = [
  [["for", "kw"], [" (", "punct"], ["let", "kw"], [" i ", "plain"], ["=", "punct"], [" 0", "num"], ["; i ", "plain"], ["<=", "punct"], [" 10", "num"], ["; i", "plain"], ["++", "punct"], [") {", "punct"]],
  [["  sum ", "plain"], ["+=", "punct"], [" items", "plain"], ["[", "punct"], ["i", "plain"], ["]", "punct"], [" ?? ", "punct"], ["0", "num"]],
  [["}", "punct"], [" ", "plain"], ["// => done", "com"]],
];

export async function renderSpecimen(data: Buffer, opts: { name: string; symbols?: Buffer | null }): Promise<string | null> {
  // Specimen: name, a big sample sentence (compare typefaces), a small GitHub-Light
  // syntax-highlighted snippet (see code + ligatures + colour), and the NF glyph row.
  // All theme-INDEPENDENT → generated once and cached forever.
  const bg = "#ffffff", ink = "#1c1c21", sub = "#9a9aa2", accent = "#5b6bd6";
  const row = (color: string, size: number, extra: any, text: string) =>
    div({ display: "flex", color, fontSize: size, ...extra }, text);
  const codeLine = (toks: [string, keyof typeof GH][]) =>
    div({ display: "flex", height: 21 }, toks.map(([t, k]) => div({ color: GH[k], whiteSpace: "pre" }, t)));
  const children: any[] = [
    row(sub, 14, { marginBottom: 14 }, opts.name),
    row(ink, 30, { marginBottom: 18, width: 456, lineHeight: 1.15 }, "Whereas recognition of the inherent dignity"),
    div({ display: "flex", flexDirection: "column", fontSize: 15 }, CODE.map(codeLine)),
  ];
  // glyph row renders in the shared Symbols font, so it shows for any NF-capable
  // font without downloading that font's full patched archive.
  if (opts.symbols) children.push(div({ display: "flex", color: accent, fontSize: 22, marginTop: 16, fontFamily: "Sym", whiteSpace: "pre" }, NF_GLYPHS));
  const tree = div(
    { display: "flex", flexDirection: "column", justifyContent: "center", width: 520, height: 400, backgroundColor: bg, fontFamily: "Spec", padding: 36 },
    children,
  );
  const fonts: any[] = [{ name: "Spec", data, weight: 400, style: "normal" }];
  if (opts.symbols) fonts.push({ name: "Sym", data: opts.symbols, weight: 400, style: "normal" });
  try {
    return await satori(tree as any, { width: 520, height: 400, fonts });
  } catch {
    return null;
  }
}
