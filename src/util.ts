import { readFileSync, writeFileSync, existsSync } from "node:fs";

/**
 * Set a single top-level key in a JSONC settings file to a string or number,
 * preserving the rest of the file (comments, formatting) via targeted replace.
 * Inserts the key after the opening brace if absent. Safe for hand-maintained
 * editor settings. Note: only top-level keys — VSCode-style flat dotted keys
 * ("terminal.integrated.fontFamily") count as top-level; genuinely nested
 * objects (Zed's "terminal": { "font_family" }) are not handled here.
 */
export function patchJsonStringKey(path: string, key: string, value: string | number): boolean {
  if (!existsSync(path)) return false;
  let s = readFileSync(path, "utf8");
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // match the existing value whether it's a string, number, boolean, or null.
  const re = new RegExp(`("${esc}"\\s*:\\s*)(?:"(?:[^"\\\\]|\\\\.)*"|-?[\\d.]+(?:[eE][+-]?\\d+)?|true|false|null)`);
  if (re.test(s)) {
    s = s.replace(re, `$1${JSON.stringify(value)}`);
  } else {
    s = s.replace(/\{/, `{\n  ${JSON.stringify(key)}: ${JSON.stringify(value)},`);
  }
  writeFileSync(path, s);
  return true;
}
