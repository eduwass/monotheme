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

test("slugify + discover: labels normalize, local themes are found", () => {
  expect(slugify("GitHub Dark Default")).toBe("github-dark-default");
  expect(slugify("  Shades of Purple  ")).toBe("shades-of-purple");
  const slugs = discover().map((e) => e.slug);
  expect(slugs).toContain("shades-of-purple");
  expect(slugs).toContain("github-dark");
});
