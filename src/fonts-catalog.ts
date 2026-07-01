// A curated catalog of programming fonts, so the CLI and the Raycast picker can
// offer good defaults (with Nerd Font variants + one-tap install) instead of
// making you type a family name. Prefer the Nerd Font variant when present — it's
// a superset of the base font plus the icon glyphs that prompts, file explorers
// (yazi/neovim/lazygit) and statuslines rely on.
//
// `nerdFont` is the family string to set for the patched build; `name` is the
// plain family. `cask` is the Homebrew cask id for the Nerd Font build (macOS).
// Family/cask names verified against the Homebrew fonts tap; if one drifts it's a
// one-line fix here.
import { homedir } from "node:os";
import { join } from "node:path";
import { readdirSync } from "node:fs";

export interface CatalogFont {
  id: string;
  name: string;
  nerdFont?: string;
  cask?: string;
  ligatures?: boolean;
  note?: string;
}

export const FONT_CATALOG: CatalogFont[] = [
  { id: "jetbrains-mono", name: "JetBrains Mono", nerdFont: "JetBrainsMono Nerd Font", cask: "font-jetbrains-mono-nerd-font", ligatures: true },
  { id: "fira-code", name: "Fira Code", nerdFont: "FiraCode Nerd Font", cask: "font-fira-code-nerd-font", ligatures: true },
  { id: "cascadia-code", name: "Cascadia Code", nerdFont: "CaskaydiaCove Nerd Font", cask: "font-caskaydia-cove-nerd-font", ligatures: true },
  { id: "hack", name: "Hack", nerdFont: "Hack Nerd Font", cask: "font-hack-nerd-font" },
  { id: "iosevka", name: "Iosevka", nerdFont: "Iosevka Nerd Font", cask: "font-iosevka-nerd-font", ligatures: true },
  { id: "source-code-pro", name: "Source Code Pro", nerdFont: "SauceCodePro Nerd Font", cask: "font-sauce-code-pro-nerd-font" },
  { id: "meslo-lg", name: "Meslo LG", nerdFont: "MesloLGS Nerd Font", cask: "font-meslo-lg-nerd-font", note: "the p10k / powerline default" },
  { id: "monaspace", name: "Monaspace Neon", nerdFont: "Monaspice Ne Nerd Font", cask: "font-monaspace-nerd-font", ligatures: true, note: "GitHub's superfamily (Neon/Argon/Xenon/Radon/Krypton)" },
  { id: "victor-mono", name: "Victor Mono", nerdFont: "VictorMono Nerd Font", cask: "font-victor-mono-nerd-font", ligatures: true, note: "cursive italics" },
  { id: "commit-mono", name: "Commit Mono", nerdFont: "CommitMono Nerd Font", cask: "font-commit-mono-nerd-font", ligatures: true },
  { id: "geist-mono", name: "Geist Mono", nerdFont: "GeistMono Nerd Font", cask: "font-geist-mono-nerd-font" },
  { id: "ibm-plex-mono", name: "IBM Plex Mono", nerdFont: "BlexMono Nerd Font", cask: "font-blex-mono-nerd-font" },
  { id: "maple-mono", name: "Maple Mono", nerdFont: "Maple Mono NF", cask: "font-maple-mono-nf", ligatures: true, note: "rounded, smooth" },
  { id: "departure-mono", name: "Departure Mono", cask: "font-departure-mono", note: "pixel / bitmap style; no Nerd Font build" },
  { id: "berkeley-mono", name: "Berkeley Mono", ligatures: true, note: "paid (berkeleygraphics.com) — no Homebrew cask" },
];

// Font directories to scan for installed families (best-effort, no fontconfig
// dependency). Homebrew font casks symlink into ~/Library/Fonts on macOS.
function fontDirs(): string[] {
  const home = homedir();
  return process.platform === "darwin"
    ? ["/System/Library/Fonts", "/Library/Fonts", join(home, "Library", "Fonts")]
    : [join(home, ".local", "share", "fonts"), join(home, ".fonts"), "/usr/share/fonts", "/usr/local/share/fonts"];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

let _files: string[] | null = null;
function installedFontFiles(): string[] {
  if (_files) return _files;
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory() && depth > 0) walk(join(dir, e.name), depth - 1);
      else if (/\.(ttf|otf|ttc)$/i.test(e.name)) out.push(norm(e.name));
    }
  };
  for (const d of fontDirs()) walk(d, 3);
  return (_files = out);
}

/** Best-effort: is any of these family names installed? Matches the de-spaced
 *  family against installed font filenames (how cask-installed fonts land). */
export function isFamilyInstalled(...families: (string | undefined)[]): boolean {
  const keys = families.filter((f): f is string => !!f).map(norm);
  if (!keys.length) return false;
  const files = installedFontFiles();
  return files.some((f) => keys.some((k) => f.includes(k)));
}

/** Catalog augmented with install status + the family string to actually set
 *  (Nerd Font variant preferred). */
export function catalogWithStatus() {
  return FONT_CATALOG.map((f) => ({
    ...f,
    installed: isFamilyInstalled(f.nerdFont, f.name),
    setFamily: f.nerdFont && isFamilyInstalled(f.nerdFont) ? f.nerdFont : f.name,
  }));
}
