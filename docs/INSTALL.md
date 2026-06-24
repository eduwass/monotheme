# Install

Requires [Bun](https://bun.sh).

```sh
git clone https://github.com/eduwass/monotheme ~/monotheme
cd ~/monotheme
bun install
```

## A `theme` command on your PATH

monotheme runs `.ts` directly with Bun. Add a tiny launcher so you can type
`theme` anywhere:

```sh
mkdir -p ~/.local/bin
cat > ~/.local/bin/theme <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
exec bun "$HOME/monotheme/src/cli.ts" "$@"
EOF
chmod +x ~/.local/bin/theme
```

Make sure `~/.local/bin` is on your `PATH`.

## Re-apply on shell start

So new shells pick up the active theme (and tools that only read config at launch
stay correct), add to your `~/.zshrc` / `~/.bashrc`:

```sh
command -v theme >/dev/null && theme init
```

## Per-tool wiring

Each tool needs its config pointed at the slot monotheme writes — usually a
one-time edit (e.g. ghostty `theme = dotfiles`, btop `color_theme = dotfiles`,
fzf sources `~/.config/fzf/theme.sh`). The first `theme set` prints where it wrote
each file; point the tool there once and future switches are automatic.

## Cross-machine sync (optional)

Set in your shell rc:

```sh
export THEME_PEER=my-other-host          # sync over SSH
# or, for a non-SSH transport:
export THEME_PEER_CMD='mytool run {}'    # {} is replaced with the remote command
```

Every `theme set` then mirrors the switch to that machine.
