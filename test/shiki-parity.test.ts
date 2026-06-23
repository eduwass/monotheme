// Spec-parity oracle: shiki is the exact highlighter Cursor/VSCode use. We
// highlight real code with shiki using our theme, then assert resolveToken
// reproduces shiki's color for EVERY token's scope stack. This proves the
// color-resolution layer respects the TextMate/shiki spec end to end.
//
// (Tree-sitter token *classification* in nvim/Zed is a separate, parser-level
// concern outside this layer — see resolveToken docs.)
import { test, expect } from "bun:test";
import { resolve, dirname } from "node:path";
import { createHighlighter } from "shiki";
import { loadTheme } from "../src/load.ts";
import { resolveToken } from "../src/project.ts";

const D = dirname(new URL(import.meta.url).pathname);
const themePath = resolve(D, "..", "themes", "shades-of-purple.json");
const theme = loadTheme(themePath);

// Representative snippets per language — broad token variety (keywords, types,
// strings, numbers, comments, object keys, member access, decorators, JSX, etc).
const SAMPLES: Record<string, string> = {
  typescript: `// a comment
import { readFileSync } from "node:fs";
const statusSuggestions: Fig.Suggestion[] = [
  { name: "pending", description: "Task is pending" },
];
export function build(opts: Spec): number {
  const total = 0xFF + 42 * 3.14;
  const flag = true;
  return obj.value ?? total;
}
class Widget extends Base {
  #count = 0;
  @decorator readonly id: string = "x";
  get label(): string { return \`n=\${this.#count}\`; }
}
type Maybe<T> = T | null;
enum Color { Red, Green }
`,
  tsx: `import React from "react";
export const App = ({ title }: { title: string }) => {
  const [n, setN] = React.useState(0);
  return <div className="app" onClick={() => setN(n + 1)}>{title}: {n}</div>;
};
`,
  python: `import os
from typing import Optional

@dataclass
class Point:
    x: int = 0
    def dist(self) -> float:
        return (self.x ** 2) ** 0.5

def main(name: str = "world") -> None:
    # greet
    print(f"hello {name}", 42, True, None)
`,
  rust: `use std::collections::HashMap;
/// doc comment
pub fn main() {
    let mut m: HashMap<String, i32> = HashMap::new();
    m.insert("k".to_string(), 0xFF);
    for (k, v) in &m { println!("{k}={v}"); }
}
`,
  go: `package main
import "fmt"
// Greeter greets.
type Greeter struct{ Name string }
func (g *Greeter) Hi() string { return fmt.Sprintf("hi %s", g.Name) }
func main() { x := 42; fmt.Println(x, true, nil) }
`,
  css: `/* card */
.card { color: #ff0000; margin: 0 auto; width: calc(100% - 2rem); }
#id::before { content: "x"; }
`,
  json: `{ "name": "pkg", "version": "1.0.0", "private": true, "deps": null, "n": 42 }`,
};

const norm = (c?: string) => (c ?? "").toUpperCase();

test("shiki parity: resolveToken reproduces shiki's color for every token, all langs", async () => {
  const langs = Object.keys(SAMPLES);
  const hl = await createHighlighter({ themes: [{ ...theme, name: "sop" } as any], langs });
  const fg = norm(theme.colors["editor.foreground"]);

  let checked = 0;
  const mismatches: string[] = [];
  for (const lang of langs) {
    const { tokens } = hl.codeToTokens(SAMPLES[lang]!, { theme: "sop", lang, includeExplanation: true });
    for (const line of tokens) {
      for (const tk of line) {
        const want = norm(tk.color);
        const expl = tk.explanation?.[0];
        if (!expl) continue;
        const stack = expl.scopes.map((s) => s.scopeName); // outer→inner
        const got = resolveToken(theme.tokenColors, stack);
        // no matching rule → editor default foreground (what shiki also does).
        const gotFg = norm(got?.fg) || fg;
        checked++;
        if (gotFg !== want) {
          mismatches.push(`${lang} [${tk.content.trim().slice(0, 14)}] ${stack.join(">")} want=${want} got=${gotFg}`);
        }
      }
    }
  }
  hl.dispose();

  if (mismatches.length) {
    throw new Error(`${mismatches.length}/${checked} token colors diverged from shiki:\n` + mismatches.slice(0, 30).join("\n"));
  }
  expect(checked).toBeGreaterThan(150);
});
