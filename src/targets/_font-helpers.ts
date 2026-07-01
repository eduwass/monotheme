// Shared font helpers for targets. Underscore-prefixed so the registry skips it
// (it's not a target). Each returns a short " + font(...)" status suffix, or "".
import type { Ctx } from "../target-kit.ts";

/** VSCode/Cursor: flat dotted keys in settings.json. editor.* ← editor role,
 *  terminal.integrated.* ← terminal role. UI font has no native VSCode setting,
 *  so the `ui` role is intentionally not written. */
export function applyVscodeFonts(c: Ctx, settings: string): string {
  const ed = c.font("editor"), term = c.font("terminal");
  const notes: string[] = [];
  if (ed.family && c.setJson(settings, "editor.fontFamily", ed.family)) notes.push("editor");
  if (ed.size) c.setJson(settings, "editor.fontSize", ed.size);
  if (term.family && c.setJson(settings, "terminal.integrated.fontFamily", term.family)) notes.push("terminal");
  if (term.size) c.setJson(settings, "terminal.integrated.fontSize", term.size);
  return notes.length ? ` + font(${notes.join(",")})` : "";
}
