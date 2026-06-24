import { defineTarget } from "../target-kit.ts";
// VSCode theme -> Claude Code theme JSON ({name, base, overrides}).
import type { VscodeTheme } from "../load.ts";
import { pick, stripAlpha } from "../load.ts";
import { project } from "../project.ts";

export const CLAUDE_THEME_NAME = "Monotheme";

export function toClaude(theme: VscodeTheme): string {
  const p = project(theme);
  const c = theme.colors;
  const a = p.ansi;
  const addBg = pick(c, ["diffEditor.insertedLineBackground"]) ?? "#1f4d10";
  const delBg = pick(c, ["diffEditor.removedLineBackground"]) ?? "#5a1818";

  const overrides = {
    claude: p.accent, claudeShimmer: p.accent,
    claudeBlue_FOR_SYSTEM_SPINNER: p.fgMuted, claudeBlueShimmer_FOR_SYSTEM_SPINNER: p.fgMuted,
    permission: p.accent, permissionShimmer: p.accent,
    planMode: p.fgMuted,
    ide: a[5]!,
    promptBorder: p.border, promptBorderShimmer: p.borderActive,
    text: p.fg, inactive: p.fgMuted, inactiveShimmer: p.fgMuted, subtle: p.fgMuted,
    suggestion: p.fgMuted, remember: a[5]!,
    background: p.bg,
    success: p.success, error: p.error, warning: p.warning,
    merged: a[5]!, warningShimmer: p.warning,
    diffAdded: p.success, diffRemoved: p.error,
    diffAddedDimmed: addBg, diffRemovedDimmed: delBg,
    diffAddedWord: a[10]!, diffRemovedWord: a[9]!,
    professionalBlue: p.fgMuted, chromeYellow: p.accent, clawd_body: p.accent,
  };
  return JSON.stringify({ name: CLAUDE_THEME_NAME, base: theme.type, overrides }, null, 2) + "\n";
}

export default defineTarget({
  name: "claude",
  detect: (c) => c.has(c.home(".claude")),
  build: (c) => {
    c.write(c.home(".claude", "themes", "monotheme.json"), toClaude(c.theme));
    c.setJson(c.home(".claude", "settings.json"), "theme", `custom:${CLAUDE_THEME_NAME.toLowerCase()}`);
    return "themes/monotheme.json (restart to apply)";
  },
});
