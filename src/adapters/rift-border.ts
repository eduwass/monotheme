// VSCode theme -> the rift focus-border accent color.
// The custom focus-border renderer (scripts/mac/rift/focus-border-renderer.swift)
// reads its config from ~/.local/state/rift/ui.json under `border` and WATCHES the
// file, hot-reloading on change — so syncing the accent is just a merge-write of
// border.color. parseHexColor wants 6-digit "#RRGGBB" (alpha ignored).
import type { VscodeTheme } from "../load.ts";
import { stripAlpha } from "../load.ts";
import { project } from "../project.ts";

/** The border accent (focus ring) for a theme. */
export function riftBorderColor(theme: VscodeTheme): string {
  return stripAlpha(project(theme).accent);
}

/** Merge border.color into an existing ui.json object (preserves all other keys
 *  and border style/width/etc.). Returns the updated object. */
export function withRiftBorderColor(ui: Record<string, unknown>, color: string): Record<string, unknown> {
  const border = (typeof ui.border === "object" && ui.border ? ui.border : {}) as Record<string, unknown>;
  return { ...ui, border: { ...border, color } };
}
