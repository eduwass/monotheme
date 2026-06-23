// The only machine-specific surface: where each tool's theme file lives + how to
// reload it. Keeping this isolated keeps the engine itself OSS-portable.
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import type { VscodeTheme } from "./load.ts";
import { toTmTheme } from "./adapters/tmtheme.ts";
import { toGhostty } from "./adapters/ghostty.ts";

const REPO = resolve(dirname(new URL(import.meta.url).pathname), "..", "..");

export interface Target {
  name: string;
  mode: "generated" | "manual" | "selector";
  /** absolute destination path for this theme */
  dest: (theme: VscodeTheme) => string;
  /** produce the file contents */
  render: (theme: VscodeTheme) => string;
  /** shell command run after writing (best-effort live reload); {} no-ops if tool absent */
  reload?: (theme: VscodeTheme) => string;
}

// A fixed "slot" each tool's selector points at permanently, so switching themes
// overwrites the slot rather than editing the tool's config (no repo churn).
export const SLOT = "dotfiles";

export const TARGETS: Target[] = [
  {
    name: "bat",
    mode: "generated",
    // config pins --theme="Dotfiles"; we overwrite the Dotfiles slot each switch.
    dest: () => join(homedir(), ".config", "bat", "themes", "Dotfiles.tmTheme"),
    render: (t) => toTmTheme(t, { name: "Dotfiles" }),
    // bat reads a compiled cache, so a rebuild is mandatory after writing.
    reload: () => "command -v bat >/dev/null && bat cache --build >/dev/null 2>&1 || true",
  },
  {
    name: "ghostty",
    mode: "generated",
    // ~/.config/ghostty is symlinked into the repo; config pins `theme = dotfiles`.
    dest: () => join(REPO, ".config", "ghostty", "themes", SLOT),
    render: toGhostty,
    // macOS ghostty ignores SIGUSR2 (config isn't auto-watched — ghostty#3643), so
    // drive its AppleScript `perform action "reload_config"`; Linux uses SIGUSR2.
    // Both no-op when ghostty isn't running.
    reload: () =>
      process.platform === "darwin"
        ? `osascript -e 'tell application "Ghostty" to perform action "reload_config" on terminal 1' >/dev/null 2>&1 || true`
        : "pkill -USR2 -x ghostty 2>/dev/null || true",
  },
];
