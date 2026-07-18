// The target API. A "target" teaches monotheme how to theme ONE tool. Drop a file
// in src/targets/ that `export default defineTarget({...})` — the registry finds it
// automatically (no list to maintain). Everything platform-specific (where configs
// live, how to reload) goes through the OS-aware Ctx below, so you never hardcode a
// path for one OS. See docs/ADAPTERS.md for the full guide + a copy-paste template.
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { execSync, spawn } from "node:child_process";
import type { VscodeTheme } from "./load.ts";
import type { Projection } from "./project.ts";
import type { ThemeEntry } from "./discover.ts";
import { patchJsonStringKey } from "./util.ts";
import { resolveFont, type FontsConfig, type FontRole, type FontSpec } from "./fonts.ts";

export type OS = "mac" | "linux" | "win";

/** Everything a target needs, with OS-correct path helpers so you never branch on
 *  the platform for file locations. Passed to every function on a target. */
export interface Ctx {
  // --- platform ---
  os: OS;
  mac: boolean;
  linux: boolean;
  win: boolean;

  // --- the theme, ready to use ---
  /** the raw VSCode theme (colors{} + tokenColors[]). */
  theme: VscodeTheme;
  /** the projected palette: bg, fg, ansi[0..15], accent, selection, cursor, … —
   *  most tools only need this. */
  palette: Projection;
  /** the stable slot name ("monotheme") tools point their config at, once. */
  slot: string;
  /** discovery info for the active theme (label/source) — for editor selectors. */
  entry: ThemeEntry;

  // --- OS-aware paths (resolve per platform; never hardcode ~/.config) ---
  /** XDG config dir: linux/mac → ~/.config/… · win → %APPDATA%\… */
  config(...p: string[]): string;
  /** mac → ~/Library/Application Support/… · linux/win → config dir. */
  appSupport(...p: string[]): string;
  /** XDG data dir per-OS. */
  data(...p: string[]): string;
  /** ~/… */
  home(...p: string[]): string;

  // --- checks ---
  /** does this path exist? */
  has(path: string): boolean;
  /** is this command on PATH? (e.g. c.hasCmd("nvim")) */
  hasCmd(cmd: string): boolean;

  // --- side effects (for `build`) ---
  /** mkdir -p + write a file. */
  write(path: string, content: string): void;
  /** read a file, or "" if it doesn't exist. */
  read(path: string): string;
  /** run a shell command; errors are swallowed (so an absent app is a no-op). */
  run(cmd: string): void;
  /** set one top-level JSON key (string or number) in place (preserves the rest). */
  setJson(file: string, key: string, value: string | number): boolean;

  // --- fonts (orthogonal axis; empty {} when fonts.json is absent → no-op) ---
  /** resolve a font role to { family?, size? } with mono-fallback. Returns {}
   *  when fonts are unconfigured, so targets naturally write nothing. */
  font(role: FontRole): FontSpec;
}

/** A target = how to theme one tool. Pick ONE of two shapes:
 *  - simple : `file` + `render` (+ optional `reload`)  — engine writes & reloads for you.
 *  - custom : `build`                                   — you do it (multiple files / logic).
 *  Optionally gate either with `detect` so it's skipped when the tool isn't installed. */
export interface Target {
  /** unique tool id, lowercase, e.g. "ghostty". Shown in `theme set` output. */
  name: string;
  /** present on this machine? Skipped cleanly when false. Default: always run. */
  detect?: (c: Ctx) => boolean;

  // simple shape:
  /** absolute path to write to (use c.config(...) etc). */
  file?: (c: Ctx) => string;
  /** the file's contents. */
  render?: (c: Ctx) => string;
  /** optional shell command to live-reload the running app. Errors are swallowed. */
  reload?: (c: Ctx) => string;

  // custom shape:
  /** do everything yourself (multiple files, signals, JSON patches). Return a
   *  short status detail for the `theme set` output. */
  build?: (c: Ctx) => string;
}

/** Identity wrapper that type-checks your target and fails loudly on obvious
 *  mistakes (so you find out at load time, not silently at runtime). */
export function defineTarget(t: Target): Target {
  const where = t.name ? `target '${t.name}'` : "target";
  if (!t.name || typeof t.name !== "string") throw new Error(`${where}: needs a string 'name'`);
  const simple = !!(t.file || t.render);
  const custom = !!t.build;
  if (simple && custom) throw new Error(`${where}: use EITHER file+render OR build — not both`);
  if (!simple && !custom) throw new Error(`${where}: set file+render (simple) or build (custom)`);
  if (simple && !(t.file && t.render)) throw new Error(`${where}: 'file' and 'render' must be set together`);
  return t;
}

const HOME = homedir();
const osOf = (): OS => (process.platform === "darwin" ? "mac" : process.platform === "win32" ? "win" : "linux");

/** Build the context for one theme application. When `pending` is given, `run`
 *  commands (reload signals) are spawned concurrently and collected there instead
 *  of blocking one-by-one — await Promise.all(pending) after applying all targets
 *  so every app repaints at once rather than in serial order. */
export function makeCtx(theme: VscodeTheme, palette: Projection, entry: ThemeEntry, fonts: FontsConfig | null = null, slot = "monotheme", pending?: Promise<void>[]): Ctx {
  const os = osOf();
  const cfgRoot = process.env.XDG_CONFIG_HOME || (os === "win" ? process.env.APPDATA || join(HOME, "AppData", "Roaming") : join(HOME, ".config"));
  const dataRoot = process.env.XDG_DATA_HOME || (os === "win" ? process.env.LOCALAPPDATA || join(HOME, "AppData", "Local") : join(HOME, ".local", "share"));
  const appSupportRoot = os === "mac" ? join(HOME, "Library", "Application Support") : cfgRoot;
  return {
    os, mac: os === "mac", linux: os === "linux", win: os === "win",
    theme, palette, slot, entry,
    config: (...p) => join(cfgRoot, ...p),
    appSupport: (...p) => join(appSupportRoot, ...p),
    data: (...p) => join(dataRoot, ...p),
    home: (...p) => join(HOME, ...p),
    has: (path) => existsSync(path),
    hasCmd: (cmd) =>
      typeof Bun !== "undefined"
        ? Bun.which(cmd) !== null // no subprocess — ~100x faster than shelling out per detect
        : (() => { try { execSync(`command -v ${cmd}`, { stdio: "ignore" }); return true; } catch { return false; } })(),
    write: (path, content) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); },
    read: (path) => { try { return readFileSync(path, "utf8"); } catch { return ""; } },
    run: (cmd) => {
      if (!pending) { try { execSync(cmd, { stdio: "ignore" }); } catch {} return; }
      pending.push(new Promise<void>((res) => {
        const ch = spawn(cmd, { shell: true, stdio: "ignore" });
        // cap a hung reload at 15s (execSync had no cap at all); errors stay swallowed.
        const t = setTimeout(() => { try { ch.kill("SIGKILL"); } catch {} }, 15000);
        const done = () => { clearTimeout(t); res(); };
        ch.on("error", done);
        ch.on("exit", done);
      }));
    },
    setJson: (file, key, value) => patchJsonStringKey(file, key, value),
    font: (role) => resolveFont(fonts, role),
  };
}

export interface TargetResult {
  name: string;
  /** false when detect() said the tool isn't on this machine (skipped, not failed). */
  present: boolean;
  ok: boolean;
  /** one-line summary for the CLI. */
  status: string;
}

/** Run one target. Never throws — failures are captured into the result so one
 *  broken tool can't abort the whole switch. */
export function applyTarget(t: Target, c: Ctx): TargetResult {
  if (t.detect && !t.detect(c)) return { name: t.name, present: false, ok: true, status: `${t.name} (not on this machine)` };
  try {
    if (t.build) {
      const detail = t.build(c);
      return { name: t.name, present: true, ok: true, status: detail ? `${t.name} → ${detail}` : t.name };
    }
    const path = t.file!(c);
    c.write(path, t.render!(c));
    if (t.reload) c.run(t.reload(c));
    return { name: t.name, present: true, ok: true, status: `${t.name} → ${path.replace(HOME, "~")}` };
  } catch (e) {
    return { name: t.name, present: true, ok: false, status: `${t.name} (error: ${(e as Error).message})` };
  }
}
