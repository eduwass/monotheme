// WCAG 2.x contrast ratio — same math browsers/axe use. Pure, no deps, so it
// can run identically in the CLI (Bun) and if ever needed client-side.
import { stripAlpha, mix } from "./load.ts";

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const h = stripAlpha(hex).replace(/^#/, "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** WCAG contrast ratio between two colors, 1 (identical) to 21 (black/white). */
export function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg), l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2), darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export type WcagLevel = "fail" | "AA-large" | "AA" | "AAA";

/** WCAG 2.x text-contrast thresholds: AA-large 3:1, AA 4.5:1, AAA 7:1. */
export function wcagLevel(ratio: number): WcagLevel {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA-large";
  return "fail";
}

export interface ContrastCheck {
  label: string;
  fg: string;
  bg: string;
}

export interface ContrastResult extends ContrastCheck {
  ratio: number;
  level: WcagLevel;
}

/**
 * Nudge `color` toward `toward` — NOT toward generic black/white — until it
 * reaches `min` contrast against `against`, using the smallest step that clears
 * it. Pass the theme's own `bg` as `toward` and its `fg` as `against`: bg/fg are
 * guaranteed to already contrast well (that's the base editor pairing every
 * usable theme has), so blending an accent color toward bg is guaranteed to
 * converge on something readable — and stays inside the theme's own palette
 * (e.g. Shades of Purple's yellow drifts toward its dark purple, not toward flat
 * black), instead of desaturating into an unrelated gray wash. Returns `color`
 * unchanged if it already clears the threshold.
 */
export function ensureContrast(color: string, against: string, toward: string, min = 4.5): string {
  if (contrastRatio(against, color) >= min) return color;
  for (let t = 0.05; t <= 1; t += 0.05) {
    const candidate = mix(color, toward, t);
    if (contrastRatio(against, candidate) >= min) return candidate;
  }
  return toward; // toward vs against is guaranteed to clear min — this is the t=1 endpoint
}

export function runChecks(checks: ContrastCheck[]): ContrastResult[] {
  return checks.map((c) => {
    const ratio = contrastRatio(c.fg, c.bg);
    return { ...c, ratio, level: wcagLevel(ratio) };
  });
}
