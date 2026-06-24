# Contributing

The highest-leverage contribution is **support for a new tool** — and it's one file:
copy `src/targets/_template.ts`, fill it in, done (it's auto-discovered, nothing to
register). See [`docs/ADAPTERS.md`](docs/ADAPTERS.md). Theme one tool, everyone gets it.

## Setup

```sh
bun install
bun run src/cli.ts check     # self-check
bun test                     # unit tests + shiki syntax-parity oracle
```

## Ground rules

- **One file per tool** in `src/targets/`. Keep the format function pure (theme →
  string); the engine does the IO and reload via the context `c`, so targets stay
  testable and you never hardcode an OS-specific path.
- **Verify syntax against shiki.** If your tool consumes TextMate/shiki-style
  themes, add cases to `test/shiki-parity.test.ts` so colors are checked
  token-for-token against the reference highlighter.
- **No new dependencies** unless genuinely unavoidable.
- **Detect and no-op.** Targets must skip cleanly when the tool isn't installed.
- **No churn.** Use the stable-slot pattern so switching themes overwrites one slot
  rather than editing a tool's main config.

## PRs

Keep them focused (one tool / one fix). Make sure `bun run src/cli.ts check` and
`bun test` pass. Describe what the theme looks like before/after if it's a visual
change.
