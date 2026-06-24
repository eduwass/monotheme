# Writing a tool adapter

An adapter turns the canonical theme into one tool's native format. They're small,
pure, and self-contained — most are 20-40 lines. If you theme a tool, everyone else
gets it for free.

## The model

```
VSCode theme JSON
      │  load()            parse + normalize
      ▼
  VscodeTheme  ───────────────────────────────────────────┐
      │  project()         derive a flat palette           │  resolveToken()
      ▼                                                     ▼  any TextMate scope
   Projection  (bg, fg, accent, ansi[16], …)        scope → { fg, italic, … }
      │
      │  your adapter:  toMyTool(theme) -> string | object
      ▼
   targets.ts          write it to the right path + reload the running app
```

Two helpers give you everything:

- **`project(theme): Projection`** — the flat role palette most tools need:

  ```ts
  bg, bgPanel, fg, fgMuted, accent, border, borderActive,
  selection, cursor, success, error, warning,
  ansi: string[]   // 0..15, the 16 terminal colors
  warnings: string[]
  ```

  ANSI comes from the theme's `terminal.ansi*` keys when present, else it's derived
  from the syntax palette (and a warning is pushed).

- **`resolveToken(theme.tokenColors, scope): TokenStyle | undefined`** — resolve a
  TextMate scope (e.g. `"keyword.control"`, or a stack like
  `["source.ts", "entity.name.function"]`) to `{ fg, italic, bold, underline,
  strikethrough }`, using a faithful port of the vscode-textmate matcher. Use this
  for any tool that wants real per-scope syntax colors rather than 16 ANSI buckets.

Always run hex values through `stripAlpha()` (and `flattenAlpha(hex, bg)` when a
tool only accepts opaque hex but the theme expresses a color as a translucent
wash, e.g. diff backgrounds).

## A minimal adapter

`src/adapters/mytool.ts`:

```ts
// VSCode theme -> mytool's color config.
import type { VscodeTheme } from "../load.ts";
import { project } from "../project.ts";

export function toMyTool(theme: VscodeTheme): string {
  const p = project(theme);
  return [
    `background ${p.bg}`,
    `foreground ${p.fg}`,
    `accent     ${p.accent}`,
    `error      ${p.error}`,
  ].join("\n") + "\n";
}
```

For real syntax colors, reach for `resolveToken`:

```ts
import { resolveToken } from "../project.ts";

const kw = resolveToken(theme.tokenColors, "keyword")?.fg ?? p.accent;
const fn = resolveToken(theme.tokenColors, ["source.ts", "entity.name.function"])?.fg;
```

## Registering it

Add a target in `src/targets.ts`. There are two shapes:

**File target** — write a rendered string to a path, optionally reload:

```ts
{
  name: "mytool",
  mode: "generated",
  detect: hasConfig("mytool"),                 // skip if not installed
  dest: () => cfg("mytool", "theme.conf"),     // ~/.config/mytool/theme.conf
  render: toMyTool,
  reload: () => "pkill -USR2 mytool 2>/dev/null || true",
}
```

**Apply target** — for tools that need more than one file or custom logic:

```ts
{
  name: "mytool",
  mode: "generated",
  detect: hasConfig("mytool"),
  apply: ({ theme, entry }) => {
    writeFileSync(cfg("mytool", "themes", "dotfiles.json"), toMyTool(theme));
    return "mytool -> themes/dotfiles.json";   // status line shown to the user
  },
}
```

## Conventions

- **Stable-slot pattern.** Write into one fixed slot the tool's config points at
  permanently (e.g. a theme named `dotfiles`), rather than editing the tool's main
  config on every switch. Switching themes then overwrites the slot — no churn.
- **Detect, don't assume.** Use `detect` so the target no-ops when the tool isn't
  on this machine. Never hard-fail because a tool is absent.
- **Reload should be a no-op when the app isn't running.** Guard signals/CLIs with
  `… 2>/dev/null || true`.
- **Pure adapters.** The `to*` function takes a theme and returns a
  string/object — no IO, no globals. All filesystem/reload logic lives in the
  target. This keeps adapters trivially testable.
- **No new dependencies** unless genuinely unavoidable.

## Testing

```sh
bun run src/cli.ts check     # engine self-check (no writes)
bun test                     # unit tests + shiki syntax-parity oracle
```

If your tool consumes TextMate/shiki-style syntax, add cases to
`test/shiki-parity.test.ts` so its colors are verified against shiki token-for-token.

Then try it live: `theme set <name>` and look at the tool.
