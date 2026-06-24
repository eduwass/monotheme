import { defineTarget } from "../target-kit.ts";
// VSCode theme -> herdr [theme.custom] block (Catppuccin-style palette).
// https://herdr.dev/docs/preview/configuration/#theme
// herdr expects a readable ladder of muted tones (overlay0 < overlay1 < subtext0),
// so we synthesize them by blending bg→fg rather than reusing the dark border.
// panel_bg fills the tab bar (src/ui/tabs.rs) and panel chrome — set it to the
// base bg so the tab strip blends in instead of reading as a darker line.
import type { VscodeTheme } from "../load.ts";
import { mix } from "../load.ts";
import { project } from "../project.ts";

export function toHerdrTheme(theme: VscodeTheme): string {
  const p = project(theme);
  const a = p.ansi;
  const ladder = (t: number) => mix(p.bg, p.fg, t);
  return `[theme.custom]
base        = "${p.bg}"
panel_bg    = "${p.bg}"
surface_dim = "${p.bgPanel}"
surface0    = "${ladder(0.08)}"
surface1    = "${ladder(0.16)}"
overlay0    = "${ladder(0.38)}"
overlay1    = "${ladder(0.58)}"
subtext0    = "${ladder(0.82)}"
text        = "${p.fg}"
accent      = "${p.accent}"
mauve       = "${a[5]}"
blue        = "${a[4]}"
green       = "${a[2]}"
yellow      = "${a[3]}"
peach       = "${p.warning}"
red         = "${p.error}"
`;
}

export default defineTarget({
  name: "herdr",
  detect: (c) => c.has(c.config("herdr", "config.toml")),
  build: (c) => {
    const conf = c.config("herdr", "config.toml");
    let s = c.read(conf);
    s = /\[theme\.custom\]/.test(s)
      ? s.replace(/\[theme\.custom\][\s\S]*$/, toHerdrTheme(c.theme))
      : s + "\n" + toHerdrTheme(c.theme);
    c.write(conf, s);
    c.run("herdr server reload-config");
    return "[theme.custom] (reload-config)";
  },
});
