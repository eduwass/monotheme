import { defineTarget } from "../target-kit.ts";
import { applyVscodeFonts } from "./_font-helpers.ts";

export default defineTarget({
  name: "cursor",
  // Cursor already has the theme installed (discovery found it there); just point its
  // workbench.colorTheme at the active theme's label. appSupport() resolves the right
  // path on mac (~/Library/Application Support) and linux (~/.config).
  detect: (c) => c.has(c.appSupport("Cursor", "User", "settings.json")),
  build: (c) => {
    const settings = c.appSupport("Cursor", "User", "settings.json");
    const color =
      c.entry.source === "local"
        ? "skipped — local theme has no editor label"
        : c.setJson(settings, "workbench.colorTheme", c.entry.label)
          ? `colorTheme = ${c.entry.label}`
          : "(not installed)";
    return color + applyVscodeFonts(c, settings, c.home(".cursor", "extensions"));
  },
});
