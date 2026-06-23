// The only machine-specific surface: where each tool's theme file lives + how to
// reload it. Keeping this isolated keeps the engine itself OSS-portable.
import { homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import type { VscodeTheme } from "./load.ts";
import type { ThemeEntry } from "./discover.ts";
import { toTmTheme } from "./adapters/tmtheme.ts";
import { toGhostty } from "./adapters/ghostty.ts";
import { toTmux } from "./adapters/tmux.ts";
import { toBtop } from "./adapters/btop.ts";
import { toZed, ZED_THEME_NAME } from "./adapters/zed.ts";
import { toOpencode } from "./adapters/opencode.ts";
import { toClaude, CLAUDE_THEME_NAME } from "./adapters/claude.ts";
import { toYaziFlavor } from "./adapters/yazi.ts";
import { toShiki } from "./adapters/shiki.ts";
import { toHerdrTheme } from "./adapters/herdr.ts";
import { toFzf } from "./adapters/fzf.ts";
import { toNvim } from "./adapters/nvim.ts";
import { nearestAccent } from "./adapters/macos-accent.ts";
import { patchJsonStringKey } from "./util.ts";

const cfg = (...p: string[]) => join(homedir(), ".config", ...p);
const hasConfig = (...p: string[]) => () => existsSync(cfg(...p));
const hasCmd = (cmd: string) => () => {
  try { execSync(`command -v ${cmd}`, { stdio: "ignore" }); return true; } catch { return false; }
};

const REPO = resolve(dirname(new URL(import.meta.url).pathname), "..", "..");

export interface TargetCtx {
  theme: VscodeTheme;
  entry: ThemeEntry;
}

export interface Target {
  name: string;
  mode: "generated" | "manual" | "selector";
  /** only apply when this tool is present on this machine (OS/tool-aware). */
  detect?: () => boolean;
  /** file targets: write render(theme) to dest(theme), then reload. */
  dest?: (theme: VscodeTheme) => string;
  render?: (theme: VscodeTheme) => string;
  reload?: (theme: VscodeTheme) => string;
  /** custom targets (editors): do their own work; return a status line. */
  apply?: (ctx: TargetCtx) => string;
}

const MAC_APP_SUPPORT = join(homedir(), "Library", "Application Support");
function editorSelector(name: string, appDir: string): Target {
  // Set the editor's own colorTheme to the resolved theme's label (the theme is
  // already installed there, since discovery found it in that editor).
  return {
    name,
    mode: "selector",
    apply: ({ entry }) => {
      // Only a real editor theme has a label the editor's colorTheme will accept;
      // the local fallback's label is just a slug, so skip it.
      if (entry.source === "local") return `${name} (skipped — local theme has no editor label)`;
      const settings = join(MAC_APP_SUPPORT, appDir, "User", "settings.json");
      return patchJsonStringKey(settings, "workbench.colorTheme", entry.label)
        ? `${name} → colorTheme = ${entry.label}`
        : `${name} (not installed)`;
    },
  };
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
  {
    name: "tmux",
    mode: "generated",
    // .tmux.conf sources this file; we (re)define the @color-* vars in it.
    dest: () => join(homedir(), ".config", "tmux", "theme.conf"),
    render: toTmux,
    // re-source live into every running tmux server (no-op if none).
    reload: () => `tmux source-file "$HOME/.config/tmux/theme.conf" 2>/dev/null || true`,
  },
  {
    name: "btop",
    mode: "generated",
    // btop.conf pins color_theme = "dotfiles"; we overwrite that slot.
    dest: () => join(homedir(), ".config", "btop", "themes", "dotfiles.theme"),
    render: toBtop,
    // SIGUSR2 reloads btop's config/theme; no-op if not running.
    reload: () => "pkill -USR2 -x btop 2>/dev/null || true",
  },
  // Editors as sinks (set their own colorTheme). Mac-only paths; no-op elsewhere.
  editorSelector("cursor", "Cursor"),
  editorSelector("vscode", "Code"),
  {
    name: "zed",
    mode: "generated",
    // Zed's theme names won't match arbitrary VSCode labels, so generate a Zed
    // theme into a stable "Dotfiles" slot; Zed watches the dir and hot-reloads.
    apply: ({ theme }) => {
      const dir = join(homedir(), ".config", "zed", "themes");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "dotfiles.json"), toZed(theme));
      const ok = patchJsonStringKey(join(homedir(), ".config", "zed", "settings.json"), "theme", ZED_THEME_NAME);
      return ok ? `zed → themes/dotfiles.json (theme = ${ZED_THEME_NAME})` : "zed (no settings.json)";
    },
  },
  {
    name: "opencode",
    mode: "generated",
    apply: ({ theme }) => {
      const root = join(homedir(), ".config", "opencode");
      if (!existsSync(root)) return "opencode (not installed)";
      const dir = join(root, "themes");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "dotfiles.json"), toOpencode(theme));
      patchJsonStringKey(join(root, "tui.json"), "theme", "dotfiles");
      return "opencode → themes/dotfiles.json (restart to apply)";
    },
  },
  {
    name: "claude",
    mode: "generated",
    apply: ({ theme }) => {
      const root = join(homedir(), ".claude");
      if (!existsSync(root)) return "claude (not installed)";
      const dir = join(root, "themes");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "dotfiles.json"), toClaude(theme));
      patchJsonStringKey(join(root, "settings.json"), "theme", `custom:${CLAUDE_THEME_NAME.toLowerCase()}`);
      return "claude → themes/dotfiles.json (restart to apply)";
    },
  },
  {
    name: "yazi",
    mode: "generated",
    detect: hasConfig("yazi"),
    apply: ({ theme }) => {
      const flavor = cfg("yazi", "flavors", "dotfiles.yazi");
      mkdirSync(flavor, { recursive: true });
      writeFileSync(join(flavor, "flavor.toml"), toYaziFlavor(theme));
      writeFileSync(join(flavor, "tmtheme.xml"), toTmTheme(theme, { name: "Dotfiles" }));
      // point theme.toml's flavor at the slot (stable, one-time).
      const tt = cfg("yazi", "theme.toml");
      if (existsSync(tt)) {
        let s = readFileSync(tt, "utf8");
        s = s.replace(/(\bdark\s*=\s*)"[^"]*"/, `$1"dotfiles"`).replace(/(\blight\s*=\s*)"[^"]*"/, `$1"dotfiles"`);
        writeFileSync(tt, s);
      }
      return "yazi → flavors/dotfiles.yazi (relaunch to apply)";
    },
  },
  {
    name: "hunk",
    mode: "generated",
    detect: hasConfig("hunk", "config.toml"),
    // hunk consumes a shiki/VSCode theme via syntax_theme out of the box — just
    // (re)write that slot. UI [custom_theme] stays hand-tuned (not engine-managed),
    // so config.toml never churns.
    dest: () => cfg("hunk", "dotfiles.json"),
    render: toShiki,
  },
  {
    name: "herdr",
    mode: "generated",
    detect: hasConfig("herdr", "config.toml"),
    apply: ({ theme }) => {
      const conf = cfg("herdr", "config.toml");
      let s = readFileSync(conf, "utf8");
      // [theme.custom] is the trailing section; regenerate it.
      s = /\[theme\.custom\]/.test(s) ? s.replace(/\[theme\.custom\][\s\S]*$/, toHerdrTheme(theme)) : s + "\n" + toHerdrTheme(theme);
      writeFileSync(conf, s);
      // config-only change: reload-config (NOT restart). No-op if no server.
      try { execSync("herdr server reload-config", { stdio: "ignore" }); } catch {}
      return "herdr → [theme.custom] (reload-config)";
    },
  },
  {
    name: "fzf",
    mode: "generated",
    detect: hasCmd("fzf"),
    // sourced from .zshrc as FZF_DEFAULT_OPTS; next shell/fzf picks it up.
    dest: () => cfg("fzf", "theme.sh"),
    render: toFzf,
  },
  {
    name: "nvim",
    mode: "generated",
    detect: hasCmd("nvim"),
    // No per-theme nvim plugin is installed (only built-ins + shades_of_purple), so
    // generate a complete colorscheme into the `colors/dotfiles.lua` slot. nvim's
    // colorscheme.lua pins `colorscheme = "dotfiles"`; ~/.config/nvim is symlinked
    // into the repo, so write the slot at the repo path (gitignored).
    dest: () => join(REPO, ".config", "nvim", "colors", "dotfiles.lua"),
    render: toNvim,
    // Re-source the colorscheme live in every running nvim (best-effort over its
    // listen sockets); no-op when none are running.
    reload: () =>
      `for s in "$XDG_RUNTIME_DIR"/nvim.*.0 /tmp/nvim*/*.0; do [ -S "$s" ] && nvim --server "$s" --remote-send '<C-\\><C-N>:colorscheme dotfiles<CR>' 2>/dev/null; done; true`,
  },
  {
    name: "macos-accent",
    mode: "generated",
    detect: () => process.platform === "darwin", // no custom-hex API; nearest of 8 presets
    apply: ({ theme }) => {
      const p = nearestAccent(theme);
      execSync(`defaults write -g AppleAccentColor -int ${p.int}`, { stdio: "ignore" });
      execSync(`defaults write -g AppleHighlightColor -string ${JSON.stringify(p.highlight)}`, { stdio: "ignore" });
      return `macos-accent → ${p.name} (nearest preset; relaunch apps to fully apply)`;
    },
  },
];
