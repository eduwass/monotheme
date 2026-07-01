// The font axis — orthogonal to color themes. Source of truth is a single
// per-machine file at ~/.config/monotheme/fonts.json (see paths.ts). Fully
// opt-in: no file → resolveFont returns {} for every role → targets write no
// font keys, so `theme set` behaves exactly as before.
//
// Four roles; `mono` is the inherited base. A role's value is either a string
// (family shorthand) or an object { family?, size? }. `family` and `size` each
// resolve independently, falling back to `mono` when the role omits them:
//
//   { "mono":     { "family": "Berkeley Mono", "size": 13 },
//     "editor":   { "size": 14 },        // family ← mono, size overrides
//     "terminal": "Ghostty Mono",        // string shorthand = family only
//     "ui":       { "family": "Inter", "size": 12 } }
//
// Sizes are written in each tool's own native unit (pt for ghostty, px for
// editors) — monotheme does NOT convert between units.
import { readFileSync, existsSync } from "node:fs";
import JSON5 from "json5";
import { FONTS } from "./paths.ts";

export type FontRole = "mono" | "editor" | "terminal" | "ui";
export const FONT_ROLES: FontRole[] = ["mono", "editor", "terminal", "ui"];

export interface FontSpec {
  family?: string;
  size?: number;
}
/** A role value as authored: a bare family string, or a partial spec. */
export type FontRoleValue = string | FontSpec;
export type FontsConfig = Partial<Record<FontRole, FontRoleValue>>;

/** Load fonts.json, or null if absent/unreadable (the opt-out state). */
export function loadFonts(): FontsConfig | null {
  if (!existsSync(FONTS)) return null;
  try {
    return JSON5.parse(readFileSync(FONTS, "utf8")) as FontsConfig;
  } catch {
    return null;
  }
}

function norm(v: FontRoleValue | undefined): FontSpec {
  if (v == null) return {};
  return typeof v === "string" ? { family: v } : v;
}

/** Resolve a role to a concrete { family?, size? }, each field falling back to
 *  `mono` independently. Returns {} when fonts are unconfigured. */
export function resolveFont(fonts: FontsConfig | null, role: FontRole): FontSpec {
  if (!fonts) return {};
  const base = norm(fonts.mono);
  const self = norm(fonts[role]);
  const out: FontSpec = {};
  const family = self.family ?? base.family;
  const size = self.size ?? base.size;
  if (family != null) out.family = family;
  if (size != null) out.size = size;
  return out;
}
