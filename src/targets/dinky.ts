import { defineTarget } from "../target-kit.ts";
import { stripAlpha } from "../load.ts";
import { project } from "../project.ts";

// VSCode theme -> Dinky window-border color.
//
// Dinky (the tiling window manager) is configured by ~/.config/dinky/dinky.toml, a
// hand-maintained file (gaps, keybindings, rules, …). We rewrite ONLY the value of
// `active-color` in its [borders] table so the focused border follows the theme accent —
// the same accent jankyborders.ts and rift-border.ts use. Everything else is preserved:
// `inactive-color` stays whatever the user chose, and so does every comment and space.
//
// Dinky wants '#rrggbb' (or '#rrggbbaa'); the theme accent is already "#RRGGBB".

/** `text` with [borders].active-color set to `hex`, or null if there is no such key
 *  (we never invent the table or the key). Line-based on purpose: a TOML parser would
 *  reformat the file and drop its comments. */
export function setActiveColor(text: string, hex: string): string | null {
  let table = "";
  let found = false;
  const lines = text.split("\n").map((line) => {
    // A [table] / [[array]] header switches scope, so an `active-color` under any other
    // table is never ours.
    const header = line.match(/^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*(#.*)?\r?$/);
    if (header) { table = header[1]!; return line; }
    if (found || table !== "borders") return line;
    // key = 'value'   # trailing comment   → keep the indent, quote style and comment.
    const m = line.match(/^(\s*active-color\s*=\s*)(['"])[^'"]*\2([\s\S]*)$/);
    if (!m) return line;
    found = true;
    return `${m[1]}${m[2]}${hex}${m[2]}${m[3]}`;
  });
  return found ? lines.join("\n") : null;
}

export default defineTarget({
  name: "dinky",
  // Mac-only: Dinky is a macOS window manager; its config lives at ~/.config/dinky/dinky.toml.
  detect: (c) => c.mac && c.has(c.config("dinky", "dinky.toml")),
  build: (c) => {
    const toml = c.config("dinky", "dinky.toml");
    const active = stripAlpha(project(c.theme).accent).toLowerCase();
    const text = setActiveColor(c.read(toml) || "", active);
    if (text === null) return "no [borders] active-color in dinky.toml (left unchanged)";
    c.write(toml, text);
    // No reload command: Dinky watches dinky.toml and re-reads it on save.
    return `border active=${active} (live)`;
  },
});
