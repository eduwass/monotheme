#!/usr/bin/env bun
// theme — one source of truth (a VSCode theme) projected into every tool.
//   theme list                 list installed + local themes
//   theme set <name>           project a theme to all targets + reload
//   theme current              show the active theme
//   theme init                 re-apply the active theme (run from shell rc)
//   theme raycast              open the active theme as a Raycast import (one click)
//   theme check                self-check (no writes)
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { loadTheme, stripAlpha } from "./load.ts";
import { project } from "./project.ts";
import { discover, resolveTheme, slugify } from "./discover.ts";
import { TARGETS } from "./registry.ts";
import { peerThemeCommand } from "./sync.ts";
import { makeCtx, applyTarget } from "./target-kit.ts";
import { toTmTheme } from "./formats/tmtheme.ts";
import { toGhostty } from "./targets/ghostty.ts";
import { raycastImportUrl } from "./formats/raycast.ts";
import { STATE, ACTIVE, FONTS, USER_THEMES, REPO_THEMES, CONFIG_HOME, migrateConfigHome, hydrateDefaults } from "./paths.ts";
import { loadFonts, resolveFont, FONT_ROLES, type FontRole, type FontsConfig } from "./fonts.ts";
import { catalogWithStatus, findFont, installFont, resolveFamily } from "./fonts-catalog.ts";
import JSON5 from "json5";

// One-time move of legacy clone-root state into ~/.config/monotheme/ (no-op after),
// and, in a compiled binary, materialise the embedded default themes.
migrateConfigHome();
await hydrateDefaults();
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
  // many editor themes omit the `type` field (light/dark lives in the extension's
  // uiTheme, which discovery captured as entry.appearance) — trust that.
  theme.type = entry.appearance as "dark" | "light";
  const p = project(theme);
  if (p.warnings.length && !opSilent) for (const w of p.warnings) console.warn(`  ! ${w}`);

  const ctx = makeCtx(theme, p, entry, loadFonts());
  for (const t of TARGETS) {
    const r = applyTarget(t, ctx);
    if (!opSilent) console.log(`  ${r.present ? (r.ok ? "✓" : "✗") : "·"} ${r.status}`);
  }
  mkdirSync(CONFIG_HOME, { recursive: true });
  writeFileSync(STATE, entry.slug + "\n");
  // canonical = the fully-resolved theme; portable across machines.
  const canonical = JSON.stringify({ name: theme.name, type: theme.type, colors: theme.colors, tokenColors: theme.tokenColors });
  writeFileSync(ACTIVE, canonical + "\n");
  // vendor editor-sourced themes into the config-home themes/ dir so they're
  // discoverable on every machine (e.g. servers with no editor extensions
  // installed) and available even once monotheme is a standalone binary.
  // Only vendor ONCE (when missing) — rewriting on every switch reserializes the
  // file, stripping authored comments and reordering keys. A present vendored
  // copy is already the source of truth.
  if (entry.source !== "local" && entry.source !== "file") {
    const vendored = join(USER_THEMES, entry.slug + ".json");
    if (!existsSync(vendored)) {
      mkdirSync(USER_THEMES, { recursive: true });
      writeFileSync(vendored, JSON.stringify({ name: theme.name, type: theme.type, colors: theme.colors, tokenColors: theme.tokenColors }, null, 2) + "\n");
      if (!opSilent) console.log(`  ✓ vendored → ${vendored.replace(process.env.HOME || "~", "~")}`);
    }
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
  case "raycast": {
    // Raycast stores themes in an encrypted DB (no silent write), so the only
    // sanctioned apply path is its import deeplink — one confirm click. Build it
    // from the active theme and open it. Raycast is macOS-only; elsewhere we just
    // print the URL to open on a Mac.
    let theme;
    if (existsSync(ACTIVE)) theme = loadTheme(ACTIVE);
    else if (existsSync(STATE)) theme = loadTheme(resolveTheme(readFileSync(STATE, "utf8").trim())!.path);
    else { console.error("theme: no active theme (run: theme set <name>)"); process.exit(1); }
    const url = raycastImportUrl(theme);
    if (process.platform !== "darwin") { console.log(`raycast: open this on your Mac to import:\n  ${url}`); break; }
    try { execSync(`open '${url}'`, { stdio: "ignore" }); console.log(`raycast: opened import for ${theme.name} — confirm in Raycast`); }
    catch { console.log(`raycast: open this to import:\n  ${url}`); }
    break;
  }
  case "sync": {
    // Eagerly vendor every discovered editor theme into the config-home themes/
    // dir, so they're available offline and on a headless peer without having to
    // `set` each one first. Idempotent: skips ones already vendored.
    mkdirSync(USER_THEMES, { recursive: true });
    let n = 0;
    for (const e of discover()) {
      if (e.source === "local") continue; // already on disk
      const dest = join(USER_THEMES, e.slug + ".json");
      if (existsSync(dest)) continue;
      try {
        const t = loadTheme(e.path);
        t.type = e.appearance as "dark" | "light";
        writeFileSync(dest, JSON.stringify({ name: t.name, type: t.type, colors: t.colors, tokenColors: t.tokenColors }, null, 2) + "\n");
        console.log(`  ✓ ${e.slug}`);
        n++;
      } catch { console.log(`  ✗ ${e.slug} (unreadable)`); }
    }
    console.log(`\nsynced ${n} theme(s) → ${USER_THEMES.replace(process.env.HOME || "~", "~")}`);
    break;
  }
  case "preview": {
    // render a code-sample preview card (SVG) for any theme — works for custom /
    // local themes too, since it's generated from the theme's own colors.
    const { toPreviewSvg } = await import("./preview.ts");
    const arg = rest.find((r) => !r.startsWith("--"));
    let theme;
    if (arg) {
      const e = resolveTheme(arg);
      if (!e) { console.error(`theme: unknown theme '${arg}' (try: theme list)`); process.exit(1); }
      theme = loadTheme(e.path); theme.type = e.appearance as "dark" | "light";
    } else if (existsSync(ACTIVE)) theme = loadTheme(ACTIVE);
    else { console.error("theme: no theme given and none active"); process.exit(1); }
    const dir = join(CONFIG_HOME, "previews");
    if (rest.includes("--all")) {
      // generate previews for every discovered theme; print {slug: path} for the
      // Raycast grid to consume in one shot.
      mkdirSync(dir, { recursive: true });
      const map: Record<string, string> = {};
      for (const e of discover()) {
        try {
          const th = loadTheme(e.path); th.type = e.appearance as "dark" | "light";
          const out = join(dir, e.slug + ".svg");
          writeFileSync(out, toPreviewSvg(th));
          map[e.slug] = out;
        } catch { /* skip unreadable */ }
      }
      console.log(JSON.stringify(map));
      break;
    }
    const svg = toPreviewSvg(theme);
    if (rest.includes("--stdout")) { process.stdout.write(svg); break; }
    mkdirSync(dir, { recursive: true });
    const out = join(dir, slugify(theme.name) + ".svg");
    writeFileSync(out, svg);
    console.log(out);
    break;
  }
  case "browse": {
    // search the VS Code Marketplace for themes (the source vscodethemes.com indexes)
    const q = rest.filter((r) => !r.startsWith("--")).join(" ");
    if (!q) { console.error('usage: theme browse "<query>"   then: theme add <publisher.extension>'); process.exit(1); }
    const { searchThemes } = await import("./market.ts");
    try {
      const hits = await searchThemes(q);
      if (rest.includes("--json")) { console.log(JSON.stringify(hits)); break; }
      if (!hits.length) { console.log(`no theme extensions match '${q}'`); break; }
      for (const h of hits) {
        console.log(`  ${h.id.padEnd(42)} ${(h.installs.toLocaleString() + " installs").padStart(16)}  ${h.displayName}`);
      }
      console.log(`\nadd one with:  theme add <publisher.extension>`);
    } catch (e) { console.error(`theme browse: ${(e as Error).message}`); process.exit(1); }
    break;
  }
  case "add": {
    const id = rest.find((r) => !r.startsWith("--"));
    if (!id) { console.error("usage: theme add <publisher.extension>   (find ids via: theme browse <query>)"); process.exit(1); }
    const { addExtension } = await import("./market.ts");
    try {
      console.log(`fetching ${id}…`);
      const { added, label } = await addExtension(id);
      for (const s of added) console.log(`  ✓ ${s}`);
      console.log(`\nadded ${added.length} theme(s) from ${label} → ~/.config/monotheme/themes/`);
      console.log(`set one with:  theme set ${added[0]}`);
    } catch (e) { console.error(`theme add: ${(e as Error).message}`); process.exit(1); }
    break;
  }
  case "font": {
    runFont(rest);
    break;
  }
  case "check": {
    runCheck();
    break;
  }
  default:
    console.log("usage: theme <list|set|current|init|sync|browse|add|font|raycast|check> [name]");
    process.exit(cmd ? 1 : 0);
}

// ── fonts: the orthogonal font axis (family + size per role) ─────────────────
//   theme font                      show the current font config
//   theme font show                 (same)
//   theme font set <role> <family> [size]
//   theme font set <role> --size <n>
// Roles: mono (base) · editor · terminal · ui. Edits ~/.config/monotheme/fonts.json
// then re-applies the active theme so font changes land immediately.
function runFont(argv: string[]): void {
  const sub = argv[0] ?? "show";
  const fonts: FontsConfig = existsSync(FONTS) ? (JSON5.parse(readFileSync(FONTS, "utf8")) as FontsConfig) : {};

  if (sub === "show") {
    if (rest.includes("--json") || argv.includes("--json")) {
      // stable shape for the Raycast extension: resolved family/size per role,
      // plus whether the role is explicitly configured vs inherited from mono.
      const data = FONT_ROLES.map((role) => {
        const r = resolveFont(fonts, role);
        return { role, family: r.family ?? null, size: r.size ?? null, configured: fonts[role] !== undefined };
      });
      console.log(JSON.stringify(data));
      return;
    }
    if (!existsSync(FONTS)) { console.log("(no fonts.json — fonts are opt-in; try: theme font set mono \"Berkeley Mono\" 13)"); return; }
    for (const role of FONT_ROLES) {
      const r = resolveFont(fonts, role);
      const raw = fonts[role];
      const set = raw !== undefined ? "" : "  (inherited)";
      console.log(`  ${role.padEnd(9)} ${(r.family ?? "—")}${r.size != null ? `  ${r.size}` : ""}${set}`);
    }
    return;
  }

  if (sub === "catalog") {
    const cat = catalogWithStatus();
    if (rest.includes("--json") || argv.includes("--json")) { console.log(JSON.stringify(cat)); return; }
    const nfOnly = rest.includes("--nerd") || argv.includes("--nerd");
    for (const f of cat) {
      if (nfOnly && !f.hasNerdFont) continue;
      console.log(`  ${f.installed ? "✓" : "⤓"} ${f.id.padEnd(18)} ${f.name}${f.hasNerdFont ? "  ◆NF" : ""}${f.ligatures ? "  ~lig" : ""}`);
    }
    console.log(`\n${cat.length} fonts · ✓ installed · ⤓ available · ◆NF has Nerd Font (theme font install <id>)`);
    return;
  }

  if (sub === "install") {
    const font = findFont(argv[1] ?? "");
    if (!font) { console.error(`theme font: unknown font '${argv[1]}' (try: theme font catalog)`); process.exit(1); }
    console.log(`installing ${font.name}${font.nerdFont ? " (Nerd Font variant)" : ""}…`);
    try {
      const r = installFont(font);
      console.log(`  ✓ installed ${font.name} via ${r.method}`);
    } catch (e) {
      console.error(`theme font install: ${(e as Error).message}`);
      process.exit(1);
    }
    return;
  }

  if (sub === "set") {
    // Role is OPTIONAL. `theme font set <family> [size]` sets `mono` — the base
    // that every surface inherits, i.e. changes the font *everywhere* (matches
    // monotheme's one-switch philosophy). `theme font set <role> <family> [size]`
    // is the drill-down for a single surface.
    let a = argv.slice(1);
    let role: FontRole = "mono";
    if (a[0] && (FONT_ROLES as string[]).includes(a[0])) { role = a[0] as FontRole; a = a.slice(1); }

    let size: number | undefined;
    const sizeFlag = a.indexOf("--size");
    if (sizeFlag !== -1) { size = Number(a[sizeFlag + 1]); a.splice(sizeFlag, 2); }
    const positional = a.filter((x) => !x.startsWith("--"));
    let family: string | undefined = positional[0];
    if (size === undefined && positional[1] !== undefined && /^\d+(\.\d+)?$/.test(positional[1])) size = Number(positional[1]);
    if (family === "") family = undefined;
    // DWIM: a catalog id/name resolves to its Nerd-Font-preferred family string.
    if (family !== undefined) family = resolveFamily(family);
    if (family === undefined && size === undefined) {
      console.error(`usage: theme font set "<family>" [size]            # everywhere\n       theme font set <${FONT_ROLES.join("|")}> "<family>" [size]`);
      process.exit(1);
    }

    // merge into the existing spec (preserve the field you're not setting).
    const prev = fonts[role];
    const prevSpec = typeof prev === "string" ? { family: prev } : { ...(prev ?? {}) };
    if (family !== undefined) prevSpec.family = family;
    if (size !== undefined) prevSpec.size = size;
    fonts[role] = prevSpec;

    mkdirSync(CONFIG_HOME, { recursive: true });
    writeFileSync(FONTS, JSON.stringify(fonts, null, 2) + "\n");
    console.log(`font: ${role}${role === "mono" ? " (everywhere)" : ""} → ${prevSpec.family ?? "(inherit)"}${prevSpec.size != null ? ` ${prevSpec.size}` : ""}`);

    // re-apply the active theme so the font change lands now.
    if (existsSync(ACTIVE)) applyTheme(ACTIVE, true);
    else if (existsSync(STATE)) applyTheme(readFileSync(STATE, "utf8").trim(), true);
    console.log("  ✓ applied");
    return;
  }

  console.error("usage: theme font [show | set [<role>] \"<family>\" [size] | catalog | install <id>]");
  process.exit(1);
}

// ── self-check: known input -> expected output, no writes ───────────────────
function runCheck(): void {
  const sop = join(REPO_THEMES, "shades-of-purple.json");
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

  // fonts: independent family/size resolution with mono-fallback
  const fc: FontsConfig = { mono: { family: "Mono", size: 13 }, editor: { size: 14 }, terminal: "TermFont" };
  const ed = resolveFont(fc, "editor");
  ok(ed.family === "Mono" && ed.size === 14, `editor should inherit mono family + own size, got ${JSON.stringify(ed)}`);
  const term = resolveFont(fc, "terminal");
  ok(term.family === "TermFont" && term.size === 13, `terminal (string shorthand) should keep family + inherit mono size, got ${JSON.stringify(term)}`);
  ok(Object.keys(resolveFont(null, "editor")).length === 0, "no fonts.json → resolveFont must return {} (opt-out)");

  if (fail.length) { console.error("CHECK FAILED:\n" + fail.map((f) => "  ✗ " + f).join("\n")); process.exit(1); }
  console.log(`check: ok (${theme.tokenColors.length} scopes, ${theme.colors["terminal.ansiRed"] ? "native" : "derived"} ANSI, tmTheme+ghostty valid, fonts resolve)`);
}
