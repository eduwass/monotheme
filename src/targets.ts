// The only machine-specific surface: where each tool's theme file lives + how to
// reload it. Keeping this isolated keeps the engine itself OSS-portable.
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import type { VscodeTheme } from "./load.ts";
import { toTmTheme } from "./adapters/tmtheme.ts";
import { toGhostty } from "./adapters/ghostty.ts";
import { slugify } from "./discover.ts";

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

export const TARGETS: Target[] = [
  {
    name: "bat",
    mode: "generated",
    dest: (t) => join(homedir(), ".config", "bat", "themes", `${t.name}.tmTheme`),
    render: toTmTheme,
    // bat reads a compiled cache, so a rebuild is mandatory after writing.
    reload: () => "command -v bat >/dev/null && bat cache --build >/dev/null 2>&1 || true",
  },
  {
    name: "ghostty",
    mode: "generated",
    // ~/.config/ghostty is symlinked into the repo; add `theme = <slug>` to use it.
    dest: (t) => join(REPO, ".config", "ghostty", "themes", slugify(t.name)),
    render: toGhostty,
    // SIGUSR2 reloads a running ghostty; no-op when it isn't running (e.g. devbox).
    reload: () => "pkill -SIGUSR2 -x ghostty 2>/dev/null || true",
  },
];
