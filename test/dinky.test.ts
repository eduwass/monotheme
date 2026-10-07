import { test, expect } from "bun:test";
import { loadTheme, stripAlpha } from "../src/load.ts";
import { project } from "../src/project.ts";
import { makeCtx } from "../src/target-kit.ts";
import dinky from "../src/targets/dinky.ts";

test("Dinky rewrites only [borders].active-color, and leaves a file without it untouched", () => {
  const theme = loadTheme(new URL("../themes/shades-of-purple.json", import.meta.url).pathname);
  const accent = stripAlpha(project(theme).accent).toLowerCase();
  const files = new Map<string, string>();
  let writes = 0;
  const ctx = {
    ...makeCtx(theme, project(theme), {
      label: theme.name, slug: "test", appearance: theme.type, source: "file", path: "",
    }),
    config: (...parts: string[]) => parts.join("/"),
    read: (path: string) => files.get(path) ?? "",
    write: (path: string, content: string) => { writes++; files.set(path, content); },
  };
  const run = (input: string) => {
    files.set("dinky/dinky.toml", input);
    const status = dinky.build!(ctx);
    return { status, output: files.get("dinky/dinky.toml")! };
  };

  // An `active-color` in another table, before and after [borders], must survive.
  const before = (color: string) => [
    "# my dinky config",
    "[other]",
    "active-color = '#111111'",
    "",
    "[borders]   # window borders",
    "enabled = true",
    "width = 2",
    `active-color = '${color}'        # the theme accent`,
    "inactive-color = '#00000000'    # no border on unfocused windows",
    "order = 'above'",
    "",
    "[[rules]]",
    "active-color = '#222222'",
    "",
  ].join("\n");
  const first = run(before("#FAD000"));
  expect(accent).toMatch(/^#[0-9a-f]{6}$/);
  expect(first.output).toBe(before(accent));
  expect(first.status).toContain(accent);
  expect((Bun.TOML.parse(first.output) as any).borders.width).toBe(2);
  expect(run(first.output).output).toBe(first.output); // idempotent

  // No [borders] table, or a [borders] table without the key: nothing is written.
  writes = 0;
  for (const input of ["[other]\nactive-color = '#111111'\n", "[borders]\nenabled = true\n", ""]) {
    const { status, output } = run(input);
    expect(output).toBe(input);
    expect(status).toContain("unchanged");
  }
  expect(writes).toBe(0);
});
