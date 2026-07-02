#!/usr/bin/env bun
// theme — one source of truth (a VSCode theme) projected into every tool.
//   theme list                 list installed + local themes
//   theme set <name>           project a theme to all targets + reload
//   theme current              show the active theme
//   theme init                 re-apply the active theme (run from shell rc)
//   theme raycast              open the active theme as a Raycast import (one click)
//   theme check                self-check (no writes)
//   theme pair set <light> <dark>   remember which theme goes with which appearance
//   theme auto                 apply the pair-matching theme for the current system appearance
//   theme watch install         switch automatically as macOS appearance changes (launchd)
import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
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
import { STATE, ACTIVE, FONTS, USER_THEMES, REPO_THEMES, CONFIG_HOME, PAIR, WATCH_SCRIPT, WATCH_LOG, WATCH_PLIST, WATCH_LABEL, migrateConfigHome, hydrateDefaults } from "./paths.ts";
import { loadFonts, resolveFont, FONT_ROLES, type FontRole, type FontsConfig } from "./fonts.ts";
import { catalogWithStatus, findFont, installFont, resolveFamily } from "./fonts-catalog.ts";
import { toPreviewSvg } from "./preview.ts";
import { dominantColor } from "./color.ts";
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

// A Marketplace theme is only colour DATA for terminals/etc.; Cursor/VSCode need
// the theme as an installed extension for `workbench.colorTheme` to resolve, so we
// install it into whichever editors are present. We resolve the REAL app-bundle
// binaries (not PATH — `code` is often aliased to `cursor`), install from the local
// .vsix (works even for Cursor's OpenVSX gallery), and parse output for failure
// (Cursor's CLI exits 0 even when an install fails).
function editorBins(): { name: string; bin: string }[] {
  const home = process.env.HOME || "";
  const candidates = [
    { name: "Cursor", bins: ["/Applications/Cursor.app/Contents/Resources/app/bin/cursor", `${home}/Applications/Cursor.app/Contents/Resources/app/bin/cursor`, "/usr/share/cursor/bin/cursor", "/opt/cursor/bin/cursor"] },
    { name: "VS Code", bins: ["/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code", `${home}/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code`, "/usr/share/code/bin/code", "/usr/bin/code"] },
    { name: "VS Code Insiders", bins: ["/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin/code-insiders"] },
  ];
  const out: { name: string; bin: string }[] = [];
  for (const c of candidates) {
    const bin = c.bins.find((b) => existsSync(b));
    if (bin) out.push({ name: c.name, bin });
  }
  return out;
}
/** install a local .vsix / uninstall by id into every detected editor. `arg` is a
 *  vsix path for install, a publisher.extension id for uninstall. */
function editorExtension(arg: string, verb: "install" | "uninstall"): string[] {
  const done: string[] = [];
  const flag = verb === "install" ? " --force" : "";
  for (const e of editorBins()) {
    try {
      const out = execSync(`"${e.bin}" --${verb}-extension "${arg}"${flag} 2>&1`, { encoding: "utf8", timeout: 120000 });
      if (!/failed|not found|unable to/i.test(out)) done.push(e.name); // CLI exits 0 even on failure → parse
    } catch { /* editor missing / real error */ }
  }
  return done;
}

switch (cmd) {
  case "list": {
    const json = rest.includes("--json");
    const all = discover();
    if (json) {
      // enrich with each theme's dominant colour so the picker can browse by hue.
      const enriched = all.map((e) => {
        try {
          const t = loadTheme(e.path); t.type = e.appearance as "dark" | "light";
          const d = dominantColor(t);
          return { ...e, accent: d.hex, hue: d.hue };
        } catch { return { ...e, accent: null, hue: "mono" as const }; }
      });
      console.log(JSON.stringify(enriched, null, 2));
      break;
    }
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
  case "pair": {
    // `theme pair set <light> <dark>` remembers which theme to use for each
    // system appearance; `theme auto` (and the watcher) consult this.
    const sub = rest[0];
    if (sub === "set") {
      const light = rest[1], dark = rest[2];
      if (!light || !dark) { console.error("usage: theme pair set <light-theme> <dark-theme>"); process.exit(1); }
      if (!resolveTheme(light)) { console.error(`theme: unknown theme '${light}' (try: theme list)`); process.exit(1); }
      if (!resolveTheme(dark)) { console.error(`theme: unknown theme '${dark}' (try: theme list)`); process.exit(1); }
      mkdirSync(CONFIG_HOME, { recursive: true });
      writeFileSync(PAIR, JSON.stringify({ light, dark }, null, 2) + "\n");
      console.log(`pair: light=${light} dark=${dark}\n\nnow run:  theme watch install   (to switch automatically)`);
      break;
    }
    if (!existsSync(PAIR)) { console.log("(no pair set — theme pair set <light-theme> <dark-theme>)"); break; }
    const { light, dark } = JSON.parse(readFileSync(PAIR, "utf8"));
    console.log(`light: ${light}\ndark:  ${dark}`);
    break;
  }
  case "auto": {
    // Apply whichever half of the pair matches the CURRENT system appearance.
    // Called by the watcher on every appearance flip, and safe to call by hand.
    if (process.platform !== "darwin") { console.log("theme auto: only macOS appearance is detected today"); break; }
    if (!existsSync(PAIR)) { console.error("theme auto: no pair set — theme pair set <light-theme> <dark-theme>"); process.exit(1); }
    const { light, dark } = JSON.parse(readFileSync(PAIR, "utf8"));
    const isDark = (() => {
      try { return execSync("defaults read -g AppleInterfaceStyle 2>/dev/null", { encoding: "utf8" }).trim() === "Dark"; }
      catch { return false; } // key absent → Light
    })();
    const target = isDark ? dark : light;
    const cur = existsSync(STATE) ? readFileSync(STATE, "utf8").trim() : "";
    const targetSlug = resolveTheme(target)?.slug ?? slugify(target);
    if (targetSlug === cur) { break; } // already matches, no-op
    const { canonical } = applyTheme(target, rest.includes("--quiet"));
    if (!rest.includes("--no-propagate")) propagate(canonical);
    break;
  }
  case "watch": {
    // A launchd agent that polls macOS's appearance (2s) and runs `theme auto` the
    // instant it changes — the closest thing to a live watcher without an ObjC/JXA
    // notification bridge, and far simpler to keep working across macOS versions.
    if (process.platform !== "darwin") { console.log("theme watch: only supported on macOS"); break; }
    const sub = rest[0];
    if (sub === "install") {
      if (!existsSync(PAIR)) { console.error("theme watch: set a pair first — theme pair set <light-theme> <dark-theme>"); process.exit(1); }
      // Reconstruct how to re-invoke ourselves: a source checkout runs via
      // `bun run cli.ts`, a compiled binary runs standalone.
      const self = process.argv[1]?.endsWith(".ts")
        ? `${process.execPath} run ${resolve(process.argv[1])}`
        : resolve(process.argv[1] ?? process.argv0);
      mkdirSync(CONFIG_HOME, { recursive: true });
      // launchd agents don't source shell rc files, so THEME_PEER/THEME_PEER_CMD
      // (set in .zshrc for cross-machine sync) are invisible to `theme auto` unless
      // we capture them now (from this installing shell) and bake them into the script.
      const envLines = [
        process.env.THEME_PEER ? `export THEME_PEER='${process.env.THEME_PEER}'` : null,
        process.env.THEME_PEER_CMD ? `export THEME_PEER_CMD='${process.env.THEME_PEER_CMD}'` : null,
      ].filter(Boolean).join("\n");
      writeFileSync(WATCH_SCRIPT, `#!/bin/bash\n${envLines}\nprev=""\nwhile true; do\n  cur=$(defaults read -g AppleInterfaceStyle 2>/dev/null)\n  if [ "$cur" != "$prev" ]; then\n    prev="$cur"\n    ${self} auto >/dev/null 2>&1\n  fi\n  sleep 2\ndone\n`);
      execSync(`chmod +x '${WATCH_SCRIPT}'`);
      const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n  <key>Label</key><string>${WATCH_LABEL}</string>\n  <key>ProgramArguments</key><array><string>/bin/bash</string><string>${WATCH_SCRIPT}</string></array>\n  <key>RunAtLoad</key><true/>\n  <key>KeepAlive</key><true/>\n  <key>StandardOutPath</key><string>${WATCH_LOG}</string>\n  <key>StandardErrorPath</key><string>${WATCH_LOG}</string>\n</dict>\n</plist>\n`;
      mkdirSync(join(WATCH_PLIST, ".."), { recursive: true });
      writeFileSync(WATCH_PLIST, plist);
      try { execSync(`launchctl unload '${WATCH_PLIST}' 2>/dev/null`); } catch {}
      execSync(`launchctl load -w '${WATCH_PLIST}'`);
      console.log(`watch: installed — theme will switch automatically with the system appearance\n  log: ${WATCH_LOG.replace(process.env.HOME || "~", "~")}`);
      break;
    }
    if (sub === "uninstall") {
      try { execSync(`launchctl unload '${WATCH_PLIST}' 2>/dev/null`); } catch {}
      if (existsSync(WATCH_PLIST)) rmSync(WATCH_PLIST);
      if (existsSync(WATCH_SCRIPT)) rmSync(WATCH_SCRIPT);
      console.log("watch: uninstalled");
      break;
    }
    if (sub === "status" || !sub) {
      let running = false;
      try { running = execSync(`launchctl list 2>/dev/null | grep -q '${WATCH_LABEL}' && echo yes || echo no`, { encoding: "utf8" }).trim() === "yes"; } catch {}
      console.log(running ? "watch: running" : "watch: not installed (theme watch install)");
      break;
    }
    console.error("usage: theme watch <install|uninstall|status>");
    process.exit(1);
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
    // local themes too. WYSIWYG: uses your CURRENT font so the card shows how the
    // theme will actually look in your setup.
    const cf = loadFonts();
    const curFont = resolveFont(cf, "editor").family ?? resolveFont(cf, "mono").family;
    // --remote <publisher.extension>: preview a Marketplace theme WITHOUT installing
    // it — downloads the .vsix, renders our own faithful card. Cached under
    // previews/remote/ so it's a one-time download per theme (parity with fonts).
    if (rest.includes("--remote")) {
      const id = rest.find((r) => !r.startsWith("--"));
      if (!id) { console.error('usage: theme preview <publisher.extension> --remote   (ids via: theme browse)'); process.exit(1); }
      const rdir = join(CONFIG_HOME, "previews", "remote");
      const cache = join(rdir, slugify(id) + ".svg");
      const meta = join(rdir, slugify(id) + ".json"); // sidecar: dominant colour
      let svg: string;
      let info: { hue: string; accent: string; type: string; slug: string; slugs: string[] };
      if (existsSync(cache) && existsSync(meta)) {
        svg = readFileSync(cache, "utf8");
        const cached = JSON.parse(readFileSync(meta, "utf8"));
        info = { ...cached, slugs: cached.slugs ?? (cached.slug ? [cached.slug] : []) }; // back-compat
      } else {
        try {
          const { fetchExtensionThemes } = await import("./market.ts");
          const { themes } = await fetchExtensionThemes(id);
          if (!themes.length) { console.error(`theme preview: ${id} contributes no themes`); process.exit(1); }
          const th = themes[0];
          const themeObj = { name: th.name, type: th.type, colors: th.colors, tokenColors: th.tokenColors } as any;
          svg = toPreviewSvg(themeObj, { fontFamily: curFont });
          const d = dominantColor(themeObj);
          info = { hue: d.hue, accent: d.hex, type: th.type, slug: th.slug, slugs: themes.map((t) => t.slug) };
          mkdirSync(rdir, { recursive: true });
          writeFileSync(cache, svg);
          writeFileSync(meta, JSON.stringify(info));
        } catch (e) {
          console.error(`theme preview: ${(e as Error).message}`);
          process.exit(1);
        }
      }
      if (rest.includes("--json")) { console.log(JSON.stringify({ path: cache, ...info })); break; }
      if (rest.includes("--stdout")) { process.stdout.write(svg); break; }
      console.log(cache);
      break;
    }
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
      mkdirSync(dir, { recursive: true });
      const map: Record<string, string> = {};
      for (const e of discover()) {
        try {
          const th = loadTheme(e.path); th.type = e.appearance as "dark" | "light";
          const out = join(dir, e.slug + ".svg");
          writeFileSync(out, toPreviewSvg(th, { fontFamily: curFont }));
          map[e.slug] = out;
        } catch { /* skip unreadable */ }
      }
      console.log(JSON.stringify(map));
      break;
    }
    const svg = toPreviewSvg(theme, { fontFamily: curFont });
    if (rest.includes("--stdout")) { process.stdout.write(svg); break; }
    mkdirSync(dir, { recursive: true });
    const out = join(dir, slugify(theme.name) + ".svg");
    writeFileSync(out, svg);
    console.log(out);
    break;
  }
  case "browse": {
    // Search the VS Code Marketplace for themes (the source vscodethemes.com indexes).
    // Empty query → browse top themes. --page N and --sort <relevance|installs|
    // trending|recent> mirror the site's paging + Sort By.
    const q = rest.filter((r) => !r.startsWith("--")).join(" ");
    const pageArg = rest.find((r) => r.startsWith("--page="));
    const sortArg = rest.find((r) => r.startsWith("--sort="));
    const pageNumber = pageArg ? Math.max(1, parseInt(pageArg.split("=")[1], 10) || 1) : 1;
    const { searchThemes, SORT } = await import("./market.ts");
    const sortBy = sortArg ? (SORT[sortArg.split("=")[1]] ?? SORT.installs) : SORT.installs;
    try {
      const hits = await searchThemes(q, { pageNumber, sortBy });
      if (rest.includes("--json")) { console.log(JSON.stringify(hits)); break; }
      if (!hits.length) { console.log(q ? `no theme extensions match '${q}'` : "no themes found"); break; }
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
      const { added, label, vsix } = await addExtension(id);
      // Also install the actual extension into Cursor/VSCode so their colorTheme
      // resolves (they need the extension, not just the vendored colour data). Install
      // from the local .vsix so it works regardless of each editor's gallery.
      const editors = editorExtension(vsix, "install");
      if (rest.includes("--json")) { console.log(JSON.stringify({ added, label, set: added[0] ?? null, editors })); break; }
      console.log(`fetching ${id}…`);
      for (const s of added) console.log(`  ✓ ${s}`);
      console.log(`\nadded ${added.length} theme(s) from ${label} → ~/.config/monotheme/themes/`);
      if (editors.length) console.log(`  ✓ installed extension in ${editors.join(", ")} (reload the editor if the theme doesn't appear)`);
      console.log(`set one with:  theme set ${added[0]}`);
    } catch (e) { console.error(`theme add: ${(e as Error).message}`); process.exit(1); }
    break;
  }
  case "remove": {
    // Uninstall a theme the user added: delete the vendored colour copy, and if it
    // came from an editor extension, uninstall that extension too. Won't touch repo
    // built-ins. `theme remove <slug>`.
    const slug = rest.find((r) => !r.startsWith("--"));
    if (!slug) { console.error("usage: theme remove <slug>"); process.exit(1); }
    const json = rest.includes("--json");
    const e = resolveTheme(slug);
    const removed: string[] = [];
    const vendored = join(USER_THEMES, slug + ".json");
    if (existsSync(vendored)) { rmSync(vendored); removed.push("vendored copy"); }
    let editors: string[] = [];
    if (e && e.source !== "local" && e.source !== "file") {
      const m = /^(.+?\..+?)-\d+\.\d+/.exec(e.source); // "<pub>.<ext>-x.y.z-…" → pub.ext
      if (m) editors = editorExtension(m[1], "uninstall");
    }
    if (json) { console.log(JSON.stringify({ removed, editors })); break; }
    if (!removed.length && !editors.length) { console.log(`nothing to remove for '${slug}' (not an added theme — repo built-ins can't be removed)`); break; }
    console.log(`removed '${slug}'${removed.length ? ` (${removed.join(", ")})` : ""}${editors.length ? `; uninstalled extension from ${editors.join(", ")}` : ""}`);
    break;
  }
  case "font": {
    await runFont(rest);
    break;
  }
  case "check": {
    runCheck();
    break;
  }
  default:
    console.log("usage: theme <list|set|current|init|sync|browse|add|remove|font|raycast|check|pair|auto|watch> [name]");
    process.exit(cmd ? 1 : 0);
}

// ── fonts: the orthogonal font axis (family + size per role) ─────────────────
//   theme font                      show the current font config
//   theme font show                 (same)
//   theme font set <role> <family> [size]
//   theme font set <role> --size <n>
// Roles: mono (base) · editor · terminal · ui. Edits ~/.config/monotheme/fonts.json
// then re-applies the active theme so font changes land immediately.
async function runFont(argv: string[]): Promise<void> {
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

  if (sub === "preview") {
    // Font-only specimen (neutral colours, sample text + ligatures + Nerd Font
    // glyphs) rendered in the ACTUAL font via Satori. Theme-INDEPENDENT, so it's
    // generated ONCE per font and cached forever — never regenerated on a theme
    // switch. Used on demand by the picker's "Bigger Preview".
    const cat = catalogWithStatus();
    const dir = join(CONFIG_HOME, "font-previews");
    const { resolveFontFile, resolveNerdFontFile, resolveSymbolsFont, renderSpecimen } = await import("./font-specimen.ts");
    const genOne = async (f: (typeof cat)[number]): Promise<string | null> => {
      const out = join(dir, f.id + ".svg");
      if (existsSync(out)) return out; // cached (font-only → never stale)
      // Typeface: base CDN first (small + fast), else the Nerd-Font build (covers
      // fonts not on the base CDN). Glyph row uses the shared symbols font.
      let data = await resolveFontFile(f.id, f.name);
      if (!data && f.hasNerdFont) data = await resolveNerdFontFile(f.id, f.nfAsset);
      if (!data) return null; // not on any CDN — no faithful preview available
      const symbols = f.hasNerdFont ? await resolveSymbolsFont() : null;
      const svg = await renderSpecimen(data, { name: f.name, symbols });
      if (!svg) return null;
      mkdirSync(dir, { recursive: true });
      // Don't permanently cache a glyph-less render for a Nerd-Font-capable font
      // (the symbols font may have transiently failed) — write a throwaway so the
      // next open retries and gets glyphs.
      if (f.hasNerdFont && !symbols) { const t = join(dir, "_pending.svg"); writeFileSync(t, svg); return t; }
      writeFileSync(out, svg);
      return out;
    };
    if (argv.includes("--all")) {
      const map: Record<string, string> = {};
      const N = 8;
      for (let i = 0; i < cat.length; i += N)
        await Promise.all(cat.slice(i, i + N).map(async (f) => { const p = await genOne(f); if (p) map[f.id] = p; }));
      console.log(JSON.stringify(map));
      return;
    }
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const q = norm(argv[1] ?? "");
    const f = cat.find((x) => norm(x.id) === q || norm(x.name) === q);
    if (!f) { console.error(`theme font: unknown font '${argv[1]}'`); process.exit(1); }
    const out = await genOne(f);
    if (!out) { console.error(`theme font: no faithful preview for '${f.name}' (not on the font CDNs)`); process.exit(1); }
    if (argv.includes("--stdout")) { process.stdout.write(readFileSync(out, "utf8")); return; }
    console.log(out);
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
