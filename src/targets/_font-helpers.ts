// Shared font helpers for targets. Underscore-prefixed so the registry skips it
// (it's not a target). Each returns a short " + font(...)" status suffix, or "".
import { readdirSync } from "node:fs";
import type { Ctx } from "../target-kit.ts";

/** VSCode/Cursor: flat dotted keys in settings.json. editor.* ← editor role,
 *  terminal.integrated.* ← terminal role. The `ui` role has no native VSCode
 *  setting — but if the `custom-ui-style` extension is installed we drive it
 *  through that (custom-ui-style.font.sansSerif = ui, .monospace = editor).
 *  `extDir` is the app's user-extensions dir, used to detect custom-ui-style. */
export function applyVscodeFonts(c: Ctx, settings: string, extDir?: string): string {
  const ed = c.font("editor"), term = c.font("terminal"), ui = c.font("ui");
  const notes: string[] = [];
  if (ed.family && c.setJson(settings, "editor.fontFamily", ed.family)) notes.push("editor");
  if (ed.size) c.setJson(settings, "editor.fontSize", ed.size);
  if (term.family && c.setJson(settings, "terminal.integrated.fontFamily", term.family)) notes.push("terminal");
  if (term.size) c.setJson(settings, "terminal.integrated.fontSize", term.size);

  const hasCustomUiStyle = !!extDir && (() => {
    try { return readdirSync(extDir).some((n) => n.includes("custom-ui-style")); } catch { return false; }
  })();
  if (hasCustomUiStyle) {
    // custom-ui-style injects CSS, so it can style the UI (sidebar/tabs) font —
    // the one thing VSCode won't. Requires the user run its "Reload" command once.
    if (ui.family && c.setJson(settings, "custom-ui-style.font.sansSerif", ui.family)) notes.push("ui⋯css");
    if (ed.family) c.setJson(settings, "custom-ui-style.font.monospace", ed.family);
  }
  return notes.length ? ` + font(${notes.join(",")})` : "";
}
