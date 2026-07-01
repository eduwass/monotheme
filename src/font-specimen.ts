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

/** Fetch the actual Nerd-Font-patched TTF (has the icon glyphs) from the nerd-fonts
 *  release, cached. Heavier than the base font, so use only for on-demand previews.
 *  Returns null if the font has no NF build or the download fails. */
export async function resolveNerdFontFile(id: string, nfAsset?: string): Promise<Buffer | null> {
  if (!nfAsset) return null;
  mkdirSync(FONT_CACHE, { recursive: true });
  const cached = join(FONT_CACHE, id + "-nf.ttf");
  if (existsSync(cached)) return readFileSync(cached);
  const miss = join(FONT_CACHE, id + "-nf.miss");
  if (existsSync(miss)) return null;
  const tmp = mkdtempSync(join(tmpdir(), "monotheme-nf-"));
  try {
    const res = await fetch(`https://github.com/ryanoasis/nerd-fonts/releases/latest/download/${nfAsset}.tar.xz`);
    if (!res.ok) throw new Error("dl");
    const tar = join(tmp, "f.tar.xz");
    writeFileSync(tar, Buffer.from(await res.arrayBuffer()));
    execSync(`tar -xJf "${tar}" -C "${tmp}"`, { stdio: "ignore" });
    const ttfs = readdirSync(tmp, { recursive: true }).map(String).filter((f) => /\.ttf$/i.test(f));
    // prefer a proportional Regular (not the Mono variant) so the specimen isn't double-monospaced
    const pick = ttfs.find((f) => /regular/i.test(f) && !/mono/i.test(f)) ?? ttfs.find((f) => /regular/i.test(f)) ?? ttfs[0];
    if (!pick) throw new Error("no ttf");
    const buf = readFileSync(join(tmp, pick));
    writeFileSync(cached, buf);
    return buf;
  } catch {
    writeFileSync(miss, "");
    return null;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const div = (style: any, children: any) => ({ type: "div", props: { style, children } });

// A simple, font-only specimen: name + sample glyphs + ligatures (+ Nerd Font
// icons). Neutral colours → theme-INDEPENDENT, so it's generated once and cached
// forever. Rendered in the actual font via Satori (vector paths), so it's faithful
// even when the font isn't installed.
export async function renderSpecimen(data: Buffer, opts: { name: string; nerdGlyphs?: boolean }): Promise<string | null> {
  const bg = "#1b1b20", fg = "#e6e6ea", accent = "#7aa2f7", green = "#9ece6a", muted = "#9aa0aa";
  const row = (color: string, size: number, mb: number, text: string) =>
    div({ display: "flex", color, fontSize: size, marginBottom: mb, whiteSpace: "pre" }, text);
  const children = [
    row(accent, 30, 16, opts.name),
    row(fg, 17, 8, "ABCDEFGHIJKLM abcdefghijklm"),
    row(fg, 17, 8, "0123456789  (){}[]  &@#$%"),
    row(green, 20, 8, "-> => != === >= <= |> ++ /* */"),
  ];
  if (opts.nerdGlyphs) children.push(row(muted, 22, 0, NF_GLYPHS));
  const tree = div(
    { display: "flex", flexDirection: "column", justifyContent: "center", width: 480, height: 300, backgroundColor: bg, fontFamily: "Spec", padding: 30 },
    children,
  );
  try {
    return await satori(tree as any, { width: 480, height: 300, fonts: [{ name: "Spec", data, weight: 400, style: "normal" }] });
  } catch {
    return null;
  }
}
