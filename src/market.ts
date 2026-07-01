// Online theme discovery — browse and pull themes from the VS Code Marketplace,
// the same source vscodethemes.com indexes. Search returns theme extensions;
// `addExtension` downloads the extension's .vsix (a zip), extracts every theme it
// contributes, and vendors them into the config-home themes/ dir so they show up
// in `theme list` and can be `theme set` like any other.
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import JSON5 from "json5";
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
export async function searchThemes(query: string, pageSize = 20): Promise<MarketTheme[]> {
  const body = {
    filters: [{
      criteria: [
        { filterType: 8, value: "Microsoft.VisualStudio.Code" },
        { filterType: 10, value: query },
        { filterType: 5, value: "Themes" },
      ],
      pageNumber: 1, pageSize, sortBy: 4, sortOrder: 0,
    }],
    flags: 914,
  };
  const res = await fetch(GALLERY, {
    method: "POST",
    headers: { Accept: "application/json;api-version=3.0-preview.1", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`marketplace query failed (${res.status})`);
  const data = (await res.json()) as any;
  const exts = data.results?.[0]?.extensions ?? [];
  return exts.map((e: any): MarketTheme => ({
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
  const raw = JSON5.parse(readFileSync(path, "utf8"));
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

/** Download an extension's .vsix, extract every theme it contributes, and vendor
 *  them into the config-home themes/ dir. Returns the slugs added. */
export async function addExtension(pubExt: string): Promise<{ added: string[]; label: string }> {
  const m = /^([^.]+)\.(.+)$/.exec(pubExt);
  if (!m) throw new Error(`expected <publisher.extension>, got '${pubExt}'`);
  const [, publisher, extension] = m;

  // resolve latest version via a lookup (so callers can pass just publisher.ext)
  const results = await searchThemes(`${publisher} ${extension}`, 25);
  const hit = results.find((r) => r.id.toLowerCase() === pubExt.toLowerCase());
  const version = hit?.version;
  if (!version) throw new Error(`'${pubExt}' not found as a theme extension on the Marketplace`);

  const url = `https://${publisher}.gallery.vsassets.io/_apis/public/gallery/publisher/${publisher}/extension/${extension}/${version}/assetbyname/Microsoft.VisualStudio.Services.VSIXPackage`;
  const tmp = mkdtempSync(join(tmpdir(), "monotheme-vsix-"));
  try {
    const vsix = join(tmp, "ext.vsix");
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download failed (${res.status})`);
    writeFileSync(vsix, Buffer.from(await res.arrayBuffer()));
    try { execSync(`unzip -oq "${vsix}" -d "${tmp}"`, { stdio: "ignore" }); }
    catch { throw new Error("could not unzip .vsix (need the `unzip` command)"); }

    const pkgPath = join(tmp, "extension", "package.json");
    const pkg = JSON5.parse(readFileSync(pkgPath, "utf8"));
    const themes = pkg?.contributes?.themes;
    if (!Array.isArray(themes) || !themes.length) throw new Error(`${pubExt} contributes no themes`);

    mkdirSync(USER_THEMES, { recursive: true });
    const added: string[] = [];
    for (const th of themes) {
      if (!th?.path) continue;
      const tp = resolve(join(tmp, "extension"), th.path);
      if (!existsSync(tp)) continue;
      const label = th.label ?? th.id ?? th.path;
      const resolved = loadThemeFile(tp);
      const type = resolved.type ?? uiToType(th.uiTheme);
      const slug = slugify(label);
      const out = { name: label, type, colors: resolved.colors, tokenColors: resolved.tokenColors };
      writeFileSync(join(USER_THEMES, slug + ".json"), JSON.stringify(out, null, 2) + "\n");
      added.push(slug);
    }
    return { added, label: pkg.displayName ?? pubExt };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
