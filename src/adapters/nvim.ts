// VSCode theme -> a complete nvim colorscheme (colors/dotfiles.lua). Editor/UI
// chrome comes from the projection role set; syntax + treesitter highlighting is
// resolved straight from the theme's tokenColors[] (the same data shiki/VSCode
// read) via resolveToken, so a given token kind gets the color AND font style
// VSCode would give it.
//
// ponytail: nvim highlights with treesitter, VSCode/shiki with TextMate grammars,
// which tokenize source differently — so highlighting is color-faithful per token
// kind, not byte-identical. Upgrade path for true parity would be a TextMate
// engine in nvim (none robust today).
import type { VscodeTheme } from "../load.ts";
import { mix } from "../load.ts";
import { project, scopeColor, resolveToken, type TokenStyle } from "../project.ts";

// nvim highlight group <- ordered candidate TextMate scopes (most specific first)
// <- fallback color. The first candidate that resolves in the theme wins; its
// fontStyle (italic/bold/underline) carries through.
// a candidate is a single scope OR a scope stack (outer→inner) when context
// matters (e.g. SoP colors `source.ts entity.name.type` differently from bare).
type Cand = string | string[];
type Row = [group: string, scopes: Cand[], fallback: string];

export function toNvim(theme: VscodeTheme): string {
  const p = project(theme);
  const a = p.ansi;
  const t = theme.tokenColors;

  // resolve a scope chain to {fg,italic,...}; fall back to a projection color.
  const rt = (scopes: string[], fallback: string): TokenStyle => {
    for (const s of scopes) {
      const r = resolveToken(t, s);
      if (r?.fg) return r;
    }
    return { fg: fallback };
  };

  const c = {
    bg: p.bg,
    panel: mix(p.bg, "#000000", 0.22),
    cursorLine: mix(p.bg, "#000000", 0.12),
    fg: p.fg,
    muted: p.fgMuted,
    lineNr: mix(p.bg, p.fgMuted, 0.42),
    indent: mix(p.bg, p.fgMuted, 0.28),
    visual: p.selection,
    accent: p.accent,
    error: p.error,
    warn: p.warning,
    info: a[6]!,
    hint: p.fgMuted,
    add: p.success,
    change: p.accent,
    del: p.error,
  };

  // SYNTAX/TREESITTER table — every row pulls color+style from tokenColors.
  const SYN: Row[] = [
    // comments
    ["@comment", ["comment"], a[5]!],
    ["@comment.documentation", ["comment.block.documentation", "comment"], a[5]!],
    // literals
    ["@string", ["string.quoted", "string"], a[2]!],
    ["@string.documentation", ["string.quoted.docstring", "string"], a[2]!],
    ["@string.regexp", ["string.regexp"], a[2]!],
    ["@string.escape", ["constant.character.escape"], a[1]!],
    ["@string.special", ["string.other.link", "string"], a[2]!],
    ["@character", ["constant.character", "string"], a[2]!],
    ["@character.special", ["constant.character.escape"], a[1]!],
    ["@number", ["constant.numeric"], a[1]!],
    ["@number.float", ["constant.numeric.float", "constant.numeric"], a[1]!],
    ["@boolean", ["constant.language.boolean", "constant.language"], a[1]!],
    ["@constant", ["constant.other", "constant"], a[1]!],
    ["@constant.builtin", ["constant.language", "support.constant"], a[1]!],
    ["@constant.macro", ["entity.name.constant", "constant"], a[1]!],
    // functions / methods
    ["@function", ["entity.name.function", "meta.function-call", "support.function"], p.accent],
    ["@function.call", ["meta.function-call", "entity.name.function"], p.accent],
    ["@function.builtin", ["support.function"], p.accent],
    ["@function.method", ["entity.name.function.member", "entity.name.function"], p.accent],
    ["@function.method.call", ["entity.name.function.member", "entity.name.function"], p.accent],
    ["@function.macro", ["entity.name.function.macro", "entity.name.function"], p.accent],
    ["@constructor", [["source.ts", "entity.name.type"], "entity.name.type.class", "entity.name.type", "entity.name.function"], p.fgMuted],
    // keywords
    ["@keyword", ["keyword.control", "keyword"], a[3]!],
    ["@keyword.function", ["storage.type.function", "storage.type", "keyword.control"], a[3]!],
    ["@keyword.operator", ["keyword.operator.expression", "keyword.operator", "keyword"], a[3]!],
    ["@keyword.import", ["keyword.control.import", "keyword.control"], a[3]!],
    ["@keyword.return", ["keyword.control.flow", "keyword.control"], a[3]!],
    ["@keyword.conditional", ["keyword.control.conditional", "keyword.control"], a[3]!],
    ["@keyword.repeat", ["keyword.control.loop", "keyword.control"], a[3]!],
    ["@keyword.exception", ["keyword.control.exception", "keyword.control"], a[3]!],
    ["@keyword.coroutine", ["keyword.control", "keyword"], a[3]!],
    ["@keyword.type", ["storage.type", "keyword"], a[3]!],
    ["@keyword.modifier", ["storage.modifier", "storage.type"], a[3]!],
    ["@keyword.directive", ["keyword.control.directive", "keyword.other", "keyword"], a[3]!],
    // types
    // bias type references to the TS context — SoP (and others) color
    // `source.ts entity.name.type` (mint) differently from the bare scope (gold);
    // TS is the dominant case so prefer the contextual color.
    ["@type", [["source.ts", "entity.name.type"], "entity.name.type", "support.type", "entity.name.class", "support.class"], p.fgMuted],
    ["@type.builtin", ["support.type.primitive", "support.type.builtin", "support.type"], p.fgMuted],
    ["@type.definition", [["source.ts", "entity.name.type"], "entity.name.type", "support.type"], p.fgMuted],
    ["@attribute", ["entity.other.attribute-name"], p.accent],
    // variables / properties
    ["@variable", ["variable.other.readwrite", "variable.other", "variable"], p.fg],
    ["@variable.builtin", ["variable.language", "variable.language.this", "support.variable"], a[6]!],
    ["@variable.parameter", ["variable.parameter"], p.fg],
    // ponytail: treesitter captures BOTH object-literal keys ({x: ...}) and member
    // access (obj.x) as @variable.member — it can't tell them apart, while VSCode
    // colors them differently (SoP: cyan keys vs gold access). Object keys are the
    // dominant case, so resolve to the cyan object-key scope; member access inherits
    // the same cyan (acceptable, no separate capture exists to split on).
    ["@variable.member", ["meta.object-literal.key", "support.type.property-name", "variable.other.property"], a[6]!],
    ["@property", ["meta.object-literal.key", "support.type.property-name", "variable.other.property"], a[6]!],
    ["@field", ["meta.object-literal.key", "support.type.property-name", "variable.other.property"], a[6]!],
    ["@module", ["entity.name.namespace", "entity.name.type.module", "support.other.namespace"], p.fgMuted],
    ["@label", ["entity.name.label", "constant.other.label"], p.accent],
    // operators / punctuation
    ["@operator", ["keyword.operator"], a[3]!],
    ["@punctuation.delimiter", ["punctuation.separator", "punctuation.terminator"], p.fg],
    ["@punctuation.bracket", ["punctuation.definition", "meta.brace"], p.fg],
    ["@punctuation.special", ["punctuation.definition.template-expression", "keyword.other"], a[3]!],
    // markup tags (html/jsx/vue)
    ["@tag", ["entity.name.tag"], a[6]!],
    ["@tag.builtin", ["entity.name.tag"], a[6]!],
    ["@tag.attribute", ["entity.other.attribute-name"], p.accent],
    ["@tag.delimiter", ["punctuation.definition.tag"], p.fg],
  ];

  // Legacy vim syntax groups (non-treesitter buffers) link to the captures above
  // so they stay consistent without a second resolution pass.
  const LINKS: [string, string][] = [
    ["Comment", "@comment"], ["String", "@string"], ["Character", "@character"],
    ["Number", "@number"], ["Float", "@number.float"], ["Boolean", "@boolean"],
    ["Constant", "@constant"], ["Keyword", "@keyword"], ["Statement", "@keyword"],
    ["Conditional", "@keyword.conditional"], ["Repeat", "@keyword.repeat"],
    ["Exception", "@keyword.exception"], ["Operator", "@operator"],
    ["Function", "@function"], ["Identifier", "@variable"], ["Type", "@type"],
    ["StorageClass", "@keyword.modifier"], ["Structure", "@type"],
    ["PreProc", "@keyword.directive"], ["Include", "@keyword.import"],
    ["Special", "@string.escape"], ["Delimiter", "@punctuation.delimiter"],
    ["Tag", "@tag"], ["Title", "@function"],
  ];

  const luaStyle = (s: TokenStyle, fg = s.fg) => {
    const parts = [`fg = "${fg}"`];
    if (s.italic) parts.push("italic = true");
    if (s.bold) parts.push("bold = true");
    if (s.underline) parts.push("underline = true");
    if (s.strikethrough) parts.push("strikethrough = true");
    return parts.join(", ");
  };
  const hl = (group: string, opts: Record<string, string | boolean>) => {
    const parts = Object.entries(opts).map(([k, v]) => `${k} = ${typeof v === "string" ? `"${v}"` : v}`);
    return `  hl("${group}", { ${parts.join(", ")} })`;
  };
  const synLines = SYN.map(([g, scopes, fb]) => `  hl("${g}", { ${luaStyle(rt(scopes, fb))} })`).join("\n");
  const linkLines = LINKS.map(([g, to]) => `  hl("${g}", { link = "${to}" })`).join("\n");
  const term = a.map((hex, i) => `vim.g.terminal_color_${i} = "${hex}"`).join("\n");

  return `-- ${theme.name} — generated by theme engine. Do not edit; run \`theme set <name>\`.
vim.o.background = "${theme.type}"
vim.cmd("highlight clear")
if vim.fn.exists("syntax_on") then vim.cmd("syntax reset") end
vim.g.colors_name = "dotfiles"
${term}

local hl = function(group, opts) vim.api.nvim_set_hl(0, group, opts) end

-- Editor chrome
${hl("Normal", { bg: c.bg, fg: c.fg })}
${hl("NormalNC", { bg: c.bg, fg: c.fg })}
${hl("NormalFloat", { bg: c.panel, fg: c.fg })}
${hl("FloatBorder", { bg: c.panel, fg: c.muted })}
${hl("SignColumn", { bg: c.bg })}
${hl("EndOfBuffer", { bg: c.bg, fg: c.bg })}
${hl("MsgArea", { bg: c.bg })}
${hl("CursorLine", { bg: c.cursorLine })}
${hl("CursorLineNr", { fg: c.accent, bold: true, bg: c.cursorLine })}
${hl("LineNr", { fg: c.lineNr, bg: c.bg })}
${hl("Visual", { bg: c.visual })}
${hl("ColorColumn", { bg: c.cursorLine })}
${hl("WinSeparator", { fg: c.panel, bg: c.bg })}
${hl("VertSplit", { fg: c.panel, bg: c.bg })}

-- Treesitter / syntax (resolved from tokenColors — VSCode parity)
${synLines}

-- Legacy syntax groups link to the resolved captures
${linkLines}

-- UI
${hl("Pmenu", { bg: c.panel, fg: c.muted })}
${hl("PmenuSel", { bg: c.visual, fg: c.fg })}
${hl("PmenuThumb", { bg: c.muted })}
${hl("StatusLine", { bg: c.panel, fg: c.muted })}
${hl("StatusLineNC", { bg: c.panel, fg: c.lineNr })}
${hl("TabLineSel", { bg: c.bg, fg: c.fg })}
${hl("Search", { bg: c.accent, fg: c.panel })}
${hl("IncSearch", { bg: scopeColor(t, "keyword") ?? c.warn, fg: c.panel })}
${hl("CurSearch", { bg: c.del, fg: c.panel })}
${hl("DiagnosticError", { fg: c.error })}
${hl("DiagnosticWarn", { fg: c.warn })}
${hl("DiagnosticInfo", { fg: c.info })}
${hl("DiagnosticHint", { fg: c.hint })}
${hl("GitSignsAdd", { fg: c.add, bg: c.bg })}
${hl("GitSignsChange", { fg: c.change, bg: c.bg })}
${hl("GitSignsDelete", { fg: c.del, bg: c.bg })}
${hl("IblIndent", { fg: c.indent })}
${hl("IblScope", { fg: c.muted })}

-- Neo-tree
${hl("NeoTreeNormal", { bg: c.bg, fg: c.muted })}
${hl("NeoTreeNormalNC", { bg: c.bg, fg: c.muted })}
${hl("NeoTreeDirectoryName", { fg: c.muted, bold: true })}
${hl("NeoTreeFileName", { fg: c.fg })}
${hl("NeoTreeGitModified", { fg: c.change })}
${hl("NeoTreeGitAdded", { fg: c.add })}
${hl("NeoTreeGitDeleted", { fg: c.del })}
${hl("NeoTreeIndentMarker", { fg: c.indent })}
${hl("NeoTreeCursorLine", { bg: c.cursorLine })}

-- Telescope
${hl("TelescopeNormal", { bg: c.panel, fg: c.fg })}
${hl("TelescopeBorder", { bg: c.panel, fg: c.indent })}
${hl("TelescopePromptTitle", { bg: c.accent, fg: c.panel, bold: true })}
${hl("TelescopePreviewTitle", { bg: c.add, fg: c.panel, bold: true })}
${hl("TelescopeResultsTitle", { bg: c.muted, fg: c.panel, bold: true })}
${hl("TelescopeSelection", { bg: c.visual, fg: c.fg })}
${hl("TelescopeMatching", { fg: c.accent, bold: true })}

-- Which-key
${hl("WhichKey", { fg: c.accent })}
${hl("WhichKeyGroup", { fg: c.muted })}
${hl("WhichKeyDesc", { fg: c.fg })}
${hl("WhichKeyFloat", { bg: c.panel })}
`;
}
