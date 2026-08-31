// Fetch a theme extension's .vsix and extract its themes — entirely in the
// browser (Marketplace allows CORS; zip.ts + DecompressionStream do the rest).
// Shared by the browser page (browse.ts) and the homepage strip (home.ts).
import JSON5 from "json5";
import type { VscodeTheme } from "../../src/load.ts";
import type { MarketTheme } from "../../src/market-search.ts";
import { readCentralDirectory, readTextEntry, inflateRawWeb } from "./zip.ts";

export interface Extracted { label: string; themes: VscodeTheme[] }

export async function fetchVsix(ext: MarketTheme): Promise<Uint8Array> {
  const urls = [
    `https://${ext.publisher}.gallery.vsassets.io/_apis/public/gallery/publisher/${ext.publisher}/extension/${ext.extension}/${ext.version}/assetbyname/Microsoft.VisualStudio.Services.VSIXPackage`,
    `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${ext.publisher}/vsextensions/${ext.extension}/${ext.version}/vspackage`,
  ];
  let lastErr: unknown;
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
      if (!res.ok) throw new Error(`download failed (${res.status})`);
      const len = Number(res.headers.get("content-length") ?? 0);
      if (len > 40 * 1024 * 1024) throw new Error(`extension is ${(len / 1048576).toFixed(0)} MB — too big to preview here`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

const uiToType = (ui?: string): "dark" | "light" => (ui === "vs" || ui === "hc-light" ? "light" : "dark");
const dirname = (p: string) => p.replace(/\/[^/]*$/, "");
const joinPath = (dir: string, rel: string) => {
  const parts = (dir + "/" + rel).split("/");
  const out: string[] = [];
  for (const s of parts) { if (s === "..") out.pop(); else if (s !== "." && s !== "") out.push(s); }
  return out.join("/");
};

export async function extractThemes(ext: MarketTheme): Promise<Extracted> {
  const buf = await fetchVsix(ext);
  const entries = readCentralDirectory(buf);
  const read = (name: string) => readTextEntry(buf, entries, name, inflateRawWeb);
  const pkgText = await read("extension/package.json");
  if (!pkgText) throw new Error("no extension/package.json in the .vsix");
  const pkg = JSON5.parse(pkgText);
  const contributed: any[] = pkg?.contributes?.themes ?? [];
  if (!contributed.length) throw new Error(`${ext.id} contributes no colour themes`);
  const themes: VscodeTheme[] = [];
  for (const th of contributed) {
    if (!th?.path) continue;
    const path = joinPath("extension", th.path);
    const text = await read(path);
    if (!text) continue;
    if (text.trimStart().startsWith("<")) continue; // .tmTheme plists — the CLI handles those, the preview doesn't
    let raw: any;
    try { raw = JSON5.parse(text); } catch { continue; }
    let base: any = { colors: {}, tokenColors: [] };
    if (typeof raw.include === "string") {
      const incText = await read(joinPath(dirname(path), raw.include));
      if (incText) { try { base = JSON5.parse(incText); } catch {} }
    }
    const label: string = th.label ?? th.id ?? th.path;
    themes.push({
      name: label,
      // uiTheme wins over the file's `type` (authors get it wrong: tokyo-night's light
      // file says dark) — the same call the CLI makes via discover().
      type: th.uiTheme ? uiToType(th.uiTheme) : raw.type === "light" || base.type === "light" ? "light" : "dark",
      colors: { ...(base.colors ?? {}), ...(raw.colors ?? {}) },
      tokenColors: [...(base.tokenColors ?? base.settings ?? []), ...(raw.tokenColors ?? raw.settings ?? [])],
    });
  }
  if (!themes.length) throw new Error(`${ext.id}: could not read any of its theme files`);
  return { label: pkg.displayName ?? ext.displayName, themes };
}

