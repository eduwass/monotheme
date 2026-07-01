import { defineTarget } from "../target-kit.ts";
import { applyVscodeFonts } from "./_font-helpers.ts";

export default defineTarget({
  name: "vscode",
  // Same as cursor: point VSCode's workbench.colorTheme at the active theme's label.
  detect: (c) => c.has(c.appSupport("Code", "User", "settings.json")),
  build: (c) => {
    const settings = c.appSupport("Code", "User", "settings.json");
    // colour is skipped for local themes (no editor label), but fonts are an
    // orthogonal axis and apply regardless.
    const color =
      c.entry.source === "local"
        ? "skipped — local theme has no editor label"
        : c.setJson(settings, "workbench.colorTheme", c.entry.label)
          ? `colorTheme = ${c.entry.label}`
          : "(not installed)";
    return color + applyVscodeFonts(c, settings, c.home(".vscode", "extensions"));
  },
});
