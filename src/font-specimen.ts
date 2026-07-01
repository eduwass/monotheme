// Faithful font specimens via Satori — renders the code snippet in the ACTUAL
// font, with text converted to vector <path> outlines, so the real typeface shows
// even when the font isn't installed (and renders anywhere, incl. Raycast). No
// headless browser: Satori is pure JS. Font files come from the free fontsource
// CDN (jsDelivr), cached under ~/.config/monotheme/font-files/.
import satori from "satori";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { VscodeTheme } from "./load.ts";
import { SNIPPET, specimenStyles } from "./preview.ts";
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

const div = (style: any, children: any) => ({ type: "div", props: { style, children } });

/** Render a faithful specimen SVG (glyphs as paths) for `data` in `theme`'s colors.
 *  Returns null if Satori fails. */
export async function renderSpecimen(theme: VscodeTheme, data: Buffer): Promise<string | null> {
  const { p, styles } = specimenStyles(theme);
  const dot = (c: string) => div({ width: 10, height: 10, borderRadius: 5, backgroundColor: c, marginRight: 6 }, "");
  const bar = div(
    { display: "flex", alignItems: "center", height: 30, backgroundColor: p.bgPanel, paddingLeft: 12 },
    [dot(p.ansi[1]!), dot(p.ansi[3]!), dot(p.ansi[2]!)],
  );
  const lines = SNIPPET.map((line) =>
    div(
      { display: "flex", height: 21 },
      line.map(([text, kind]) =>
        div({ color: styles[kind].fill, ...(styles[kind].italic ? { fontStyle: "italic" } : {}), whiteSpace: "pre" }, text || " "),
      ),
    ),
  );
  const tree = div(
    { display: "flex", flexDirection: "column", width: 480, height: 300, backgroundColor: p.bg, fontFamily: "Spec", fontSize: 13 },
    [bar, div({ display: "flex", flexDirection: "column", padding: 14 }, lines)],
  );
  try {
    return await satori(tree as any, { width: 480, height: 300, fonts: [{ name: "Spec", data, weight: 400, style: "normal" }] });
  } catch {
    return null;
  }
}
