// Auto-discovery: every file in src/targets/ that default-exports a target is
// loaded here. There is no list to maintain — add a tool by dropping a file in
// src/targets/, and it just works. Files starting with "_" (e.g. _template.ts)
// are skipped.
//
// User adapters: the same contract works OUTSIDE the repo — drop a .ts file in
// ~/.config/monotheme/targets/ and it's loaded after the built-ins. A user target
// with the same `name` as a built-in REPLACES it (override), so you can re-skin a
// stock adapter without forking. This is how you theme personal tools (sketchybar,
// a dashboard, …) without your file having to live upstream.
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { defineTarget, type Target } from "./target-kit.ts";
import { USER_TARGETS } from "./paths.ts";

const dir = join(dirname(new URL(import.meta.url).pathname), "targets");

async function loadDir(d: string, required: boolean): Promise<Target[]> {
  let files: string[];
  try {
    files = readdirSync(d).filter((f) => f.endsWith(".ts") && !f.startsWith("_")).sort();
  } catch {
    if (required) throw new Error("no targets dir");
    return [];
  }
  const out: Target[] = [];
  for (const f of files) {
    try {
      const t = (await import(join(d, f))).default as Target | undefined;
      if (!t) throw new Error("no default export");
      // user files export a PLAIN object (they can't import defineTarget from the
      // config dir) — validate it here so they get the same clear errors.
      out.push(defineTarget(t));
    } catch (e) {
      if (required) throw new Error(`targets/${f} must \`export default defineTarget({...})\``);
      // user adapters are best-effort: a broken file warns, never bricks `theme set`
      console.warn(`  ! user target ${f} skipped: ${(e as Error).message}`);
    }
  }
  return out;
}

// Dev: auto-discover built-ins from disk (drop a file in src/targets/ and it works).
// Compiled binary: there's no targets/ dir on disk, so fall back to the generated
// static manifest (scripts/embed-targets.ts, produced by `bun run build:binary`).
// User targets from ~/.config/monotheme/targets/ load in BOTH modes (bun transpiles
// .ts at import time, even inside a compiled binary).
async function loadTargets(): Promise<Target[]> {
  let builtin: Target[];
  try {
    builtin = await loadDir(dir, true);
  } catch (e) {
    if ((e as Error).message !== "no targets dir") throw e;
    builtin = (await import("./targets.gen.ts")).GEN_TARGETS;
  }
  const user = await loadDir(USER_TARGETS, false);
  const byName = new Map(builtin.map((t) => [t.name, t]));
  for (const t of user) byName.set(t.name, t); // same name → user wins
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export const TARGETS: Target[] = await loadTargets();
