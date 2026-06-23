import { readFileSync, writeFileSync, existsSync } from "node:fs";

/**
 * Set a single top-level string key in a JSONC settings file, preserving the
 * rest of the file (comments, formatting) via targeted replace. Inserts the key
 * after the opening brace if absent. Safe for hand-maintained editor settings.
 */
export function patchJsonStringKey(path: string, key: string, value: string): boolean {
  if (!existsSync(path)) return false;
  let s = readFileSync(path, "utf8");
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`("${esc}"\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"`);
  if (re.test(s)) {
    s = s.replace(re, `$1${JSON.stringify(value)}`);
  } else {
    s = s.replace(/\{/, `{\n  ${JSON.stringify(key)}: ${JSON.stringify(value)},`);
  }
  writeFileSync(path, s);
  return true;
}
