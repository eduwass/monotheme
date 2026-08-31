#!/usr/bin/env bun
// Where does `theme set` spend its time? Replays applyTheme() phase by phase with
// a stopwatch, and times each reload signal individually. Writes real configs
// (same as `theme set`), never propagates. Usage: bun scripts/bench-set.ts [theme]
const T0 = performance.now(); let last = T0; const phases: [string, number][] = [];
const mark = (n: string) => { const now = performance.now(); phases.push([n, now - last]); last = now; };
import { spawn } from "node:child_process";
mark("import node builtins");
const { loadTheme } = await import("../src/load.ts");
const { project } = await import("../src/project.ts");
const { resolveTheme } = await import("../src/discover.ts");
const { TARGETS } = await import("../src/registry.ts");
const { makeCtx, applyTarget } = await import("../src/target-kit.ts");
const { loadFonts } = await import("../src/fonts.ts");
await import("../src/preview.ts"); // cli.ts pulls satori in eagerly — count it
mark("import src/* (transpile + module init)");

const name = process.argv[2] ?? "tokyo-night";
const entry = resolveTheme(name);
if (!entry) { console.error(`unknown theme '${name}'`); process.exit(1); }
mark("resolveTheme (discovery scan of every theme file)");
const theme = loadTheme(entry.path); theme.type = entry.appearance as "dark" | "light"; mark("loadTheme");
const palette = project(theme); mark("project (palette derivation)");

// reload signals: intercept ctx.run so each command is timed on its own.
const reloads: Promise<[string, string, number]>[] = [];
const ctx = makeCtx(theme, palette, entry, loadFonts(), "monotheme");
let current = "";
ctx.run = (cmd) => {
  const t = current, a = performance.now();
  reloads.push(new Promise((r) => { const ch = spawn(cmd, { shell: true, stdio: "ignore" }); const d = () => r([t, cmd, performance.now() - a]); ch.on("exit", d); ch.on("error", d); }));
};
const perTarget: [string, number][] = []; let skipped = 0;
for (const t of TARGETS) { current = t.name; const a = performance.now(); const r = applyTarget(t, ctx); r.present ? perTarget.push([t.name, performance.now() - a]) : skipped++; }
mark(`render+write ${perTarget.length} targets (${skipped} not on this machine) + spawn reloads`);
const done = await Promise.all(reloads); mark(`wait for ${done.length} reload signals`);
const total = performance.now() - T0;

const row = (n: string, ms: number) => console.log(`${ms.toFixed(0).padStart(6)}ms  ${n}`);
console.log("phases (sequential):"); for (const [n, ms] of phases) row(n, ms); row("TOTAL inside bun (add ~bun boot: `time bun -e 1`)", total);
console.log("\nrender+write per target (compute — the only part a rewrite speeds up):"); for (const [n, ms] of perTarget.sort((a, b) => b[1] - a[1]).slice(0, 8)) row(n, ms);
console.log("\nreload signals (concurrent; wall = slowest):"); for (const [t, cmd, ms] of done.sort((a, b) => b[2] - a[2])) row(`${t.padEnd(10)} ${cmd.replace(/\s+/g, " ").slice(0, 90)}`, ms);
