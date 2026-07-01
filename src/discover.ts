// Discover installed editor themes (Cursor/VSCode) by reading each extension's
// package.json -> contributes.themes[], plus any local theme/themes/*.json.
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import JSON5 from "json5";
import { REPO_THEMES, USER_THEMES } from "./paths.ts";

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

// User-installed editor extensions (third-party themes live here).
const USER_EXT_ROOTS = [
  join(homedir(), ".cursor", "extensions"),
  join(homedir(), ".vscode", "extensions"),
  join(homedir(), ".vscode-oss", "extensions"),   // VSCodium
  join(homedir(), ".windsurf", "extensions"),      // Windsurf
  join(homedir(), ".vscode-insiders", "extensions"),
];

// The editors' BUILT-IN themes ("Cursor Dark", "Dark Modern", "Default Dark+",
// Monokai, …) ship bundled inside the app install, not in the user extensions
// dir — same package.json → contributes.themes[] shape, different location.
function bundledExtRoots(): string[] {
  const roots: string[] = [];
  if (process.platform === "darwin") {
    for (const app of ["Cursor", "Visual Studio Code", "VSCodium", "Windsurf", "Visual Studio Code - Insiders"]) {
      roots.push(join("/Applications", `${app}.app`, "Contents", "Resources", "app", "extensions"));
    }
  } else if (process.platform === "win32") {
    const bases = [process.env.LOCALAPPDATA, process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter(Boolean) as string[];
    for (const b of bases) for (const app of ["Programs\\cursor", "Microsoft VS Code", "VSCodium", "Windsurf"]) {
      roots.push(join(b, app, "resources", "app", "extensions"));
    }
  } else {
    // linux: common package + tarball install prefixes.
    for (const base of ["/usr/share", "/opt", "/usr/lib"]) for (const app of ["code", "code-insiders", "cursor", "vscodium", "codium", "windsurf"]) {
      roots.push(join(base, app, "resources", "app", "extensions"));
    }
    roots.push(join(homedir(), ".local", "share", "cursor", "resources", "app", "extensions"));
  }
  return roots;
}

const EXT_ROOTS = [...USER_EXT_ROOTS, ...bundledExtRoots()];

export function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Theme libraries on disk: the config-home user/vendored dir (authoritative for
// user data) plus the shipped default library. Scanned in that order.
const THEME_DIRS = [USER_THEMES, REPO_THEMES];

// Built-in editor themes label themselves with a localization placeholder
// (e.g. "%darkModernThemeLabel%") that resolves via the extension's
// package.nls.json. Resolve those to their human name; leave plain labels as-is.
function resolveNls(extDir: string, label: string): string {
  const m = /^%(.+)%$/.exec(label);
  if (!m) return label;
  for (const f of ["package.nls.json", "package.nls.en.json"]) {
    const p = join(extDir, f);
    if (!existsSync(p)) continue;
    try {
      const nls = JSON5.parse(readFileSync(p, "utf8"));
      const v = nls[m[1]!];
      // entries can be a string or { message: string }
      const s = typeof v === "string" ? v : v?.message;
      if (typeof s === "string" && s.trim()) return s;
    } catch { /* fall through */ }
  }
  return label; // unresolved — better a raw label than crashing
}

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
        const rawLabel = th.label ?? th.id ?? th.path;
        const label = resolveNls(join(root, ext), rawLabel);
        const appearance: "dark" | "light" = th.uiTheme === "vs" ? "light" : "dark";
        add({ label, slug: slugify(label), appearance, path, source: ext });
      }
    }
  }

  // 2) on-disk theme libraries — fallback for slugs no editor provides (and for
  //    machines without editors installed, e.g. a headless server). User/vendored
  //    themes (config home) take precedence over the shipped defaults.
  for (const dir of THEME_DIRS) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      const path = join(dir, f);
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
