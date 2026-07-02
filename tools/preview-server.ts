// Local dev server for comparing the vscode vs zed adapter output side by side,
// with a WCAG contrast report — all computed by the real adapter code (project.ts
// / targets/zed.ts), not a reimplementation. `bun tools/preview-server.ts`.
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTheme } from "../src/load.ts";
import { runChecks } from "../src/contrast.ts";
import { vscodeFileTreeChecks, zedFileTreeChecks } from "./checks.ts";
import { REPO_THEMES } from "../src/paths.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 4173);

function listThemes(): string[] {
  return readdirSync(REPO_THEMES)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

function themeData(slug: string) {
  const theme = loadTheme(join(REPO_THEMES, slug + ".json"));
  const vscodeChecks = runChecks(vscodeFileTreeChecks(theme));
  const zedChecks = runChecks(zedFileTreeChecks(theme));
  const vscodeStyle = vscodeFileTreeChecks(theme).reduce((acc, c) => ({ ...acc, [c.label]: { fg: c.fg, bg: c.bg } }), {});
  const zedStyle = zedFileTreeChecks(theme).reduce((acc, c) => ({ ...acc, [c.label]: { fg: c.fg, bg: c.bg } }), {});
  return { name: theme.name, type: theme.type, vscode: { style: vscodeStyle, checks: vscodeChecks }, zed: { style: zedStyle, checks: zedChecks } };
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/api/themes") {
      return Response.json(listThemes());
    }
    if (url.pathname === "/api/theme") {
      const slug = url.searchParams.get("name");
      if (!slug) return new Response("missing ?name=", { status: 400 });
      try {
        return Response.json(themeData(slug));
      } catch (e) {
        return new Response(String(e), { status: 500 });
      }
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(Bun.file(join(HERE, "preview.html")), { headers: { "content-type": "text/html" } });
    }
    return new Response("not found", { status: 404 });
  },
});

console.log(`monotheme preview-compare → http://localhost:${PORT}`);
