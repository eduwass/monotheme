import { defineTarget } from "../target-kit.ts";
import { toShiki } from "../formats/shiki.ts";
import { pick, stripAlpha } from "../load.ts";
import { resolveToken } from "../project.ts";

// hunk (0.15+) themes itself from TWO places, and we must drive BOTH or the UI
// and the syntax fall out of sync:
//   1. config.toml's [custom_theme] / [custom_theme.syntax] tables — all the
//      chrome (background, panels, borders, accent, line numbers, badges, the
//      9-token syntax fallback). This is what colours the whole TUI.
//   2. syntax_theme = "monotheme.json" — a full Shiki/VSCode theme used for the
//      actual diff syntax highlighting.
// The old target only rewrote (2), so switching to a light theme left the purple
// chrome from (1) frozen in place. Now we regenerate both from the active theme.
//
// We preserve everything in config.toml ABOVE the first [custom_theme] line (the
// user's own settings: theme="custom", hunk_headers, file_icons, borderless,
// menu_bar, comments) and replace the two colour tables wholesale. hunk keeps
// those tables last in the file, so a head-split is safe.
export default defineTarget({
  name: "hunk",
  detect: (c) => c.has(c.config("hunk", "config.toml")),
  build: (c) => {
    const t = c.theme;
    const p = c.palette;
    const col = (...keys: string[]) => {
      const v = pick(t.colors, keys);
      return v ? stripAlpha(v) : undefined;
    };
    const tok = (...scopes: string[]) => {
      for (const s of scopes) {
        const r = resolveToken(t.tokenColors, s);
        if (r?.fg) return stripAlpha(r.fg);
      }
      return undefined;
    };

    // hunk requires a built-in base theme to extend; match its light/dark to ours
    // so anything we don't override inherits a sane appearance.
    const base = t.type === "light" ? "catppuccin-latte" : "catppuccin-mocha";

    // Diff line backgrounds in VSCode themes are TRANSLUCENT (e.g. bluloco's
    // insertedTextBackground = #1ef1531f — green at 12% alpha). hunk wants an
    // opaque hex, so we composite that tint over the editor bg. stripAlpha alone
    // would yield a garish fully-saturated band. If the theme gives no diff color
    // we synthesize a subtle 15% wash from the git add/delete hue.
    const bg = p.bg;
    const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
    const rgb = (h: string) => { const s = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); };
    const over = (fg: string, a: number, base: string) => {
      const [fr, fg2, fb] = rgb(fg), [br, bgc, bb] = rgb(base);
      return `#${hex2(fr! * a + br! * (1 - a))}${hex2(fg2! * a + bgc! * (1 - a))}${hex2(fb! * a + bb! * (1 - a))}`;
    };
    // pull a diff color preserving its alpha; blend it over bg. raw 8-digit alpha
    // wins; a solid line-bg is used as-is; else wash the gutter hue at 15%.
    const diffBg = (lineKeys: string[], textKey: string, washHue: string) => {
      const line = pick(t.colors, lineKeys);
      if (line && stripAlpha(line) === line.replace(/^#/, "#")) {
        // 6-digit (opaque) line background — already a proper band.
        if (line.length === 7) return stripAlpha(line);
      }
      const txt = t.colors[textKey];
      if (txt && txt.length === 9) return over(stripAlpha(txt), parseInt(txt.slice(7, 9), 16) / 255, bg);
      if (line && line.length === 9) return over(stripAlpha(line), parseInt(line.slice(7, 9), 16) / 255, bg);
      return over(washHue, 0.15, bg);
    };
    const addedBg = diffBg(["diffEditor.insertedLineBackground"], "diffEditor.insertedTextBackground", col("editorGutter.addedBackground") ?? p.success);
    const removedBg = diffBg(["diffEditor.removedLineBackground"], "diffEditor.removedTextBackground", col("editorGutter.deletedBackground") ?? p.error);

    const palette: Record<string, string> = {
      base,
      label: t.name,
      syntax_theme: "monotheme.json",
      background: p.bg,
      panel: p.bgPanel,
      panelAlt: col("editorWidget.background", "panel.background") ?? p.bgPanel,
      border: p.border,
      accent: p.accent,
      accentMuted: p.bgPanel,
      text: p.fg,
      muted: p.fgMuted,
      addedBg,
      removedBg,
      contextBg: p.bg,
      addedContentBg: addedBg,
      removedContentBg: removedBg,
      contextContentBg: p.bg,
      addedSignColor: p.success,
      removedSignColor: p.error,
      lineNumberBg: p.bgPanel,
      lineNumberFg: col("editorLineNumber.foreground") ?? p.fgMuted,
      selectedHunk: p.selection,
      badgeAdded: p.success,
      badgeRemoved: p.error,
      badgeNeutral: p.fgMuted,
      fileNew: col("gitDecoration.addedResourceForeground") ?? p.success,
      fileDeleted: col("gitDecoration.deletedResourceForeground") ?? p.error,
      fileRenamed: col("gitDecoration.renamedResourceForeground") ?? p.accent,
      fileModified: col("gitDecoration.modifiedResourceForeground") ?? p.warning,
      fileUntracked: col("gitDecoration.untrackedResourceForeground") ?? p.ansi[6]!,
      noteBorder: p.accent,
      noteBackground: p.bgPanel,
      noteTitleBackground: p.bgPanel,
      noteTitleText: p.fg,
    };

    const syntax: Record<string, string> = {
      default: p.fg,
      keyword: tok("keyword") ?? p.ansi[5]!,
      string: tok("string") ?? p.ansi[2]!,
      comment: tok("comment") ?? p.fgMuted,
      number: tok("constant.numeric") ?? p.ansi[1]!,
      function: tok("entity.name.function") ?? p.ansi[3]!,
      property: tok("variable.other.property", "support.type.property-name") ?? p.fg,
      type: tok("entity.name.type", "support.type") ?? p.ansi[6]!,
      punctuation: tok("punctuation") ?? p.fg,
    };

    const toml = (table: string, rows: Record<string, string>) =>
      `[${table}]\n` + Object.entries(rows).map(([k, v]) => `${k} = "${v}"`).join("\n") + "\n";

    const cfgPath = c.config("hunk", "config.toml");
    const existing = c.read(cfgPath);
    const idx = existing.indexOf("[custom_theme]");
    // keep the user's settings above [custom_theme]; synthesize a minimal head if
    // the file had no custom theme yet.
    const head = idx >= 0 ? existing.slice(0, idx) : (existing ? existing.trimEnd() + "\n\n" : 'theme = "custom"\n\n');

    c.write(cfgPath, head + toml("custom_theme", palette) + "\n" + toml("custom_theme.syntax", syntax));

    // the full Shiki theme for diff syntax highlighting (the syntax_theme slot).
    c.write(c.config("hunk", "monotheme.json"), toShiki(t));

    return `config.toml [custom_theme] + monotheme.json`;
  },
});
