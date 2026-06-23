// Re-emit the active theme as a self-contained VSCode color theme named
// "Dotfiles", plus the minimal extension manifest nvim-textmate needs to load it.
// Feeding nvim-textmate OUR slot (instead of pointing it at raw editor extensions)
// avoids per-theme quirks: multi-variant naming ("GitHub Light" vs "GitHub Light
// Default"), include resolution, etc. We control one stable name.
import type { VscodeTheme } from "../load.ts";

export const NVIM_TM_THEME = "Dotfiles";

/** The VSCode theme JSON (colors + tokenColors) under the stable name. */
export function toVscodeTheme(theme: VscodeTheme): string {
  return JSON.stringify(
    { name: NVIM_TM_THEME, type: theme.type, colors: theme.colors, tokenColors: theme.tokenColors },
    null,
    2,
  ) + "\n";
}

/** Minimal VSCode-extension package.json pointing at the theme file. uiTheme
 *  picks the light/dark base so the host's defaults match. */
export function toVscodeThemeManifest(theme: VscodeTheme): string {
  return JSON.stringify(
    {
      name: "dotfiles-theme",
      version: "1.0.0",
      engines: { vscode: "*" },
      contributes: {
        themes: [
          { label: NVIM_TM_THEME, uiTheme: theme.type === "light" ? "vs" : "vs-dark", path: "./themes/dotfiles.json" },
        ],
      },
    },
    null,
    2,
  ) + "\n";
}
