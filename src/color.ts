// Dominant-color / hue bucketing for themes, so the picker can browse by colour
// ("show me greenish themes"). We take the theme's accent (the colour a user reads
// as "the theme's colour") and bucket its hue into a small, named set.
import type { VscodeTheme } from "./load.ts";
import { project } from "./project.ts";

export type Hue = "mono" | "red" | "orange" | "yellow" | "green" | "cyan" | "blue" | "purple" | "pink";

const HEX = /^#?([0-9a-f]{6})/i;

/** hex → HSL (h 0..360, s/l 0..1). Returns null for unparseable input. */
export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = HEX.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  return { h, s, l };
}

/** Bucket an HSL hue into a named colour band. Low saturation → "mono". */
export function hueBucket(hsl: { h: number; s: number; l: number }): Hue {
  if (hsl.s < 0.18 || hsl.l < 0.06 || hsl.l > 0.94) return "mono";
  const h = hsl.h;
  if (h < 15 || h >= 345) return "red";
  if (h < 45) return "orange";
  if (h < 70) return "yellow";
  if (h < 165) return "green";
  if (h < 200) return "cyan";
  if (h < 255) return "blue";
  if (h < 300) return "purple";
  return "pink";
}

/** The theme's dominant colour: the most *saturated* colour among its accent and
 *  chromatic ANSI palette (what a human reads as "the theme's colour"), so e.g.
 *  Dracula reads purple rather than its muted accent key. Falls back to mono. */
export function dominantColor(theme: VscodeTheme): { hex: string; hue: Hue } {
  const p = project(theme);
  // Trust the accent when it's actually chromatic — it's the theme's identity
  // colour (ayu→orange, github→green). Only when the accent is muted/grey (e.g.
  // Dracula's) fall back to the most-saturated ANSI slot so it still reads right.
  const acc = hexToHsl(p.accent);
  if (acc && acc.s >= 0.35 && acc.l >= 0.15 && acc.l <= 0.9) return { hex: p.accent, hue: hueBucket(acc) };
  const ansi = p.ansi ?? [];
  let best: { hex: string; hsl: NonNullable<ReturnType<typeof hexToHsl>> } | null = null;
  for (const i of [5, 1, 4, 2, 3, 6, 13, 9, 12, 10, 11, 14]) {
    const hex = ansi[i];
    const hsl = hex ? hexToHsl(hex) : null;
    if (!hsl || hsl.l < 0.15 || hsl.l > 0.9) continue;
    if (!best || hsl.s > best.hsl.s) best = { hex, hsl };
  }
  if (best) return { hex: best.hex, hue: hueBucket(best.hsl) };
  return { hex: p.accent, hue: acc ? hueBucket(acc) : "mono" };
}

// self-check: primary hues bucket where expected.
if (import.meta.main) {
  const cases: [string, Hue][] = [["#e5484d", "red"], ["#30a46c", "green"], ["#0091ff", "blue"], ["#8e4ec6", "purple"], ["#888888", "mono"]];
  for (const [hex, want] of cases) {
    const got = hueBucket(hexToHsl(hex)!);
    if (got !== want) throw new Error(`hue(${hex}) = ${got}, want ${want}`);
  }
  console.log("color.ts self-check ok");
}
