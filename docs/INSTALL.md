# Install

Requires [Bun](https://bun.sh).

```sh
git clone https://github.com/eduwass/monotheme ~/monotheme
cd ~/monotheme
bun install
```

## A `theme` command on your PATH

`bun link` registers the package's bins (`theme` and `monotheme`, both running the
CLI directly via Bun) into Bun's global bin directory:

```sh
cd ~/monotheme
bun link
theme list
```

Make sure Bun's global bin dir (`~/.bun/bin` by default) is on your `PATH`.

> Prefer no global link? Run it directly instead — `bun ~/monotheme/src/cli.ts <cmd>`
> — or drop a one-line launcher on your `PATH` that execs that.

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
