import { defineTarget } from "../target-kit.ts";
// VSCode theme -> Zed theme family JSON (style + syntax map). Zed watches
// ~/.config/zed/themes/ and hot-reloads. We pin a stable theme name "Monotheme".
import type { VscodeTheme } from "../load.ts";
import { project, scopeColor, resolveToken } from "../project.ts";
import { ensureContrast } from "../contrast.ts";

export const ZED_THEME_NAME = "Monotheme";

// Blend two #rrggbb colours (t=0 → a, t=1 → b). Used to derive subtle chrome from
// bg→fg instead of the theme's UI border key, which is often the accent colour.
const mix = (a: string, b: string, t: number) => {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [ar, ag, ab] = rgb(a), [br, bg, bb] = rgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`;
};

export function toZed(theme: VscodeTheme): string {
  const p = project(theme);
  const t = theme.tokenColors;
  const a = p.ansi;
  // Subtle, theme-adaptive chrome so pane dividers/hovers don't glare (some themes
  // set their UI border to the accent colour, which Zed paints on every divider).
  // Deliberately dim/low-contrast by design — this is a decorative divider, not
  // something that needs to pass WCAG non-text contrast; visually louder reads as
  // busier UI chrome, not "more accessible."
  const border = mix(p.bg, p.fg, 0.14);
  const hover = mix(p.bg, p.fg, 0.07);
  const thumb = mix(p.bg, p.fg, 0.22);
  // Resolve a Zed syntax token from the theme's tokenColors the way shiki/VSCode
  // do — most-specific scope wins, color + font style resolved independently —
  // so Zed's treesitter highlighting matches what VSCode would render.
  const st = (scopes: (string | string[])[], fb: string) => {
    for (const s of scopes) {
      const r = resolveToken(t, s);
      if (r?.fg) {
        return {
          color: r.fg,
          ...(r.italic ? { font_style: "italic" as const } : {}),
          ...(r.bold ? { font_weight: 700 } : {}),
        };
      }
    }
    return { color: fb };
  };
  const tok = (color: string, style?: "italic", weight?: number) => ({
    color,
    ...(style ? { font_style: style } : {}),
    ...(weight ? { font_weight: weight } : {}),
  });

  const family = {
    $schema: "https://zed.dev/schema/themes/v0.2.0.json",
    name: ZED_THEME_NAME,
    author: "theme-engine",
    themes: [
      {
        name: ZED_THEME_NAME,
        appearance: theme.type,
        style: {
          background: p.bg,
          "editor.background": p.bg,
          "editor.foreground": p.fg,
          "editor.gutter.background": p.bg,
          "editor.line_number": p.fgMuted,
          "editor.active_line_number": p.accent,
          "editor.active_line.background": p.bgPanel,
          text: p.fg,
          "text.muted": p.fgMuted,
          "text.accent": p.accent,
          border: border,
          "border.variant": border,
          "border.focused": p.accent,
          "elevated_surface.background": p.bgPanel,
          "surface.background": p.bgPanel,
          "element.background": p.bgPanel,
          "element.hover": hover,
          "element.selected": p.listSelected,
          "element.active": p.listSelected,
          "ghost_element.hover": hover,
          "status_bar.background": p.bgPanel,
          "title_bar.background": p.bgPanel,
          "toolbar.background": p.bg,
          "tab_bar.background": p.bgPanel,
          "tab.active_background": p.bg,
          "tab.inactive_background": p.bgPanel,
          "panel.background": p.bgPanel,
          "scrollbar.thumb.background": thumb,
          "terminal.background": p.bg,
          "terminal.foreground": p.fg,
          "terminal.ansi.black": a[0], "terminal.ansi.red": a[1], "terminal.ansi.green": a[2],
          "terminal.ansi.yellow": a[3], "terminal.ansi.blue": a[4], "terminal.ansi.magenta": a[5],
          "terminal.ansi.cyan": a[6], "terminal.ansi.white": a[7], "terminal.ansi.bright_black": a[8],
          "terminal.ansi.bright_red": a[9], "terminal.ansi.bright_green": a[10], "terminal.ansi.bright_yellow": a[11],
          "terminal.ansi.bright_blue": a[12], "terminal.ansi.bright_magenta": a[13], "terminal.ansi.bright_cyan": a[14],
          "terminal.ansi.bright_white": a[15],
          error: p.error, warning: p.warning, success: p.success,
          // Zed reads these for tinted-button chrome (e.g. the branch-picker pill,
          // ButtonStyle::Tinted) — undefined here means Zed silently falls back to
          // its OWN default blue, ignoring the theme entirely. Matched to VS Code's
          // "Commit & Push" button: full-strength button.background where that's
          // already readable, otherwise nudged toward the theme's own `bg` (not a
          // generic black/white) until the label clears AA — bg/fg are guaranteed
          // to already pair well, so this stays inside the theme's own palette
          // (e.g. Shades of Purple's yellow drifts toward its dark purple, not
          // toward flat black) instead of desaturating into a gray wash.
          // NOTE: the label drawn on top is hardcoded by Zed itself to the theme's
          // generic `text` (crates/ui/.../button_like.rs: `cx.theme().colors().text`)
          // — there's no theme key for this button's foreground, so we can only
          // move the background; white/matched label text isn't reachable at all.
          "info.background": ensureContrast(p.accent, p.fg, p.bg),
          "info.border": ensureContrast(p.accent, p.fg, p.bg),
          "success.background": ensureContrast(p.gitAdded, p.fg, p.bg),
          "success.border": ensureContrast(p.gitAdded, p.fg, p.bg),
          "warning.background": ensureContrast(p.gitModified, p.fg, p.bg),
          "warning.border": ensureContrast(p.gitModified, p.fg, p.bg),
          "error.background": ensureContrast(p.gitDeleted, p.fg, p.bg),
          "error.border": ensureContrast(p.gitDeleted, p.fg, p.bg),
          created: p.gitAdded, modified: p.gitModified, deleted: p.gitDeleted,
          players: [{ cursor: p.cursor, background: p.cursor, selection: p.selection }],
          syntax: {
            comment: st(["comment"], a[8]!),
            "comment.doc": st(["comment.block.documentation", "comment"], a[8]!),
            keyword: st(["keyword.control", "keyword"], a[5]!),
            "keyword.import": st(["keyword.control.import", "keyword.control"], a[5]!),
            string: st(["string.quoted", "string"], a[2]!),
            "string.escape": st(["constant.character.escape"], a[6]!),
            "string.regex": st(["string.regexp"], a[2]!),
            "string.special": st(["string.other.link", "string"], a[2]!),
            "string.special.symbol": st(["constant.other.symbol", "string"], a[2]!),
            function: st(["entity.name.function", "meta.function-call", "support.function"], a[3]!),
            "function.method": st(["entity.name.function.member", "entity.name.function"], a[3]!),
            "function.builtin": st(["support.function"], a[3]!),
            constructor: st([["source.ts", "entity.name.type"], "entity.name.type.class", "entity.name.type", "entity.name.function"], a[6]!),
            // TS colors `source.ts entity.name.type` differently from bare (SoP:
            // mint vs gold); TS is the dominant case so prefer the contextual color.
            type: st([["source.ts", "entity.name.type"], "entity.name.type", "support.type", "entity.name.class", "support.class"], a[6]!),
            "type.builtin": st(["support.type.primitive", "support.type.builtin", "support.type"], a[6]!),
            number: st(["constant.numeric"], a[1]!),
            constant: st(["constant.other", "constant"], a[3]!),
            "constant.builtin": st(["constant.language", "support.constant"], a[3]!),
            boolean: st(["constant.language.boolean", "constant.language"], a[1]!),
            variable: st(["variable.other.readwrite", "variable.other", "variable"], p.fg),
            "variable.special": st(["variable.language", "variable.language.this", "support.variable"], a[5]!),
            // ponytail: treesitter lumps object-literal keys and member access into
            // one capture (it can't split them like TextMate does); object keys are
            // the dominant case, so resolve to the cyan object-key scope.
            "variable.member": st(["meta.object-literal.key", "support.type.property-name", "variable.other.property"], p.fg),
            property: st(["meta.object-literal.key", "support.type.property-name", "variable.other.property"], p.fg),
            attribute: st(["entity.other.attribute-name"], a[3]!),
            operator: st(["keyword.operator"], a[6]!),
            punctuation: st(["punctuation"], p.fg),
            "punctuation.bracket": st(["punctuation.definition", "meta.brace", "punctuation"], p.fg),
            "punctuation.delimiter": st(["punctuation.separator", "punctuation.terminator", "punctuation"], p.fg),
            "punctuation.special": st(["punctuation.definition.template-expression", "keyword.other"], a[5]!),
            tag: st(["entity.name.tag"], a[4]!),
            label: st(["entity.name.label", "constant.other.label"], a[3]!),
            namespace: st(["entity.name.namespace", "entity.name.type.module", "support.other.namespace"], p.fgMuted),
            title: { ...st(["markup.heading", "entity.name.section"], a[3]!), font_weight: 700 },
            link_uri: st(["markup.underline.link", "string.other.link"], a[6]!),
            link_text: st(["string.other.link", "markup.underline.link"], a[6]!),
            emphasis: tok(p.fg, "italic"),
            "emphasis.strong": { color: p.fg, font_weight: 700 },
            predictive: tok(p.fgMuted),
            hint: tok(p.fgMuted),
          },
        },
      },
    ],
  };
  return JSON.stringify(family, null, 2) + "\n";
}

export default defineTarget({
  name: "zed",
  // Zed watches its themes/ dir and hot-reloads; point settings.theme at our slot.
  build: (c) => {
    c.write(c.config("zed", "themes", "monotheme.json"), toZed(c.theme));
    const settings = c.config("zed", "settings.json");
    const ok = c.setJson(settings, "theme", ZED_THEME_NAME);
    // fonts (opt-in): editor + ui are top-level keys → setJson. Zed's terminal
    // font lives under a nested "terminal" object which the top-level patcher
    // can't reach, so it's left alone (inherits Zed's default).
    const ed = c.font("editor"), ui = c.font("ui");
    const notes: string[] = [];
    if (ed.family && c.setJson(settings, "buffer_font_family", ed.family)) notes.push("editor");
    if (ed.size) c.setJson(settings, "buffer_font_size", ed.size);
    if (ui.family && c.setJson(settings, "ui_font_family", ui.family)) notes.push("ui");
    if (ui.size) c.setJson(settings, "ui_font_size", ui.size);
    const font = notes.length ? ` + font(${notes.join(",")})` : "";
    return ok ? `theme = ${ZED_THEME_NAME}${font}` : "no settings.json";
  },
});
