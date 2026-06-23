// Deterministic tests: known theme input -> exact output. `bun test`.
import { test, expect } from "bun:test";
import { resolve, dirname } from "node:path";
import plist from "plist";
import { loadTheme, stripAlpha } from "../src/load.ts";
import { project, ANSI_KEYS } from "../src/project.ts";
import { toTmTheme } from "../src/adapters/tmtheme.ts";
import { toGhostty } from "../src/adapters/ghostty.ts";
import { discover, slugify } from "../src/discover.ts";

const D = dirname(new URL(import.meta.url).pathname);
const sop = loadTheme(resolve(D, "..", "themes", "shades-of-purple.json"));
const gh = loadTheme(resolve(D, "..", "themes", "github-dark.json"));

test("load: SoP parses JSONC with comments", () => {
  expect(sop.tokenColors.length).toBe(143);
  expect(sop.type).toBe("dark");
  expect(sop.colors["editor.background"]).toBe("#2D2B55");
});

test("stripAlpha: drops 8-digit alpha, passes 6-digit through", () => {
  expect(stripAlpha("#EC3A37F5")).toBe("#EC3A37");
  expect(stripAlpha("#58a6ff")).toBe("#58a6ff");
});

test("ANSI: SoP maps all 16 slots from terminal.ansi* (alpha stripped)", () => {
  const p = project(sop);
  expect(p.ansi).toHaveLength(16);
  for (let i = 0; i < 16; i++) {
    expect(p.ansi[i]).toBe(stripAlpha(sop.colors[ANSI_KEYS[i]!]!));
  }
  expect(p.ansi[1]).toBe("#EC3A37"); // ansiRed, alpha gone
  expect(p.warnings).toHaveLength(0); // SoP defines ANSI -> no inference
});

test("projection: SoP semantic roles resolve to the right brand colors", () => {
  const p = project(sop);
  expect(p.accent).toBe("#FAD000"); // gold from button.background (not focusBorder dark)
  expect(p.fgMuted).toBe("#A599E9"); // lavender
  expect(p.bg).toBe("#2D2B55");
  // accent must never collapse to a near-background dark color
  expect(p.accent).not.toBe(p.bg);
  expect(p.borderActive).not.toBe(p.bg);
});

test("ANSI: GitHub Dark maps to its exact authored values", () => {
  const p = project(gh);
  expect(p.bg).toBe("#0d1117");
  expect(p.ansi[1]).toBe("#ff7b72"); // ansiRed
  expect(p.ansi[4]).toBe("#58a6ff"); // ansiBlue
  expect(p.warnings).toHaveLength(0);
});

test("ANSI fallback: a theme without terminal.* infers 16 slots and warns", () => {
  const stripped = {
    ...sop,
    colors: Object.fromEntries(Object.entries(sop.colors).filter(([k]) => !k.startsWith("terminal."))),
  };
  const p = project(stripped);
  expect(p.ansi).toHaveLength(16);
  expect(p.ansi.every((x) => /^#[0-9a-fA-F]{6}$/.test(x))).toBe(true);
  expect(p.warnings.length).toBeGreaterThan(0);
});

test("tmTheme: valid plist with global background + one rule per token", () => {
  const xml = toTmTheme(sop);
  expect(xml.startsWith("<?xml")).toBe(true);
  const parsed = plist.parse(xml) as any;
  expect(parsed.name).toBe("Shades of Purple");
  // settings[0] is the global dict; the rest are scope rules
  expect(parsed.settings[0].settings.background).toBe("#2D2B55");
  expect(parsed.settings.length).toBe(sop.tokenColors.filter((t) => t.settings).length + 1);
});

test("tmTheme: name override pins a stable slot (and is deterministic)", () => {
  const a = toTmTheme(sop, { name: "Dotfiles" });
  const b = toTmTheme(sop, { name: "Dotfiles" });
  expect((plist.parse(a) as any).name).toBe("Dotfiles");
  expect(a).toBe(b); // no Date/random -> byte-identical across runs
});

test("ghostty: 16 ordered palette lines + bg/fg/cursor from projection", () => {
  const out = toGhostty(sop);
  const p = project(sop);
  for (let i = 0; i < 16; i++) {
    expect(out).toContain(`palette = ${i}=${p.ansi[i]}`);
  }
  expect(out).toContain(`background = ${p.bg}`);
  expect(out).toContain(`cursor-color = ${p.cursor}`);
  expect(out).toContain("selection-background =");
});

test("zed: valid theme family with style + syntax + ansi", () => {
  const { toZed } = require("../src/adapters/zed.ts");
  const z = JSON.parse(toZed(sop));
  expect(z.name).toBe("Dotfiles");
  expect(z.themes[0].name).toBe("Dotfiles");
  expect(z.themes[0].appearance).toBe("dark");
  expect(z.themes[0].style.background).toBe("#2D2B55");
  expect(z.themes[0].style["terminal.ansi.red"]).toBe("#EC3A37");
  expect(z.themes[0].style.syntax.comment.color).toBeTruthy();
  expect(z.themes[0].style["text.accent"]).toBe("#FAD000");
});

test("patchJsonStringKey: replaces existing key, inserts missing, preserves rest", () => {
  const { patchJsonStringKey } = require("../src/util.ts");
  const { writeFileSync, readFileSync, mkdtempSync } = require("node:fs");
  const { join } = require("node:path");
  const { tmpdir } = require("node:os");
  const f = join(mkdtempSync(join(tmpdir(), "theme-")), "settings.json");
  writeFileSync(f, '{\n  // keep me\n  "workbench.colorTheme": "Old",\n  "other": 1\n}\n');
  patchJsonStringKey(f, "workbench.colorTheme", "New Theme");
  let s = readFileSync(f, "utf8");
  expect(s).toContain('"workbench.colorTheme": "New Theme"');
  expect(s).toContain("// keep me");        // comment preserved
  expect(s).toContain('"other": 1');         // other keys preserved
  patchJsonStringKey(f, "theme", "Dotfiles"); // insert missing
  expect(readFileSync(f, "utf8")).toContain('"theme": "Dotfiles"');
});

test("opencode: full semantic schema, accent gold, syntax mapped", () => {
  const { toOpencode } = require("../src/adapters/opencode.ts");
  const o = JSON.parse(toOpencode(sop)).theme;
  expect(o.accent.dark).toBe("#FAD000");
  expect(o.background.dark).toBe("#2D2B55");
  expect(o.syntaxComment.dark).toBeTruthy();
  expect(o.syntaxKeyword.dark).toBeTruthy();
  expect(o.diffAdded.dark).toBe(project(sop).success);
});

test("claude: name/base/overrides with gold accent + diff colors", () => {
  const { toClaude } = require("../src/adapters/claude.ts");
  const cl = JSON.parse(toClaude(sop));
  expect(cl.base).toBe("dark");
  expect(cl.overrides.claude).toBe("#FAD000");
  expect(cl.overrides.text).toBe("#FFFFFF");
  expect(cl.overrides.background).toBe("#2D2B55");
  expect(cl.overrides.diffAdded).toBeTruthy();
});

test("macos-accent: maps theme accent to nearest preset", () => {
  const { nearestAccent } = require("../src/adapters/macos-accent.ts");
  expect(nearestAccent(sop).name).toBe("Yellow");   // SoP gold #FAD000
  expect(nearestAccent(gh).name).toBe("Green");       // GitHub's accent is its green button #238636
});

test("nvim: generates a loadable colorscheme with bg/term colors from theme", () => {
  const { toNvim } = require("../src/adapters/nvim.ts");
  const lua = toNvim(sop);
  expect(lua).toContain('vim.g.colors_name = "dotfiles"');
  expect(lua).toContain('vim.o.background = "dark"');
  expect(lua).toContain('"Normal", { bg = "#2D2B55"'); // editor.background
  expect(lua).toContain('vim.g.terminal_color_1 = "#EC3A37"'); // ansi red
  // every highlight line is a well-formed hl(...) call
  expect(lua).toContain('local hl = function(group, opts)');
});

test("lazygit: theme block maps roles + in-place replace preserves git.pagers", () => {
  const { toLazygit } = require("../src/adapters/lazygit.ts");
  const block = toLazygit(sop);
  expect(block).toContain('activeBorderColor:');
  expect(block).toContain(`- "${project(sop).accent}"`); // gold active border
  expect(block).toContain('- bold');
  // the same regex the target uses must swap the block without eating git.pagers
  const orig = "gui:\n  nerdFontsVersion: \"3\"\n  theme:\n    activeBorderColor:\n      - \"#000\"\n      - bold\ngit:\n  pagers:\n    - pager: x\n";
  const re = /^ {2}theme:\n(?: {4}.*\n| *\n)*/m;
  const out = orig.replace(re, block);
  expect(out).toContain("git:\n  pagers:");
  expect(out).toContain("nerdFontsVersion");
  expect(out).not.toContain('- "#000"');
});

test("mix: blends two hex colors for readable muted ladders", () => {
  const { mix } = require("../src/load.ts");
  expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  expect(mix("#2D2B55", "#FFFFFF", 0)).toBe("#2D2B55");
});

test("slugify + discover: labels normalize, local themes are found", () => {
  expect(slugify("GitHub Dark Default")).toBe("github-dark-default");
  expect(slugify("  Shades of Purple  ")).toBe("shades-of-purple");
  const slugs = discover().map((e) => e.slug);
  expect(slugs).toContain("shades-of-purple");
  expect(slugs).toContain("github-dark");
});
