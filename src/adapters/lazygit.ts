// VSCode theme -> lazygit gui.theme block (YAML fragment, 4-space indented to sit
// under `gui:`). lazygit colors are hex strings (optionally with style modifiers).
// https://github.com/jesseduffield/lazygit/blob/master/docs/Config.md#color-attributes
import type { VscodeTheme } from "../load.ts";
import { project } from "../project.ts";

export function toLazygit(theme: VscodeTheme): string {
  const p = project(theme);
  return `  theme:
    activeBorderColor:
      - "${p.accent}"
      - bold
    inactiveBorderColor:
      - "${p.border}"
    searchingActiveBorderColor:
      - "${p.warning}"
    optionsTextColor:
      - "${p.fgMuted}"
    selectedLineBgColor:
      - "${p.bgPanel}"
    inactiveViewSelectedLineBgColor:
      - "${p.bgPanel}"
    unstagedChangesColor:
      - "${p.error}"
    defaultFgColor:
      - "${p.fgMuted}"
    cherryPickedCommitFgColor:
      - "${p.ansi[6]}"
    cherryPickedCommitBgColor:
      - "${p.bgPanel}"
`;
}
