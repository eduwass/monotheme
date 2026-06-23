#!/usr/bin/env bun
// theme — one source of truth (a VSCode theme) projected into every tool.
//   theme list                 list installed + local themes
//   theme set <name>           project a theme to all targets + reload
//   theme current              show the active theme
//   theme init                 re-apply the active theme (run from shell rc)
//   theme check                self-check (no writes)
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execSync } from "node:child_process";
import { loadTheme, stripAlpha } from "./load.ts";
import { project } from "./project.ts";
import { discover, resolveTheme, slugify } from "./discover.ts";
import { TARGETS, peerThemeCommand } from "./targets.ts";
import { toTmTheme } from "./adapters/tmtheme.ts";
import { toGhostty } from "./adapters/ghostty.ts";

const STATE = resolve(dirname(new URL(import.meta.url).pathname), "..", ".state");
// the full resolved theme that's currently active — the portable unit we sync to
// the peer (which may not have the same themes installed) and re-apply on init.
const ACTIVE = resolve(dirname(new URL(import.meta.url).pathname), "..", ".active.json");
const [cmd, ...rest] = process.argv.slice(2);

// Resolve a `theme set` argument: a theme name/slug, OR a path to a theme JSON
// (used by cross-machine sync, where the peer may not have the theme installed).
function applyTheme(nameOrPath: string, opSilent = false): { slug: string; canonical: string } {
  let theme, entry;
  if (nameOrPath.endsWith(".json") && existsSync(nameOrPath)) {
    theme = loadTheme(nameOrPath);
    entry = { label: theme.name, slug: slugify(theme.name), appearance: theme.type, source: "file", path: nameOrPath };
  } else {
    const e = resolveTheme(nameOrPath);
    if (!e) { console.error(`theme: unknown theme '${nameOrPath}' (try: theme list)`); process.exit(1); }
    entry = e;
    theme = loadTheme(e.path);
  }
  const p = project(theme);
  if (p.warnings.length && !opSilent) for (const w of p.warnings) console.warn(`  ! ${w}`);

  for (const t of TARGETS) {
    if (t.mode === "manual") { if (!opSilent) console.log(`  - ${t.name} (manual, skipped)`); continue; }
    if (t.detect && !t.detect()) { if (!opSilent) console.log(`  · ${t.name} (not on this machine)`); continue; }
    if (t.apply) {
      let status: string;
      try { status = t.apply({ theme, entry }); } catch (e) { status = `${t.name} (error: ${(e as Error).message})`; }
      if (!opSilent) console.log(`  ✓ ${status}`);
      continue;
    }
    if (!t.dest || !t.render) continue;
    const dest = t.dest(theme);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, t.render(theme));
    if (t.reload) { try { execSync(t.reload(theme), { stdio: "ignore" }); } catch {} }
    if (!opSilent) console.log(`  ✓ ${t.name} → ${dest.replace(process.env.HOME ?? "", "~")}`);
  }
  writeFileSync(STATE, entry.slug + "\n");
  // canonical = the fully-resolved theme; portable across machines.
  const canonical = JSON.stringify({ name: theme.name, type: theme.type, colors: theme.colors, tokenColors: theme.tokenColors });
  writeFileSync(ACTIVE, canonical + "\n");
  // vendor editor-sourced themes into the repo's tracked themes/ dir so they're
  // version-controlled and discoverable on every machine (devbox has no editor
  // extensions). idempotent; commit via the normal dotfiles flow.
  if (entry.source !== "local" && entry.source !== "file") {
    const vendored = resolve(dirname(new URL(import.meta.url).pathname), "..", "themes", entry.slug + ".json");
    writeFileSync(vendored, JSON.stringify({ name: theme.name, type: theme.type, colors: theme.colors, tokenColors: theme.tokenColors }, null, 2) + "\n");
    if (!opSilent) console.log(`  ✓ vendored → themes/${entry.slug}.json (commit to track)`);
  }
  if (!opSilent) console.log(`\nset: ${theme.name} (${theme.type})`);
  return { slug: entry.slug, canonical };
}

// Mirror the switch to the peer machine by shipping the resolved theme itself
// (not just its name — the peer may not have it installed). Best-effort, non-blocking.
function propagate(canonical: string): void {
  const b64 = Buffer.from(canonical).toString("base64");
  const peer = peerThemeCommand(b64);
  if (!peer) return;
  try {
    execSync(peer.cmd, { stdio: "ignore", timeout: 30000 });
    console.log(`  ↪ synced ${peer.peer}`);
  } catch {
    console.log(`  · ${peer.peer} not synced (unreachable) — it'll match next time it's set there`);
  }
}

switch (cmd) {
  case "list": {
    const json = rest.includes("--json");
    const all = discover();
    if (json) { console.log(JSON.stringify(all, null, 2)); break; }
    const cur = existsSync(STATE) ? readFileSync(STATE, "utf8").trim() : "";
    for (const e of all) {
      const mark = e.slug === cur ? "*" : " ";
      console.log(`${mark} ${e.slug.padEnd(28)} ${e.appearance.padEnd(6)} ${e.source}`);
    }
    console.log(`\n${all.length} themes`);
    break;
  }
  case "set": {
    const args = rest.filter((r) => !r.startsWith("--"));
    if (!args[0]) { console.error("usage: theme set <name> [--no-propagate]"); process.exit(1); }
    const { canonical } = applyTheme(args[0]);
    // sync the peer machine unless told not to (the peer passes --no-propagate
    // back to avoid an echo loop).
    if (!rest.includes("--no-propagate")) propagate(canonical);
    break;
  }
  case "current": {
    if (!existsSync(STATE)) { console.log("(none)"); break; }
    console.log(readFileSync(STATE, "utf8").trim());
    break;
  }
  case "init": {
    // prefer the canonical .active.json (works even for themes not installed
    // here, e.g. an editor theme synced from the Mac); fall back to the slug.
    if (existsSync(ACTIVE)) applyTheme(ACTIVE, true);
    else if (existsSync(STATE)) applyTheme(readFileSync(STATE, "utf8").trim(), true);
    break;
  }
  case "check": {
    runCheck();
    break;
  }
  default:
    console.log("usage: theme <list|set|current|init|check> [name]");
    process.exit(cmd ? 1 : 0);
}

// ── self-check: known input -> expected output, no writes ───────────────────
function runCheck(): void {
  const sop = resolve(dirname(new URL(import.meta.url).pathname), "..", "themes", "shades-of-purple.json");
  const theme = loadTheme(sop);
  const fail: string[] = [];
  const ok = (cond: boolean, msg: string) => { if (!cond) fail.push(msg); };

  // load
  ok(theme.tokenColors.length > 100, `SoP should have >100 tokenColors, got ${theme.tokenColors.length}`);
  ok(theme.colors["editor.background"] === "#2D2B55", `editor.background ${theme.colors["editor.background"]}`);

  // projection: ANSI comes straight from terminal.ansi*
  const p = project(theme);
  ok(p.ansi.length === 16, "ansi must have 16 slots");
  ok(p.ansi[1] === stripAlpha(theme.colors["terminal.ansiRed"]!), `ansi[1] should equal terminal.ansiRed sans alpha (${stripAlpha(theme.colors["terminal.ansiRed"]!)}), got ${p.ansi[1]}`);
  ok(p.warnings.length === 0, "SoP defines ANSI — should not warn");

  // ghostty adapter
  const g = toGhostty(theme);
  ok(g.includes("palette = 0="), "ghostty output missing palette line");
  ok(g.includes(`background = ${p.bg}`), "ghostty output missing background");

  // tmTheme adapter -> valid plist with global background + scope rules
  const tm = toTmTheme(theme);
  ok(tm.startsWith("<?xml"), "tmTheme must be a plist XML");
  ok(tm.includes("<key>background</key>"), "tmTheme missing global background");
  ok(tm.includes("#2D2B55"), "tmTheme missing the bg color value");

  // ANSI-derive fallback path: a theme with no terminal.* must warn + still fill 16
  const noAnsi = { ...theme, colors: Object.fromEntries(Object.entries(theme.colors).filter(([k]) => !k.startsWith("terminal."))) };
  const pf = project(noAnsi as typeof theme);
  ok(pf.ansi.length === 16 && pf.ansi.every(Boolean), "derived ANSI must fill all 16");
  ok(pf.warnings.length > 0, "missing-ANSI theme must warn");

  if (fail.length) { console.error("CHECK FAILED:\n" + fail.map((f) => "  ✗ " + f).join("\n")); process.exit(1); }
  console.log(`check: ok (${theme.tokenColors.length} scopes, ${theme.colors["terminal.ansiRed"] ? "native" : "derived"} ANSI, tmTheme+ghostty valid)`);
}
