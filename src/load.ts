// Load + normalize a VSCode color theme (JSONC) into a stable shape.
import { readFileSync } from "node:fs";
import JSON5 from "json5";

export interface TokenColor {
  name?: string;
  scope?: string | string[];
  settings: { foreground?: string; background?: string; fontStyle?: string };
}

export interface VscodeTheme {
  name: string;
  type: "dark" | "light";
  colors: Record<string, string>;
  tokenColors: TokenColor[];
  /** absolute path it was loaded from */
  path?: string;
}

/** Read a VSCode/Cursor theme JSON (tolerates comments + trailing commas). */
export function loadTheme(path: string): VscodeTheme {
  const raw = JSON5.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  // shiki/vscode compat: some themes use `settings` instead of `tokenColors`.
  const tokenColors = (raw.tokenColors ?? raw.settings ?? []) as TokenColor[];
  const colors = (raw.colors ?? {}) as Record<string, string>;
  const type = (raw.type as "dark" | "light") ?? "dark";
  const name = (raw.name as string) ?? path.split("/").pop()!.replace(/\.json$/, "");
  return { name, type, colors, tokenColors, path };
}

/** First defined color from a fallback chain of `colors{}` keys. */
export function pick(colors: Record<string, string>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = colors[k];
    if (v) return stripAlpha(v);
  }
  return undefined;
}

/** Normalize a hex color to #rrggbb: expand #rgb/#rgba shorthand and drop an
 *  alpha channel. Most terminals/TUIs (and nvim_set_hl) reject shorthand/alpha. */
export function stripAlpha(hex: string): string {
  const m = /^#([0-9a-fA-F]{3,8})$/.exec(hex);
  if (!m) return hex;
  const h = m[1]!;
  // #rgb / #rgba → #rrggbb (duplicate each of the first 3 nibbles)
  if (h.length === 3 || h.length === 4) return "#" + h.slice(0, 3).replace(/./g, (c) => c + c);
  // #rrggbb / #rrggbbaa → #rrggbb
  if (h.length === 6 || h.length === 8) return "#" + h.slice(0, 6);
  return hex; // unexpected length — leave as-is
}

/** Composite a possibly-translucent hex (#rrggbbaa) over an opaque background,
 *  yielding an opaque hex. Colors without an alpha channel pass through unchanged.
 *  Themes often express diff/selection washes as a low-alpha overlay (e.g. SoP's
 *  diff bg is bright green at 12%); tools that only accept opaque hex would paint
 *  that as a full-saturation solid unless we flatten it over the surface first. */
export function flattenAlpha(hex: string, bg: string): string {
  const m = /^#([0-9a-fA-F]{8})$/.exec(hex.trim());
  if (!m) return stripAlpha(hex);
  const a = parseInt(m[1]!.slice(6, 8), 16) / 255;
  return mix(bg, "#" + m[1]!.slice(0, 6), a);
}

function toRgb(hex: string): [number, number, number] {
  const h = stripAlpha(hex).replace(/^#/, "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Linearly blend two hex colors; t=0 → a, t=1 → b. Used to synthesize the
 *  readable muted-tone gradients tools like herdr expect. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = toRgb(a);
  const [br, bg, bb] = toRgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0").toUpperCase();
  return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`;
}
