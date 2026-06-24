import { defineTarget } from "../target-kit.ts";
import { toShiki } from "../formats/shiki.ts";

export default defineTarget({
  name: "hunk",
  detect: (c) => c.has(c.config("hunk", "config.toml")),
  // hunk consumes a shiki/VSCode theme via syntax_theme out of the box — just
  // (re)write that slot.
  file: (c) => c.config("hunk", "monotheme.json"),
  render: (c) => toShiki(c.theme),
});
