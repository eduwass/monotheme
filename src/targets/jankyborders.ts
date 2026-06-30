import { defineTarget } from "../target-kit.ts";
import { stripAlpha } from "../load.ts";
import { project } from "../project.ts";

// VSCode theme -> JankyBorders window-border colors.
//
// JankyBorders (the `borders` brew service) is configured by ~/.config/borders/bordersrc,
// a hand-maintained script (whitelist, width, style, order, …). We rewrite ONLY the two
// color lines so the focused/unfocused border follows the theme accent — the same accent
// rift-border.ts feeds the cursor halo — keeping the WM overlay and the window borders in
// one palette. Everything else in bordersrc is preserved.
//
// JankyBorders wants 8-digit 0xAARRGGBB; the theme accent is 6-digit "#RRGGBB":
//   active_color   = accent @ full alpha  (focused window)
//   inactive_color = accent @ ~50% alpha  (unfocused windows — themed but dimmed)
export default defineTarget({
  name: "jankyborders",
  // Mac-only: JankyBorders is a macOS tool; its config lives at ~/.config/borders/bordersrc.
  detect: (c) => c.mac && c.has(c.config("borders", "bordersrc")),
  build: (c) => {
    const rc = c.config("borders", "bordersrc");
    const rgb = stripAlpha(project(c.theme).accent).replace(/^#/, "").toLowerCase();
    const active = `0xff${rgb}`;
    const inactive = `0x80${rgb}`;
    const text = (c.read(rc) || "")
      .replace(/active_color=0x[0-9a-fA-F]{8}/, `active_color=${active}`)
      .replace(/inactive_color=0x[0-9a-fA-F]{8}/, `inactive_color=${inactive}`);
    c.write(rc, text);
    // Re-source bordersrc to push the new colors to the already-running borders instance
    // live (JankyBorders updates the running daemon when `borders …` is re-invoked). No
    // restart, and harmless if borders happens not to be running.
    c.run(`bash ${rc}`);
    return `border active=${active} inactive=${inactive} (live)`;
  },
});
