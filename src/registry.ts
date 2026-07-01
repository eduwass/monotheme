// Auto-discovery: every file in src/targets/ that default-exports a target is
// loaded here. There is no list to maintain — add a tool by dropping a file in
// src/targets/, and it just works. Files starting with "_" (e.g. _template.ts)
// are skipped.
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { Target } from "./target-kit.ts";

const dir = join(dirname(new URL(import.meta.url).pathname), "targets");

// Dev: auto-discover targets from disk (drop a file in src/targets/ and it works).
// Compiled binary: there's no targets/ dir on disk, so fall back to the generated
// static manifest (scripts/embed-targets.ts, produced by `bun run build:binary`).
async function loadTargets(): Promise<Target[]> {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.startsWith("_")).sort();
  } catch {
    return (await import("./targets.gen.ts")).GEN_TARGETS;
  }
  const mods = await Promise.all(files.map((f) => import(join(dir, f))));
  return mods.map((m, i) => {
    const t = m.default as Target | undefined;
    if (!t) throw new Error(`targets/${files[i]} must \`export default defineTarget({...})\``);
    return t;
  });
}

export const TARGETS: Target[] = await loadTargets();
