import { defineTarget } from "../target-kit.ts";
import { pick, stripAlpha, type VscodeTheme } from "../load.ts";
import { project } from "../project.ts";

export const SNAP_TOKEN_KEYS = [
  "surface", "surface_raised", "surface_overlay", "text", "text_muted",
  "accent", "accent_text", "focus_border", "unfocused_border", "warning",
  "danger", "success", "stale", "font_family", "font_family_mono",
  "size_xs", "size_sm", "size_md", "size_lg", "size_xl", "weight_regular",
  "weight_bold", "line_height", "space_1", "space_2", "space_3", "space_4",
  "space_5", "space_6", "space_7", "space_8", "radius_sm", "radius_md",
  "radius_lg", "radius_pill", "shadow_none", "shadow_sm", "shadow_md",
  "motion_fast", "motion_normal", "motion_slow", "motion_easing",
] as const;

export function toSnap(
  theme: VscodeTheme,
  fontFamily = "sans-serif",
  fontFamilyMono = "monospace",
): string {
  const p = project(theme);
  const accentText = pick(theme.colors, [
    "button.foreground",
    "activityBarBadge.foreground",
    "badge.foreground",
  ]) ?? p.bg;
  const tokens = {
    surface: p.bg,
    surface_raised: p.bgPanel,
    surface_overlay: `${stripAlpha(p.bg)}cc`,
    text: p.fg,
    text_muted: p.fgMuted,
    accent: p.accent,
    accent_text: accentText,
    focus_border: p.borderActive,
    unfocused_border: p.border,
    warning: p.warning,
    danger: p.error,
    success: p.success,
    stale: p.fgMuted,
    font_family: fontFamily,
    font_family_mono: fontFamilyMono,
    size_xs: 11,
    size_sm: 12,
    size_md: 14,
    size_lg: 16,
    size_xl: 20,
    weight_regular: 400,
    weight_bold: 700,
    line_height: 120,
    space_1: 2,
    space_2: 4,
    space_3: 8,
    space_4: 12,
    space_5: 16,
    space_6: 24,
    space_7: 32,
    space_8: 48,
    radius_sm: 2,
    radius_md: 4,
    radius_lg: 8,
    radius_pill: 999,
    shadow_none: { offset_x: 0, offset_y: 0, blur: 0, color: "surface" },
    shadow_sm: { offset_x: 0, offset_y: 1, blur: 2, color: "unfocused_border" },
    shadow_md: { offset_x: 0, offset_y: 2, blur: 8, color: "unfocused_border" },
    motion_fast: 80,
    motion_normal: 160,
    motion_slow: 280,
    motion_easing: "ease_out",
  };
  return JSON.stringify({
    v: 1,
    ...tokens,
    surfaces: {
      halo: {
        accent: p.accent,
        shadow_md: { offset_x: 0, offset_y: 2, blur: 10, color: "accent" },
      },
    },
  }, null, 2) + "\n";
}

const shellQuote = (value: string) => `'${value.replaceAll("'", `'"'"'`)}'`;

export default defineTarget({
  name: "snap",
  detect: (c) => c.hasCmd("snap"),
  build: (c) => {
    const path = c.config("monotheme", "targets", "snap.v1.json");
    c.write(
      path,
      toSnap(c.theme, c.font("ui").family, c.font("mono").family),
    );
    c.run(`snap theme apply ${shellQuote(path)}`);
    return `targets/snap.v1.json (control-socket live-reload)`;
  },
});
