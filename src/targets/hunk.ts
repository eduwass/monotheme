import { defineTarget } from "../target-kit.ts";
import { pick, stripAlpha } from "../load.ts";

// Upstream Hunk 0.22+: chrome and TextMate syntax colors live in config.toml.
// Preserve user settings above [custom_theme] and replace the generated tables.
// No fork-only syntax_theme JSON or deprecated nine-role syntax table.
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

    // Upstream 0.22+ accepts TextMate selectors directly. Keep every foreground
    // rule, including language-specific selectors; later duplicate rules win.
    // ponytail: upstream accepts colors only, not token background/fontStyle.
    const syntax = new Map<string, string>();
    for (const rule of t.tokenColors) {
      if (!rule.settings.foreground || !rule.scope) continue;
      for (const group of Array.isArray(rule.scope) ? rule.scope : [rule.scope]) {
        for (const selector of group.split(",").map((s) => s.trim()).filter(Boolean)) {
          syntax.delete(selector);
          syntax.set(selector, stripAlpha(rule.settings.foreground));
        }
      }
    }

    const toml = (table: string, rows: Record<string, string>) =>
      `[${table}]\n` + Object.entries(rows).map(([k, v]) => `${JSON.stringify(k)} = ${JSON.stringify(v)}`).join("\n") + "\n";

    const cfgPath = c.config("hunk", "config.toml");
    const existing = c.read(cfgPath);
    const idx = existing.indexOf("[custom_theme]");
    // keep the user's settings above [custom_theme]; synthesize a minimal head if
    // the file had no custom theme yet.
    const head = idx >= 0 ? existing.slice(0, idx) : (existing ? existing.trimEnd() + "\n\n" : 'theme = "custom"\n\n');

    c.write(cfgPath, head + toml("custom_theme", palette) + "\n" + toml("custom_theme.syntax_scopes", Object.fromEntries(syntax)));

    return `config.toml [custom_theme] + syntax_scopes`;
  },
});
