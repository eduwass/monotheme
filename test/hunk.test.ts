import { test, expect } from "bun:test";
import { loadTheme } from "../src/load.ts";
import { project } from "../src/project.ts";
import { makeCtx } from "../src/target-kit.ts";
import hunk from "../src/targets/hunk.ts";

test("Hunk exports upstream syntax scopes, preserves settings, and is idempotent", () => {
  const theme = loadTheme(new URL("../themes/shades-of-purple.json", import.meta.url).pathname);
  theme.tokenColors = [
    { scope: "comment, punctuation.definition.comment", settings: { foreground: "#abc8" } },
    { scope: ["entity.name.function", "keyword"], settings: { foreground: "#112233" } },
    { scope: "comment", settings: { foreground: "#445566" } },
    { scope: "string", settings: { fontStyle: "italic" } },
  ];
  const head = 'theme = "custom"\nhunk_headers = false\nmenu_bar = false\n\n';
  const files = new Map([["hunk/config.toml", head + '[custom_theme]\nbase = "github-dark-default"\n']]);
  const ctx = {
    ...makeCtx(theme, project(theme), {
      label: theme.name, slug: "test", appearance: theme.type, source: "file", path: "",
    }),
    config: (...parts: string[]) => parts.join("/"),
    read: (path: string) => files.get(path) ?? "",
    write: (path: string, content: string) => { files.set(path, content); },
  };
  hunk.build!(ctx);
  const output = files.get("hunk/config.toml")!;
  const parsed = Bun.TOML.parse(output) as any;
  expect(output.startsWith(head)).toBe(true);
  expect(parsed.theme).toBe("custom");
  expect(parsed.menu_bar).toBe(false);
  expect(parsed.custom_theme.syntax_scopes).toEqual({
    "punctuation.definition.comment": "#aabbcc",
    "entity.name.function": "#112233",
    keyword: "#112233",
    comment: "#445566",
  });
  expect(output.indexOf('"comment" =')).toBeGreaterThan(output.indexOf('"keyword" ='));
  expect(parsed.custom_theme.syntax).toBeUndefined();
  expect(parsed.custom_theme.syntax_theme).toBeUndefined();
  expect(files.size).toBe(1);
  hunk.build!(ctx);
  expect(files.get("hunk/config.toml")).toBe(output);

  files.set("hunk/config.toml", "");
  hunk.build!(ctx);
  expect((Bun.TOML.parse(files.get("hunk/config.toml")!) as any).theme).toBe("custom");
});
