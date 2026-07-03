// monotheme's own config home — its single self-owned directory. Everything the
// tool reads/writes at runtime (active-theme state, resolved theme, fonts, and
// user/vendored themes) lives here, decoupled from the clone location so it
// survives re-clones and works when monotheme is a redistributable binary.
//   ~/.config/monotheme/            (XDG_CONFIG_HOME-aware; %APPDATA% on win)
//     state          active theme slug        (per-machine)
//     active.json    resolved theme           (per-machine)
//     fonts.json     font axis                (per-machine, never synced)
//     themes/        vendored + user themes   (syncable if you want)
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { existsSync, mkdirSync, renameSync, copyFileSync, rmSync, writeFileSync } from "node:fs";

const HOME = homedir();
const cfgRoot =
  process.env.XDG_CONFIG_HOME ||
  (process.platform === "win32"
    ? process.env.APPDATA || join(HOME, "AppData", "Roaming")
    : join(HOME, ".config"));

export const CONFIG_HOME = join(cfgRoot, "monotheme");
export const STATE = join(CONFIG_HOME, "state");
export const ACTIVE = join(CONFIG_HOME, "active.json");
export const FONTS = join(CONFIG_HOME, "fonts.json");
export const USER_THEMES = join(CONFIG_HOME, "themes");
export const USER_TARGETS = join(CONFIG_HOME, "targets");
export const PAIR = join(CONFIG_HOME, "pair.json");
export const RAYCAST_IMPORTED = join(CONFIG_HOME, "raycast-imported.json");
export const WATCH_SCRIPT = join(CONFIG_HOME, "watch-appearance.sh");
export const WATCH_LOG = join(CONFIG_HOME, "watch.log");
export const WATCH_PLIST = join(HOME, "Library", "LaunchAgents", "com.eduwass.monotheme.watch.plist");
export const WATCH_LABEL = "com.eduwass.monotheme.watch";

// The curated default library shipped with the source (later embedded in the
// binary). Read-only source, not a runtime write path.
export const REPO_THEMES = resolve(dirname(new URL(import.meta.url).pathname), "..", "themes");

// Legacy clone-root locations (pre config-home). Kept only for one-time migration.
const CLONE_ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const LEGACY = [
  [join(CLONE_ROOT, ".state"), STATE],
  [join(CLONE_ROOT, ".active.json"), ACTIVE],
] as const;

/** One-time, silent migration of clone-root state files into the config home.
 *  Runs on every invocation but only acts when an old file exists and the new
 *  one doesn't — so it's a no-op after the first run. */
export function migrateConfigHome(): void {
  for (const [old, dest] of LEGACY) {
    if (!existsSync(old) || existsSync(dest)) continue;
    mkdirSync(dirname(dest), { recursive: true });
    try {
      renameSync(old, dest); // fast path: same filesystem
    } catch {
      try { copyFileSync(old, dest); rmSync(old); } catch {} // cross-fs fallback
    }
  }
}

/** In a compiled binary there's no themes/ dir on disk, so materialise the
 *  embedded default library into the config home on first run. No-op in a source
 *  checkout (REPO_THEMES exists) — and the 383KB embedded module is only imported
 *  in the binary case, keeping dev startup lean. */
export async function hydrateDefaults(): Promise<void> {
  if (existsSync(REPO_THEMES)) return;
  const { EMBEDDED_THEMES } = await import("./embedded-themes.gen.ts");
  mkdirSync(USER_THEMES, { recursive: true });
  for (const [slug, theme] of Object.entries(EMBEDDED_THEMES)) {
    const dest = join(USER_THEMES, slug + ".json");
    if (!existsSync(dest)) writeFileSync(dest, JSON.stringify(theme, null, 2) + "\n");
  }
}
