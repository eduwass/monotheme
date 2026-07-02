// WCAG 2.x contrast ratio — same math browsers/axe use. Pure, no deps, so it
// can run identically in the CLI (Bun) and if ever needed client-side.
import { stripAlpha } from "./load.ts";

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

export function runChecks(checks: ContrastCheck[]): ContrastResult[] {
  return checks.map((c) => {
    const ratio = contrastRatio(c.fg, c.bg);
    return { ...c, ratio, level: wcagLevel(ratio) };
  });
}
