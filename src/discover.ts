// Discover installed editor themes (Cursor/VSCode) by reading each extension's
// package.json -> contributes.themes[], plus any local theme/themes/*.json.
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import JSON5 from "json5";

export interface ThemeEntry {
  /** display label (slug used by `theme set`) */
  label: string;
  slug: string;
  appearance: "dark" | "light";
  /** absolute path to the theme JSON */
  path: string;
  /** where it came from: extension id, or "local" */
  source: string;
}

const EXT_ROOTS = [
  join(homedir(), ".cursor", "extensions"),
  join(homedir(), ".vscode", "extensions"),
];

export function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const LOCAL_THEMES = resolve(dirname(new URL(import.meta.url).pathname), "..", "themes");

export function discover(): ThemeEntry[] {
  const out: ThemeEntry[] = [];
  const seen = new Set<string>();
  const add = (e: ThemeEntry) => {
    if (!seen.has(e.slug)) { seen.add(e.slug); out.push(e); }
  };

  // 1) installed editor extensions -> contributes.themes (authoritative: the
  //    label here is what the editor's `colorTheme` selector expects). These win
  //    over local copies on slug collision so editor selectors get a valid label.
  for (const root of EXT_ROOTS) {
    if (!existsSync(root)) continue;
    for (const ext of readdirSync(root)) {
      const pkgPath = join(root, ext, "package.json");
      if (!existsSync(pkgPath)) continue;
      let pkg: any;
      try { pkg = JSON5.parse(readFileSync(pkgPath, "utf8")); } catch { continue; }
      const themes = pkg?.contributes?.themes;
      if (!Array.isArray(themes)) continue;
      for (const th of themes) {
        if (!th?.path) continue;
        const path = resolve(join(root, ext), th.path);
        if (!existsSync(path)) continue;
        const label = th.label ?? th.id ?? th.path;
        const appearance: "dark" | "light" = th.uiTheme === "vs" ? "light" : "dark";
        add({ label, slug: slugify(label), appearance, path, source: ext });
      }
    }
  }

  // 2) local repo themes — fallback for slugs no editor provides (and for
  //    machines without editors installed, e.g. devbox).
  if (existsSync(LOCAL_THEMES)) {
    for (const f of readdirSync(LOCAL_THEMES)) {
      if (!f.endsWith(".json")) continue;
      const path = join(LOCAL_THEMES, f);
      let appearance: "dark" | "light" = "dark";
      try { appearance = (JSON5.parse(readFileSync(path, "utf8")).type as "dark" | "light") ?? "dark"; } catch {}
      const label = f.replace(/\.json$/, "");
      add({ label, slug: slugify(label), appearance, path, source: "local" });
    }
  }

  return out.sort((a, b) => a.label.localeCompare(b.label));
}

export function resolveTheme(nameOrSlug: string): ThemeEntry | undefined {
  const want = slugify(nameOrSlug);
  return discover().find((e) => e.slug === want || e.slug === nameOrSlug || e.label === nameOrSlug);
}
