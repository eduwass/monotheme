// VSCode theme -> rift overlay accent colors (focus border + cursor halo + halo fx).
// The custom renderer (scripts/mac/rift/focus-border-renderer.swift) reads its
// config from ~/.local/state/rift/ui.json and WATCHES the file, hot-reloading
// border + halo on change — so syncing is just a merge-write of the color keys.
// All colors are 6-digit "#RRGGBB" (parseHexColor; alpha ignored).
//   border.color   — focus ring
//   halo.color     — cursor halo ring
//   halo.fx.color  — halo motion-fx effect
import type { VscodeTheme } from "../load.ts";
import { stripAlpha } from "../load.ts";
import { project } from "../project.ts";

/** The accent (focus ring / halo) for a theme. */
export function riftBorderColor(theme: VscodeTheme): string {
  return stripAlpha(project(theme).accent);
}

/** Merge the theme accent into an existing ui.json object across the border ring,
 *  the cursor halo, and the halo fx — preserving every other key (styles, sizes,
 *  fx tuning, enabled flags). Returns the updated object. */
export function withRiftColors(ui: Record<string, unknown>, accent: string): Record<string, unknown> {
  const obj = (k: string) => (typeof ui[k] === "object" && ui[k] ? (ui[k] as Record<string, unknown>) : {});
  const border = obj("border");
  const halo = obj("halo");
  const fx = (typeof halo.fx === "object" && halo.fx ? halo.fx : {}) as Record<string, unknown>;
  return {
    ...ui,
    border: { ...border, color: accent },
    halo: { ...halo, color: accent, fx: { ...fx, color: accent } },
  };
}
