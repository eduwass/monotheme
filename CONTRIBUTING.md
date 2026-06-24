# Contributing

The highest-leverage contribution is a **new tool adapter** — see
[`docs/ADAPTERS.md`](docs/ADAPTERS.md). Theme one tool and everyone gets it.

## Setup

```sh
bun install
bun run src/cli.ts check     # self-check
bun test                     # unit tests + shiki syntax-parity oracle
```

## Ground rules

- **Pure adapters.** A `to*(theme)` function returns a string/object; all IO and
  reload logic lives in `src/targets.ts`. Adapters stay trivially testable.
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
