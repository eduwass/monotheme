import { defineTarget } from "../target-kit.ts";
import { toTmTheme } from "../formats/tmtheme.ts";
import { pick, stripAlpha, flattenAlpha, mix, type VscodeTheme } from "../load.ts";
import type { Projection } from "../project.ts";

// tuicr (0.20+) reads a LOCAL THEME from ~/.config/tuicr/themes/<name>.toml — a
// flat TOML table of ~41 required color keys — plus an optional `syntax_theme`
// pointing at a sibling .tmTheme used by syntect for diff syntax highlighting.
// So we write both halves into one stable slot ("monotheme") and point
// config.toml's `theme` key at it once; from then on `theme set` just rewrites
// the slot in place.
//
// Two things the schema is strict about (it errors out, it doesn't warn):
//   - every key below is REQUIRED, and
//   - values must be a named terminal color or exactly `#RRGGBB` — no alpha.
// That's why every value goes through stripAlpha/flattenAlpha before it lands.

/** tuicr's LOCAL_THEME_KEYS (src/theme/mod.rs). Every one is required; anything
 *  else is dropped with a startup warning. Mirrored here so the test can prove
 *  we emit exactly this set — a tuicr release that adds a key fails loudly
 *  instead of silently rendering a half-themed TUI. */
export const TUICR_KEYS = [
  "panel_bg", "bg_highlight", "fg_primary", "fg_secondary", "fg_dim",
  "diff_add", "diff_add_bg", "diff_del", "diff_del_bg", "diff_context",
  "diff_hunk_header", "expanded_context_fg", "syntax_add_bg", "syntax_del_bg",
  "syntax_theme", "file_added", "file_modified", "file_deleted", "file_renamed",
  "reviewed", "pending", "comment_note", "comment_suggestion", "comment_issue",
  "comment_praise", "border_focused", "border_unfocused", "status_bar_bg",
  "cursor_color", "cursor_line_bg", "branch_name", "help_indicator",
  "message_info_fg", "message_info_bg", "message_warning_fg", "message_warning_bg",
  "message_error_fg", "message_error_bg", "update_badge_fg", "update_badge_bg",
  "mode_fg", "mode_bg",
] as const;

export function toTuicr(t: VscodeTheme, p: Projection): Record<string, string> {
  const col = (...keys: string[]) => pick(t.colors, keys);
  // raw (alpha-preserving) lookup, so diff washes can be composited not stripped
  const raw = (...keys: string[]) => {
    for (const k of keys) if (t.colors[k]) return t.colors[k];
    return undefined;
  };

  // Diff line backgrounds in VSCode themes are usually TRANSLUCENT (e.g.
  // #1ef1531f — green at 12%). tuicr needs opaque hex, so composite over the
  // editor bg; stripping the alpha instead would paint a garish solid band.
  // No diff color in the theme → synthesize a 12% wash from the add/del hue.
  const wash = (
    lineKeys: string[],
    textKeys: string[],
    hue: string,
  ): string => {
    const v = raw(...lineKeys) ?? raw(...textKeys);
    if (v) {
      // an opaque 6-digit value is already a finished band; use it as-is
      if (v.length === 7) return stripAlpha(v);
      return flattenAlpha(v, p.bg);
    }
    return mix(p.bg, hue, 0.12);
  };

  const addFg = col("editorGutter.addedBackground") ?? p.gitAdded ?? p.success;
  const delFg = col("editorGutter.deletedBackground") ?? p.gitDeleted ?? p.error;
  const diffAddBg = wash(["diffEditor.insertedLineBackground"], ["diffEditor.insertedTextBackground"], addFg);
  const diffDelBg = wash(["diffEditor.removedLineBackground"], ["diffEditor.removedTextBackground"], delFg);

  // tuicr's own themes make the syntax-highlighted diff bands ~60% as strong as
  // the plain ones (dark: #003c14 vs #00230c) so highlighted code stays legible
  // on top of them. Mirror that ratio rather than reusing the same band twice.
  const softer = (band: string) => mix(p.bg, band, 0.6);

  // Badge foregrounds sit ON a saturated fill, so neither p.fg nor p.bg is
  // universally safe (white-on-yellow, black-on-navy). Pick whichever of the
  // theme's own two poles contrasts with the fill — stays in-palette either way.
  const lum = (hex: string) => {
    const h = stripAlpha(hex).replace(/^#/, "");
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const dark = lum(p.bg) <= lum(p.fg) ? p.bg : p.fg;
  const light = lum(p.bg) <= lum(p.fg) ? p.fg : p.bg;
  const on = (fill: string) => (lum(fill) > 0.5 ? dark : light);

  // Some themes give sideBar/border/list-selection colors that are all but
  // identical to the editor bg — fine in VS Code (which also draws separators
  // and hover states), invisible in a TUI where the border IS the separator.
  // Keep the theme's value when it actually reads, else synthesize a lift.
  const visible = (v: string, fallback: string, eps = 0.025) =>
    Math.abs(lum(v) - lum(p.bg)) < eps ? fallback : v;

  const infoBg = p.ansi[6]!;
  const warnBg = p.warning;
  const errBg = p.error;

  const theme: Record<string, string> = {
    // base chrome
    panel_bg: p.bg,
    bg_highlight: visible(p.listSelected, mix(p.bg, p.fg, 0.16)),
    fg_primary: p.fg,
    // deliberately synthesized rather than read from descriptionForeground:
    // many themes set that to the same value as fgMuted, which would collapse
    // tuicr's three-step fg ramp (primary → secondary → dim) into two.
    fg_secondary: mix(p.fg, p.fgMuted, 0.5),
    fg_dim: p.fgMuted,

    // diff
    diff_add: addFg,
    diff_add_bg: diffAddBg,
    diff_del: delFg,
    diff_del_bg: diffDelBg,
    diff_context: p.fg,
    diff_hunk_header: col("editorLineNumber.activeForeground") ?? p.accent,
    expanded_context_fg: p.fgMuted,
    syntax_add_bg: softer(diffAddBg),
    syntax_del_bg: softer(diffDelBg),
    // resolved relative to this file; must end in .tmTheme or tuicr refuses it
    syntax_theme: "monotheme.tmTheme",

    // file list status
    file_added: p.gitAdded,
    file_modified: p.gitModified,
    file_deleted: p.gitDeleted,
    file_renamed: col("gitDecoration.renamedResourceForeground") ?? p.accent,

    // review status
    reviewed: p.success,
    pending: p.warning,

    // comment badges — note/suggestion lean on the blue/cyan ANSI pair the way
    // tuicr's bundled themes do; issue/praise reuse the semantic error/success.
    comment_note: p.ansi[4]!,
    comment_suggestion: p.ansi[6]!,
    comment_issue: p.error,
    comment_praise: p.success,

    // UI elements
    border_focused: p.borderActive,
    border_unfocused: visible(p.border, mix(p.bg, p.fgMuted, 0.55), 0.03),
    status_bar_bg: p.bgPanel,
    cursor_color: p.cursor,
    cursor_line_bg: visible(flattenAlpha(raw("editor.lineHighlightBackground") ?? p.bg, p.bg), mix(p.bg, p.fg, 0.08), 0.01),
    branch_name: p.ansi[6]!,
    help_indicator: p.fgMuted,

    // messages + update badge
    message_info_fg: on(infoBg),
    message_info_bg: infoBg,
    message_warning_fg: on(warnBg),
    message_warning_bg: warnBg,
    message_error_fg: on(errBg),
    message_error_bg: errBg,
    update_badge_fg: on(warnBg),
    update_badge_bg: warnBg,

    // mode indicator
    mode_fg: on(p.accent),
    mode_bg: p.accent,
  };
  return theme;
}

export default defineTarget({
  name: "tuicr",
  detect: (c) => c.hasCmd("tuicr") || c.has(c.config("tuicr", "config.toml")),
  build: (c) => {
    const t = c.theme;
    const themesDir = (f: string) => c.config("tuicr", "themes", f);
    c.write(
      themesDir("monotheme.toml"),
      `# generated by monotheme — do not edit; \`theme set <name>\` rewrites this file.\n` +
        `# source theme: ${t.name} (${t.type})\n\n` +
        Object.entries(toTuicr(t, c.palette)).map(([k, v]) => `${k} = "${v}"`).join("\n") + "\n",
    );
    c.write(themesDir("monotheme.tmTheme"), toTmTheme(t, { name: "Monotheme" }));

    // Point tuicr at the slot once, preserving the rest of the user's config.
    // `theme` outranks theme_dark/theme_light/appearance in tuicr's resolution
    // order, so setting it is enough. Anchored so theme_dark/theme_light survive.
    const cfgPath = c.config("tuicr", "config.toml");
    const existing = c.read(cfgPath);
    const line = `theme = "monotheme"`;
    if (!/^\s*theme\s*=/m.test(existing)) {
      c.write(cfgPath, existing ? `${line}\n${existing}` : `${line}\n`);
    } else if (!new RegExp(`^\\s*${line}\\s*$`, "m").test(existing)) {
      c.write(cfgPath, existing.replace(/^\s*theme\s*=.*$/m, line));
    }

    // No live reload: tuicr resolves its theme at startup and exposes no reload
    // signal, so a running TUI keeps its old colors until relaunched.
    return `themes/monotheme.toml + monotheme.tmTheme`;
  },
});
