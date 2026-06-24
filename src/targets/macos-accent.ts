import { defineTarget } from "../target-kit.ts";
// Map a theme's accent to the nearest macOS system accent preset (no custom hex
// API exists — macOS only has 8 presets). Drives `defaults write -g AppleAccentColor`.
import type { VscodeTheme } from "../load.ts";
import { stripAlpha } from "../load.ts";
import { project } from "../project.ts";

interface Preset { name: string; int: number; hex: string; highlight: string }

// ref hex = the saturated accent (for nearest-match); highlight = the selection tint.
const PRESETS: Preset[] = [
  { name: "Red",      int: 0,  hex: "#FF5257", highlight: "1.000000 0.733333 0.721569 Red" },
  { name: "Orange",   int: 1,  hex: "#F7821B", highlight: "1.000000 0.874510 0.701961 Orange" },
  { name: "Yellow",   int: 2,  hex: "#FFC502", highlight: "1.000000 0.937255 0.690196 Yellow" },
  { name: "Green",    int: 3,  hex: "#62BA46", highlight: "0.752941 0.964706 0.678431 Green" },
  { name: "Blue",     int: 4,  hex: "#007AFF", highlight: "0.698039 0.843137 1.000000 Blue" },
  { name: "Purple",   int: 5,  hex: "#A550A7", highlight: "0.968627 0.831373 1.000000 Purple" },
  { name: "Pink",     int: 6,  hex: "#F74F9E", highlight: "1.000000 0.749020 0.823529 Pink" },
  { name: "Graphite", int: -1, hex: "#8C8C8C", highlight: "0.847059 0.847059 0.862745 Graphite" },
];

function rgb(hex: string): [number, number, number] {
  const h = stripAlpha(hex).replace(/^#/, "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Nearest accent preset to the theme's accent color (weighted RGB distance). */
export function nearestAccent(theme: VscodeTheme): Preset {
  const [r, g, b] = rgb(project(theme).accent);
  let best = PRESETS[0]!, bestD = Infinity;
  for (const p of PRESETS) {
    const [pr, pg, pb] = rgb(p.hex);
    // luminance-weighted distance reads closer to perceived hue match
    const d = 2 * (r - pr) ** 2 + 4 * (g - pg) ** 2 + 3 * (b - pb) ** 2;
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

export default defineTarget({
  name: "macos-accent",
  // no custom-hex API; snap to the nearest of macOS's 8 accent presets.
  detect: (c) => c.mac,
  build: (c) => {
    const a = nearestAccent(c.theme);
    c.run(`defaults write -g AppleAccentColor -int ${a.int}`);
    c.run(`defaults write -g AppleHighlightColor -string ${JSON.stringify(a.highlight)}`);
    return `${a.name} (nearest preset; relaunch apps to fully apply)`;
  },
});
