// Passthrough: a VSCode theme IS a shiki theme. Emit a normalized copy for tools
// that consume shiki/textmate JSON directly (hunk syntax_theme, git-split-diffs).
import type { VscodeTheme } from "../load.ts";

export function toShiki(theme: VscodeTheme): string {
  return JSON.stringify(
    { name: theme.name, type: theme.type, colors: theme.colors, tokenColors: theme.tokenColors },
    null,
    2,
  ) + "\n";
}
