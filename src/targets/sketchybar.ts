import { defineTarget } from "../target-kit.ts";

// SketchyBar has no theme file of its own here — bar configs read monotheme's
// active.json directly (see ~/.config/sketchybar/config.ts in dotfiles). What it
// lacks is a NUDGE: without one, the bar only repaints on the next unrelated event.
// Fire a `theme_change` event; a bar subscribes to it with
//   sketchybar --add event theme_change --subscribe <item> theme_change
// Triggering an event nobody registered is a no-op, so this is safe everywhere.
export default defineTarget({
  name: "sketchybar",
  detect: (c) => c.mac && c.hasCmd("sketchybar"),
  build: (c) => {
    c.run("sketchybar --trigger theme_change");
    return "theme_change event";
  },
});
