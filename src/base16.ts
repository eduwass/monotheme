// Project a VSCode theme down to a standard base16 scheme (base00..base0F).
// This is the bridge into the tinted-theming / base16 ecosystem: once we have a
// base16 scheme, any base16 template (100+ apps) can be rendered from it.
// Spec: https://github.com/tinted-theming/home/blob/main/styling.md
import type { VscodeTheme } from "./load.ts";
import { project, scopeColor } from "./project.ts";

export interface Base16 {
  base00: string; base01: string; base02: string; base03: string;
  base04: string; base05: string; base06: string; base07: string;
  base08: string; base09: string; base0A: string; base0B: string;
  base0C: string; base0D: string; base0E: string; base0F: string;
}

export function toBase16(theme: VscodeTheme): Base16 {
  const p = project(theme);
  const a = p.ansi;
  const t = theme.tokenColors;
  const sx = (scopes: string[], fb: string) => {
    for (const s of scopes) { const v = scopeColor(t, s); if (v) return v; }
    return fb;
  };
  return {
    base00: p.bg,                                              // default background
    base01: p.bgPanel,                                         // lighter bg (status bars)
    base02: p.selection,                                       // selection background
    base03: p.fgMuted,                                         // comments, invisibles
    base04: p.fgMuted,                                         // dark foreground
    base05: p.fg,                                              // default foreground
    base06: p.fg,                                              // light foreground
    base07: p.fg,                                              // lightest foreground
    base08: sx(["variable", "keyword.operator"], a[1]!),       // red — variables
    base09: sx(["constant.numeric", "constant"], p.warning),   // orange — constants/numbers
    base0A: sx(["entity.name.type", "support.type"], a[3]!),   // yellow — classes/types
    base0B: sx(["string"], a[2]!),                             // green — strings
    base0C: sx(["support.function", "keyword.control"], a[6]!),// cyan — escapes/support
    base0D: sx(["entity.name.function"], a[4]!),               // blue — functions
    base0E: sx(["keyword", "storage.type"], a[5]!),            // magenta — keywords
    base0F: sx(["invalid", "constant.character"], a[1]!),      // brown — deprecated
  };
}

/** Standard base16 scheme YAML — the universal artifact (tinty/flavours/etc). */
export function toBase16Yaml(theme: VscodeTheme): string {
  const b = toBase16(theme);
  const hex = (k: keyof Base16) => b[k].replace(/^#/, "");
  const lines = Object.keys(b).map((k) => `  ${k}: "${hex(k as keyof Base16)}"`);
  return `system: "base16"
name: "${theme.name}"
author: "theme-engine (from VSCode theme)"
variant: "${theme.type}"
palette:
${lines.join("\n")}
`;
}
