import { defineTarget } from "../target-kit.ts";
// Sublime fonts (opt-in). Sublime's font is a single app-wide setting (editor +
// UI together), so it reads the `editor` role. It lives in Preferences.sublime-
// settings (a JSON file), NOT the color-scheme file — hence a separate target.
function prefsPath(c: import("../target-kit.ts").Ctx): string {
  return c.mac
    ? c.appSupport("Sublime Text", "Packages", "User", "Preferences.sublime-settings")
    : c.config("sublime-text", "Packages", "User", "Preferences.sublime-settings");
}

export default defineTarget({
  name: "sublime-font",
  detect: (c) => {
    const f = c.font("editor");
    if (!f.family && f.size == null) return false;
    return c.mac
      ? c.has("/Applications/Sublime Text.app") || c.has(c.appSupport("Sublime Text"))
      : c.has(c.config("sublime-text")) || c.hasCmd("subl");
  },
  build: (c) => {
    const prefs = prefsPath(c);
    if (!c.has(prefs)) c.write(prefs, "{\n}\n"); // create if absent so setJson can patch
    const f = c.font("editor");
    const notes: string[] = [];
    if (f.family && c.setJson(prefs, "font_face", f.family)) notes.push("face");
    if (f.size != null && c.setJson(prefs, "font_size", f.size)) notes.push("size");
    return notes.length ? `font(${notes.join(",")})` : "no font set";
  },
});
