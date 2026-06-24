import { defineTarget } from "../target-kit.ts";

export default defineTarget({
  name: "vscode",
  // Same as cursor: point VSCode's workbench.colorTheme at the active theme's label.
  detect: (c) => c.has(c.appSupport("Code", "User", "settings.json")),
  build: (c) =>
    c.entry.source === "local"
      ? "skipped — local theme has no editor label"
      : c.setJson(c.appSupport("Code", "User", "settings.json"), "workbench.colorTheme", c.entry.label)
        ? `colorTheme = ${c.entry.label}`
        : "(not installed)",
});
