// VSCode theme -> a Raycast custom theme, applied via Raycast's import deeplink.
// Format mirrors raycast/ray-so's makeRaycastImportUrl: non-color fields as query
// params + a `colors` param of 12 ordered hex values.
// colors order: background, backgroundSecondary, text, selection, loader,
//               red, orange, yellow, green, blue, purple, magenta
import type { VscodeTheme } from "../load.ts";
import { project } from "../project.ts";

export interface RaycastTheme {
  name: string;
  appearance: "dark" | "light";
  version: string;
  colors: Record<string, string>;
}

export function toRaycast(theme: VscodeTheme): RaycastTheme {
  const p = project(theme);
  const a = p.ansi;
  return {
    name: theme.name,
    appearance: theme.type,
    version: "1",
    colors: {
      background: p.bg,
      backgroundSecondary: p.bgPanel,
      text: p.fg,
      selection: p.selection,
      loader: p.accent,
      red: a[1]!,
      orange: p.warning,
      yellow: a[3]!,
      green: a[2]!,
      blue: a[4]!,
      purple: a[5]!,
      magenta: a[13]!,
    },
  };
}

/** Build the `raycast://theme?...` import deeplink. */
export function raycastImportUrl(theme: VscodeTheme): string {
  const t = toRaycast(theme);
  const order = [
    "background", "backgroundSecondary", "text", "selection", "loader",
    "red", "orange", "yellow", "green", "blue", "purple", "magenta",
  ];
  const params = [
    `name=${encodeURIComponent(t.name)}`,
    `appearance=${encodeURIComponent(t.appearance)}`,
    `version=${encodeURIComponent(t.version)}`,
    `colors=${order.map((k) => encodeURIComponent(t.colors[k]!)).join(",")}`,
  ];
  return `raycast://theme?${params.join("&")}`;
}
