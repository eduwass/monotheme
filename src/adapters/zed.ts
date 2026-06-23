// VSCode theme -> Zed theme family JSON (style + syntax map). Zed watches
// ~/.config/zed/themes/ and hot-reloads. We pin a stable theme name "Dotfiles".
import type { VscodeTheme } from "../load.ts";
import { project, scopeColor } from "../project.ts";

export const ZED_THEME_NAME = "Dotfiles";

export function toZed(theme: VscodeTheme): string {
  const p = project(theme);
  const t = theme.tokenColors;
  const a = p.ansi;
  // syntax color from the first scope that resolves, else a fallback.
  const sx = (scopes: string[], fb: string) => {
    for (const s of scopes) { const c = scopeColor(t, s); if (c) return c; }
    return fb;
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
          border: p.border,
          "border.variant": p.border,
          "border.focused": p.accent,
          "elevated_surface.background": p.bgPanel,
          "surface.background": p.bgPanel,
          "element.background": p.bgPanel,
          "element.hover": p.border,
          "element.selected": p.selection,
          "element.active": p.selection,
          "ghost_element.hover": p.border,
          "status_bar.background": p.bgPanel,
          "title_bar.background": p.bgPanel,
          "toolbar.background": p.bg,
          "tab_bar.background": p.bgPanel,
          "tab.active_background": p.bg,
          "tab.inactive_background": p.bgPanel,
          "panel.background": p.bgPanel,
          "scrollbar.thumb.background": p.border,
          "terminal.background": p.bg,
          "terminal.foreground": p.fg,
          "terminal.ansi.black": a[0], "terminal.ansi.red": a[1], "terminal.ansi.green": a[2],
          "terminal.ansi.yellow": a[3], "terminal.ansi.blue": a[4], "terminal.ansi.magenta": a[5],
          "terminal.ansi.cyan": a[6], "terminal.ansi.white": a[7], "terminal.ansi.bright_black": a[8],
          "terminal.ansi.bright_red": a[9], "terminal.ansi.bright_green": a[10], "terminal.ansi.bright_yellow": a[11],
          "terminal.ansi.bright_blue": a[12], "terminal.ansi.bright_magenta": a[13], "terminal.ansi.bright_cyan": a[14],
          "terminal.ansi.bright_white": a[15],
          error: p.error, warning: p.warning, success: p.success,
          created: p.success, modified: p.warning, deleted: p.error,
          players: [{ cursor: p.cursor, background: p.cursor, selection: p.selection }],
          syntax: {
            comment: tok(sx(["comment"], a[8]!), "italic"),
            "comment.doc": tok(sx(["comment"], a[8]!), "italic"),
            keyword: tok(sx(["keyword", "storage.type", "storage.modifier"], a[5]!)),
            string: tok(sx(["string"], a[2]!)),
            "string.escape": tok(sx(["constant.character.escape"], a[6]!)),
            function: tok(sx(["entity.name.function", "support.function"], a[3]!)),
            type: tok(sx(["entity.name.type", "support.type", "support.class"], a[6]!)),
            number: tok(sx(["constant.numeric"], a[1]!)),
            constant: tok(sx(["constant.language", "constant"], a[3]!)),
            boolean: tok(sx(["constant.language.boolean", "constant.language"], a[1]!)),
            variable: tok(sx(["variable"], p.fg)),
            property: tok(sx(["variable.other.property", "support.type.property-name"], p.fg)),
            "variable.special": tok(sx(["variable.language"], a[5]!)),
            operator: tok(sx(["keyword.operator"], a[6]!)),
            punctuation: tok(sx(["punctuation"], p.fg)),
            "punctuation.bracket": tok(sx(["punctuation"], p.fg)),
            tag: tok(sx(["entity.name.tag"], a[4]!)),
            attribute: tok(sx(["entity.other.attribute-name"], a[3]!)),
            label: tok(sx(["entity.name.label"], a[3]!)),
            title: tok(sx(["markup.heading", "entity.name.section"], a[3]!), undefined, 700),
            link_uri: tok(sx(["markup.underline.link"], a[6]!)),
            emphasis: tok(p.fg, "italic"),
          },
        },
      },
    ],
  };
  return JSON.stringify(family, null, 2) + "\n";
}
