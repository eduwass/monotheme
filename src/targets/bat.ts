import { defineTarget } from "../target-kit.ts";
import { toTmTheme } from "../formats/tmtheme.ts";

export default defineTarget({
  name: "bat",
  // config pins --theme="Monotheme"; bat reads a compiled cache, so a rebuild is
  // mandatory after writing the slot.
  file: (c) => c.config("bat", "themes", "Monotheme.tmTheme"),
  render: (c) => toTmTheme(c.theme, { name: "Monotheme" }),
  reload: () => "bat cache --build",
});
