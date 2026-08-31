// The theme browser's non-DOM parts: the zip reader (against a zip assembled by
// hand, stored + deflated), the desktop palette for every shipped theme (every
// var a solid hex), and shiki highlighting with a raw VS Code theme object —
// the same path the page takes for a Marketplace theme.
import { test, expect } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { readCentralDirectory, extractEntry, readTextEntry } from "../tools/site/zip.ts";
import { desktopVars, invalidVars, shellVars, invalidShellVars, ROLE_SPECS } from "../tools/site/palette.ts";
import { loadTheme } from "../src/load.ts";
import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import tsLang from "shiki/langs/typescript.mjs";

const THEMES = join(import.meta.dir, "..", "themes");
const inflate = async (d: Uint8Array) => new Uint8Array(inflateRawSync(d));

/** Build a zip the way a writer would: local headers + data, central directory, EOCD. */
function makeZip(files: { name: string; data: string; deflate?: boolean }[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = []; const cd: Uint8Array[] = []; let offset = 0;
  const u16 = (n: number) => [n & 255, (n >> 8) & 255];
  const u32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
  for (const f of files) {
    const name = enc.encode(f.name); const raw = enc.encode(f.data);
    const body = f.deflate ? new Uint8Array(deflateRawSync(raw)) : raw;
    const method = f.deflate ? 8 : 0;
    const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(method), ...u16(0), ...u16(0), ...u32(0), ...u32(body.length), ...u32(raw.length), ...u16(name.length), ...u16(0), ...name]);
    cd.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(method), ...u16(0), ...u16(0), ...u32(0), ...u32(body.length), ...u32(raw.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name]));
    chunks.push(local, body); offset += local.length + body.length;
  }
  const cdBytes = cd.reduce((a, c) => a + c.length, 0);
  const eocd = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdBytes), ...u32(offset), ...u16(0)]);
  const all = [...chunks, ...cd, eocd]; const out = new Uint8Array(all.reduce((a, c) => a + c.length, 0));
  let p = 0; for (const c of all) { out.set(c, p); p += c.length; }
  return out;
}

test("zip reader: stored + deflated entries round-trip", async () => {
  const pkg = JSON.stringify({ contributes: { themes: [{ label: "X", path: "./themes/x.json" }] } });
  const theme = "{ // json5\n  name: 'X', colors: { 'editor.background': '#101010' } }";
  const zip = makeZip([{ name: "extension/package.json", data: pkg }, { name: "extension/themes/x.json", data: theme, deflate: true }]);
  const entries = readCentralDirectory(zip);
  expect(entries.map((e) => [e.name, e.method])).toEqual([["extension/package.json", 0], ["extension/themes/x.json", 8]]);
  expect(new TextDecoder().decode(await extractEntry(zip, entries[0]!, inflate))).toBe(pkg);
  expect(await readTextEntry(zip, entries, "./extension/themes/x.json", inflate)).toBe(theme);
  expect(await readTextEntry(zip, entries, "extension/nope.json", inflate)).toBeNull();
  expect(() => readCentralDirectory(new Uint8Array(10))).toThrow(/not a zip/);
});

test("desktop palette: every shipped theme yields solid hex for every var, both editor flavors", () => {
  const files = readdirSync(THEMES).filter((f) => f.endsWith(".json"));
  expect(files.length).toBeGreaterThan(10);
  for (const f of files) {
    const t = loadTheme(join(THEMES, f));
    for (const flavor of ["vscode", "zed"] as const) {
      const d = desktopVars(t, flavor);
      expect(invalidVars(d.vars), `${f} (${flavor})`).toEqual([]);
      expect(invalidShellVars(shellVars(d.p)), `${f} shell`).toEqual([]);
      // the herdr window and the bar must come from the same palette the adapter emits
      expect(d.vars["--term-bg"]).toBe(d.herdr.panel_bg!);
      expect(d.vars["--pill-focused-bg"]).toBe(d.herdr.accent!);
      expect(d.vars["--term-tab-active-bg"]).toBe(d.vars["--pill-focused-bg"]);
    }
  }
});

test("ROLE_SPECS: overriding each spec's key overrides its projection role, for every shipped theme", () => {
  const { project } = require("../src/project.ts");
  const files = readdirSync(THEMES).filter((f) => f.endsWith(".json"));
  for (const f of files) {
    const t = loadTheme(join(THEMES, f));
    for (const spec of ROLE_SPECS) {
      const tweaked = { ...t, colors: { ...t.colors, [spec.key]: "#123456" } };
      expect(spec.get(project(tweaked)), `${f}: ${spec.role} via ${spec.key}`).toBe("#123456");
    }
    // ANSI honours terminal.ansi* only when all 16 exist — the inspector seeds
    // the derived palette into every key before overriding one (same as here).
    const { ANSI_KEYS } = require("../src/project.ts");
    const seeded = Object.fromEntries(ANSI_KEYS.map((k: string, i: number) => [k, project(t).ansi[i]]));
    const ansiTweak = { ...t, colors: { ...t.colors, ...seeded, "terminal.ansiRed": "#654321" } };
    expect(project(ansiTweak).ansi[1]).toBe("#654321");
  }
});

test("shiki highlights with a raw VS Code theme object (the Marketplace path)", async () => {
  const hl = await createHighlighterCore({ themes: [], langs: [tsLang], engine: createJavaScriptRegexEngine({ forgiving: true }) });
  const t = loadTheme(join(THEMES, "tokyo-night.json"));
  await hl.loadTheme({ name: "mt-test", type: t.type, colors: t.colors, tokenColors: t.tokenColors } as any);
  const html = hl.codeToHtml('const x = "hi"; // c', { lang: "typescript", theme: "mt-test" });
  const colors = new Set([...html.matchAll(/color:(#[0-9a-fA-F]{6})/g)].map((m) => m[1]!.toLowerCase()));
  expect(colors.size).toBeGreaterThan(2); // keyword, string, comment at least
});
