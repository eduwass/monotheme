// The font catalog + install/detection. The DATA is generated (reused from the
// programmingfonts + nerd-fonts open-source catalogs — see scripts/gen-font-
// catalog.ts); this file only adds runtime logic: is-it-installed detection,
// Nerd-Font-preferred family resolution, and install (Homebrew cask or the
// nerd-fonts .tar.xz release asset, cross-platform).
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { readdirSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { CATALOG, type CatalogEntry } from "./fonts-catalog.gen.ts";

export type CatalogFont = CatalogEntry;
export const FONT_CATALOG: CatalogFont[] = CATALOG;

function fontDirs(): string[] {
  const home = homedir();
  return process.platform === "darwin"
    ? ["/System/Library/Fonts", "/Library/Fonts", join(home, "Library", "Fonts")]
    : [join(home, ".local", "share", "fonts"), join(home, ".fonts"), "/usr/share/fonts", "/usr/local/share/fonts"];
}
const userFontDir = () =>
  process.platform === "darwin" ? join(homedir(), "Library", "Fonts") : join(homedir(), ".local", "share", "fonts");

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
 *  family against installed font filenames (how cask/tar.xz fonts land). */
export function isFamilyInstalled(...families: (string | undefined)[]): boolean {
  const keys = families.filter((f): f is string => !!f).map(norm);
  if (!keys.length) return false;
  const files = installedFontFiles();
  return files.some((f) => keys.some((k) => f.includes(k)));
}

/** Catalog augmented with install status + the family to actually set. Nerd Font
 *  variant is preferred when installed (superset: base glyphs + icons that
 *  terminal prompts / file explorers need). */
export function catalogWithStatus() {
  return FONT_CATALOG.map((f) => {
    const nfInstalled = isFamilyInstalled(f.nerdFont);
    return {
      ...f,
      installed: nfInstalled || isFamilyInstalled(f.name),
      hasNerdFont: !!f.nerdFont,
      setFamily: f.nerdFont && nfInstalled ? f.nerdFont : f.name,
    };
  });
}

export function findFont(idOrName: string): CatalogFont | undefined {
  const q = norm(idOrName);
  return FONT_CATALOG.find((f) => norm(f.id) === q || norm(f.name) === q);
}

/** Resolve a user-supplied font (catalog id OR family name) to the family string
 *  to actually set — preferring the Nerd Font variant when it's installed (safe
 *  everywhere; a superset). Unknown/custom fonts pass through unchanged. */
export function resolveFamily(input: string): string {
  const f = findFont(input);
  if (!f) return input;
  return f.nerdFont && isFamilyInstalled(f.nerdFont) ? f.nerdFont : f.name;
}

/** Install a catalog font, preferring its Nerd Font variant. macOS → Homebrew
 *  cask; otherwise (or if brew missing) → download the nerd-fonts .tar.xz release
 *  asset and extract into the user font dir. Throws on failure. */
export function installFont(font: CatalogFont): { method: string; family: string } {
  const hasBrew = (() => { try { execSync("command -v brew", { stdio: "ignore" }); return true; } catch { return false; } })();

  if (process.platform === "darwin" && hasBrew && font.cask) {
    execSync(`brew install --cask ${font.cask}`, { stdio: "inherit" });
    return { method: `brew (${font.cask})`, family: font.nerdFont ?? font.name };
  }

  if (font.nfAsset) {
    // cross-platform: fetch the nerd-fonts release asset and unpack .ttf/.otf.
    const url = `https://github.com/ryanoasis/nerd-fonts/releases/latest/download/${font.nfAsset}.tar.xz`;
    const dir = userFontDir();
    mkdirSync(dir, { recursive: true });
    const tmp = join(tmpdir(), `monotheme-${font.nfAsset}.tar.xz`);
    execSync(`curl -fsSL -o "${tmp}" "${url}"`, { stdio: "inherit" });
    // extract only font files, flatten into the font dir
    execSync(`tar -xJf "${tmp}" -C "${dir}" --wildcards '*.ttf' '*.otf' 2>/dev/null || tar -xJf "${tmp}" -C "${dir}"`, { stdio: "inherit", shell: "/bin/bash" });
    execSync(`rm -f "${tmp}"`, { stdio: "ignore" });
    if (process.platform === "linux") { try { execSync("fc-cache -f", { stdio: "ignore" }); } catch {} }
    return { method: `nerd-fonts release (${font.nfAsset}.tar.xz)`, family: font.nerdFont ?? font.name };
  }

  throw new Error(`${font.name}: no Homebrew cask or Nerd Font asset to install from`);
}
