// Optional cross-machine theme sync. Set one of these in your shell rc and every
// `theme set` mirrors the switch to that machine so all tools on both stay on the
// same theme:
//   THEME_PEER=<ssh-host>   — sync over plain SSH (BatchMode, fails fast if down).
//   THEME_PEER_CMD=<tmpl>   — bring your own transport; `{}` is replaced with the
//                             remote command (e.g. THEME_PEER_CMD='mybox run {}').
// We ship the resolved theme JSON (base64) and apply it from a file there, so the
// peer needn't have the theme installed. PATH is set explicitly since
// non-interactive shells may omit ~/.local/bin or bun. The peer runs with
// --no-propagate to break the echo. Neither set → no sync (returns null).
export function peerThemeCommand(themeB64: string): { peer: string; cmd: string } | null {
  const peer = process.env.THEME_PEER;
  const custom = process.env.THEME_PEER_CMD;
  if (!peer && !custom) return null;
  const apply =
    `export PATH="$HOME/.local/bin:$HOME/.bun/bin:$PATH"; mkdir -p "$HOME/.cache" && ` +
    `echo ${themeB64} | base64 --decode > "$HOME/.cache/theme-sync.json" && ` +
    `theme set "$HOME/.cache/theme-sync.json" --no-propagate`;
  if (custom) {
    return { peer: peer ?? "peer", cmd: custom.includes("{}") ? custom.replace("{}", apply) : `${custom} '${apply}'` };
  }
  return { peer: peer!, cmd: `ssh -o BatchMode=yes -o ConnectTimeout=8 ${peer} '${apply}'` };
}
