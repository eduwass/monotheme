// Online theme discovery — browse and pull themes from the VS Code Marketplace,
// the same source vscodethemes.com indexes. Search returns theme extensions;
// `addExtension` downloads the extension's .vsix (a zip), extracts every theme it
// contributes, and vendors them into the config-home themes/ dir so they show up
// in `theme list` and can be `theme set` like any other.
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import JSON5 from "json5";
import plist from "plist";
import { USER_THEMES } from "./paths.ts";
import { slugify } from "./discover.ts";

const GALLERY = "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery";

export interface MarketTheme {
  publisher: string;
  extension: string;
  id: string; // publisher.extension
  version: string;
  displayName: string;
  description: string;
  installs: number;
}

/** Search the Marketplace for theme extensions matching a query, most-installed first. */
// Marketplace sortBy codes → the vscodethemes.com-style options.
export const SORT: Record<string, number> = { relevance: 0, installs: 4, trending: 10, recent: 1 };

export async function searchThemes(query: string, opts: { pageSize?: number; pageNumber?: number; sortBy?: number } = {}): Promise<MarketTheme[]> {
  const { pageSize = 20, pageNumber = 1, sortBy = 4 } = opts;
  // Empty query → browse the whole "Themes" category (top themes), like the site.
  const criteria: any[] = [
    { filterType: 8, value: "Microsoft.VisualStudio.Code" },
    { filterType: 5, value: "Themes" },
  ];
  if (query.trim()) criteria.push({ filterType: 10, value: query });
  const body = {
    filters: [{ criteria, pageNumber, pageSize, sortBy, sortOrder: 0 }],
    flags: 918, // 914 + IncludeCategoryAndTags(4), so we can drop icon-theme extensions
  };
  const res = await fetch(GALLERY, {
    method: "POST",
    headers: { Accept: "application/json;api-version=3.0-preview.1", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`marketplace query failed (${res.status})`);
  const data = (await res.json()) as any;
  const exts = data.results?.[0]?.extensions ?? [];
  // The "Themes" category also holds icon / product-icon themes (Material Icon Theme
  // etc.) which contribute no colour theme — drop them by tag so they don't pollute.
  const isIconTheme = (e: any) => (e.tags ?? []).some((t: string) => /(^|-)icon-theme$/i.test(t) || t.toLowerCase() === "icon-theme" || t.toLowerCase() === "product-icon-theme");
  return exts.filter((e: any) => !isIconTheme(e)).map((e: any): MarketTheme => ({
    publisher: e.publisher.publisherName,
    extension: e.extensionName,
    id: `${e.publisher.publisherName}.${e.extensionName}`,
    version: e.versions?.[0]?.version ?? "",
    displayName: e.displayName,
    description: e.shortDescription ?? "",
    installs: Number(e.statistics?.find((s: any) => s.statisticName === "install")?.value ?? 0),
  }));
}

const uiToType = (ui?: string): "dark" | "light" => (ui === "vs" || ui === "hc-light" ? "light" : "dark");

// Resolve a VS Code theme file, following one level of `include`, merging
// colors + tokenColors (base first, override on top) — how VS Code composes them.
function loadThemeFile(path: string): { colors: any; tokenColors: any[]; type?: string } {
  const text = readFileSync(path, "utf8");
  // Some (older) extensions ship TextMate .tmTheme themes — XML plists, not JSON.
  // Their `settings` array is already the tokenColors shape; the entry without a
  // scope carries the global editor colours.
  if (text.trimStart().startsWith("<")) {
    const pl = plist.parse(text) as any;
    const settings: any[] = Array.isArray(pl?.settings) ? pl.settings : [];
    const global = settings.find((s) => !s.scope)?.settings ?? {};
    const colors: any = {};
    if (global.background) colors["editor.background"] = global.background;
    if (global.foreground) colors["editor.foreground"] = global.foreground;
    return { colors, tokenColors: settings.filter((s) => s.scope) };
  }
  const raw = JSON5.parse(text);
  let base: any = { colors: {}, tokenColors: [] };
  if (raw.include) {
    const inc = resolve(dirname(path), raw.include);
    if (existsSync(inc)) base = loadThemeFile(inc);
  }
  return {
    colors: { ...(base.colors ?? {}), ...(raw.colors ?? {}) },
    tokenColors: [...(base.tokenColors ?? []), ...(raw.tokenColors ?? [])],
    type: raw.type ?? base.type,
  };
}

export interface ExtractedTheme { slug: string; name: string; type: "dark" | "light"; colors: any; tokenColors: any[]; }

/** Download an extension's .vsix and extract every theme it contributes as an
 *  in-memory object — WITHOUT vendoring. Shared by `add` (which writes them) and
 *  the remote preview (which just renders one). */
export async function fetchExtensionThemes(pubExt: string): Promise<{ label: string; themes: ExtractedTheme[] }> {
  const m = /^([^.]+)\.(.+)$/.exec(pubExt);
  if (!m) throw new Error(`expected <publisher.extension>, got '${pubExt}'`);
  const [, publisher, extension] = m;

  // resolve latest version via a lookup (so callers can pass just publisher.ext)
  const results = await searchThemes(`${publisher} ${extension}`, { pageSize: 25 });
  const hit = results.find((r) => r.id.toLowerCase() === pubExt.toLowerCase());
  const version = hit?.version;
  if (!version) throw new Error(`'${pubExt}' not found as a theme extension on the Marketplace`);

  const url = `https://${publisher}.gallery.vsassets.io/_apis/public/gallery/publisher/${publisher}/extension/${extension}/${version}/assetbyname/Microsoft.VisualStudio.Services.VSIXPackage`;
  const tmp = mkdtempSync(join(tmpdir(), "monotheme-vsix-"));
  try {
    const vsix = join(tmp, "ext.vsix");
    // Cap the download: some "theme" extensions (PowerShell, C/C++) are 100+ MB —
    // not worth fetching just for a preview. Time out so they fail fast and hide.
    const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
    if (!res.ok) throw new Error(`download failed (${res.status})`);
    writeFileSync(vsix, Buffer.from(await res.arrayBuffer()));
    try { execSync(`unzip -oq "${vsix}" -d "${tmp}"`, { stdio: "ignore" }); }
    catch { throw new Error("could not unzip .vsix (need the `unzip` command)"); }

    const pkgPath = join(tmp, "extension", "package.json");
    const pkg = JSON5.parse(readFileSync(pkgPath, "utf8"));
    const themes = pkg?.contributes?.themes;
    if (!Array.isArray(themes) || !themes.length) throw new Error(`${pubExt} contributes no themes`);

    const out: ExtractedTheme[] = [];
    for (const th of themes) {
      if (!th?.path) continue;
      const tp = resolve(join(tmp, "extension"), th.path);
      if (!existsSync(tp)) continue;
      try {
        const label = th.label ?? th.id ?? th.path;
        const resolved = loadThemeFile(tp);
        out.push({ slug: slugify(label), name: label, type: resolved.type ?? uiToType(th.uiTheme), colors: resolved.colors, tokenColors: resolved.tokenColors });
      } catch { /* skip a theme file we can't parse; keep the rest */ }
    }
    if (!out.length) throw new Error(`${pubExt}: no readable themes (unsupported format?)`);
    return { label: pkg.displayName ?? pubExt, themes: out };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** Download an extension's .vsix, extract every theme it contributes, and vendor
 *  them into the config-home themes/ dir. Returns the slugs added. */
export async function addExtension(pubExt: string): Promise<{ added: string[]; label: string }> {
  const { label, themes } = await fetchExtensionThemes(pubExt);
  mkdirSync(USER_THEMES, { recursive: true });
  const added: string[] = [];
  for (const t of themes) {
    const out = { name: t.name, type: t.type, colors: t.colors, tokenColors: t.tokenColors };
    writeFileSync(join(USER_THEMES, t.slug + ".json"), JSON.stringify(out, null, 2) + "\n");
    added.push(t.slug);
  }
  return { added, label };
}
