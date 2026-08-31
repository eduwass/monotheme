// The theme browser: search the VS Code Marketplace (same gallery API as the
// CLI's `theme browse`), pull the .vsix straight into the browser, extract its
// themes, and paint a mock desktop — editor, herdr, sketchybar, accent border —
// with the REAL adapter code bundled in. Built by tools/site/build.ts → docs/browse.js.
import JSON5 from "json5";
import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import tsLang from "shiki/langs/typescript.mjs";
import type { VscodeTheme } from "../../src/load.ts";
import { searchThemes, SORT, type MarketTheme } from "../../src/market-search.ts";
import { slugify } from "../../src/slug.ts";
import { desktopVars, shellVars, type Flavor } from "./palette.ts";
import { readCentralDirectory, readTextEntry, inflateRawWeb } from "./zip.ts";
import { CATALOG, DEFAULT_THEME, THEMES_BASE, type CatalogEntry } from "./catalog.gen.ts";

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmtInstalls = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "k" : String(n));

const CODE = `import { project } from "monotheme";

// one source of truth, every tool
export async function apply(name: string) {
  const theme = await loadTheme(name);
  const palette = project(theme);
  for (const target of TARGETS) {
    if (!target.detect()) continue;
    target.write(palette);
  }
  return { ok: true, count: TARGETS.length };
}`;

// ── state ──────────────────────────────────────────────────────────────────
interface Selected { theme: VscodeTheme; source: { kind: "builtin"; slug: string } | { kind: "market"; ext: MarketTheme; slug: string } }
let selected: Selected | null = null;
let flavor: Flavor = "vscode";
let focused: "editor" | "herdr" = "editor";
let hl: HighlighterCore;
let themeSeq = 0;

// ── marketplace ────────────────────────────────────────────────────────────
interface Extracted { label: string; themes: VscodeTheme[] }
const extCache = new Map<string, Promise<Extracted>>();

async function fetchVsix(ext: MarketTheme): Promise<Uint8Array> {
  const urls = [
    `https://${ext.publisher}.gallery.vsassets.io/_apis/public/gallery/publisher/${ext.publisher}/extension/${ext.extension}/${ext.version}/assetbyname/Microsoft.VisualStudio.Services.VSIXPackage`,
    `https://marketplace.visualstudio.com/_apis/public/gallery/publishers/${ext.publisher}/vsextensions/${ext.extension}/${ext.version}/vspackage`,
  ];
  let lastErr: unknown;
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
      if (!res.ok) throw new Error(`download failed (${res.status})`);
      const len = Number(res.headers.get("content-length") ?? 0);
      if (len > 40 * 1024 * 1024) throw new Error(`extension is ${(len / 1048576).toFixed(0)} MB — too big to preview here`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

const uiToType = (ui?: string): "dark" | "light" => (ui === "vs" || ui === "hc-light" ? "light" : "dark");
const dirname = (p: string) => p.replace(/\/[^/]*$/, "");
const joinPath = (dir: string, rel: string) => {
  const parts = (dir + "/" + rel).split("/");
  const out: string[] = [];
  for (const s of parts) { if (s === "..") out.pop(); else if (s !== "." && s !== "") out.push(s); }
  return out.join("/");
};

async function extractThemes(ext: MarketTheme): Promise<Extracted> {
  const buf = await fetchVsix(ext);
  const entries = readCentralDirectory(buf);
  const read = (name: string) => readTextEntry(buf, entries, name, inflateRawWeb);
  const pkgText = await read("extension/package.json");
  if (!pkgText) throw new Error("no extension/package.json in the .vsix");
  const pkg = JSON5.parse(pkgText);
  const contributed: any[] = pkg?.contributes?.themes ?? [];
  if (!contributed.length) throw new Error(`${ext.id} contributes no colour themes`);
  const themes: VscodeTheme[] = [];
  for (const th of contributed) {
    if (!th?.path) continue;
    const path = joinPath("extension", th.path);
    const text = await read(path);
    if (!text) continue;
    if (text.trimStart().startsWith("<")) continue; // .tmTheme plists — the CLI handles those, the preview doesn't
    let raw: any;
    try { raw = JSON5.parse(text); } catch { continue; }
    let base: any = { colors: {}, tokenColors: [] };
    if (typeof raw.include === "string") {
      const incText = await read(joinPath(dirname(path), raw.include));
      if (incText) { try { base = JSON5.parse(incText); } catch {} }
    }
    const label: string = th.label ?? th.id ?? th.path;
    themes.push({
      name: label,
      // uiTheme wins over the file's `type` (authors get it wrong: tokyo-night's light
      // file says dark) — the same call the CLI makes via discover().
      type: th.uiTheme ? uiToType(th.uiTheme) : raw.type === "light" || base.type === "light" ? "light" : "dark",
      colors: { ...(base.colors ?? {}), ...(raw.colors ?? {}) },
      tokenColors: [...(base.tokenColors ?? base.settings ?? []), ...(raw.tokenColors ?? raw.settings ?? [])],
    });
  }
  if (!themes.length) throw new Error(`${ext.id}: could not read any of its theme files`);
  return { label: pkg.displayName ?? ext.displayName, themes };
}

function loadExtension(ext: MarketTheme): Promise<Extracted> {
  let p = extCache.get(ext.id);
  if (!p) { p = extractThemes(ext); extCache.set(ext.id, p); p.catch(() => extCache.delete(ext.id)); }
  return p;
}

// ── rendering ──────────────────────────────────────────────────────────────
async function highlight(theme: VscodeTheme): Promise<string> {
  const name = `mt-${++themeSeq}`;
  await hl.loadTheme({ name, type: theme.type, colors: theme.colors, tokenColors: theme.tokenColors } as any);
  const html = hl.codeToHtml(CODE, { lang: "typescript", theme: name });
  // keep the highlighter small: only the current theme stays loaded
  for (const t of hl.getLoadedThemes()) if (t !== name) { try { (hl as any).getInternalContext?.()?.themes?.delete?.(t); } catch {} }
  return html;
}

function setStatus(msg: string, kind: "info" | "error" | "" = "") {
  const el = $("#status"); el.textContent = msg; el.className = "status " + kind; el.hidden = !msg;
}

async function paint() {
  if (!selected) return;
  const { theme, source } = selected;
  const d = desktopVars(theme, flavor);
  const desk = $("#desktop");
  for (const [k, v] of Object.entries(d.vars)) desk.style.setProperty(k, v);
  desk.dataset.type = theme.type;
  // the page shell wears the theme too
  const root = document.documentElement;
  for (const [k, v] of Object.entries(shellVars(d.p))) root.style.setProperty(k, v);
  root.style.colorScheme = theme.type;
  root.dataset.type = theme.type;
  $("#code").innerHTML = await highlight(theme);
  // meta + command
  const slug = source.kind === "builtin" ? source.slug : source.slug;
  $("#meta-name").textContent = theme.name;
  $("#meta-type").textContent = theme.type;
  $("#meta-type").dataset.type = theme.type;
  $("#meta-src").textContent = source.kind === "builtin" ? "ships with monotheme" : `${source.ext.id} · ${fmtInstalls(source.ext.installs)} installs`;
  const cmd = source.kind === "builtin" ? `theme set ${slug}` : `theme add ${source.ext.id} && theme set ${slug}`;
  $("#cmd").textContent = cmd;
  $("#open-market").hidden = source.kind !== "market";
  if (source.kind === "market") $<HTMLAnchorElement>("#open-market").href = `https://marketplace.visualstudio.com/items?itemName=${source.ext.id}`;
  const swatches = $("#swatches");
  swatches.innerHTML = d.p.ansi.map((c, i) => `<i title="ansi ${i}" style="background:${c}"></i>`).join("");
  location.hash = source.kind === "builtin" ? `t/${slug}` : `m/${source.ext.id}/${slug}`;
}

function renderVariants(ext: MarketTheme, x: Extracted, active: string) {
  const el = $("#variants");
  if (x.themes.length < 2) { el.innerHTML = ""; return; }
  el.innerHTML = `<span class="lbl">${esc(x.label)} ships ${x.themes.length} variants</span>` +
    x.themes.map((t) => `<button class="chip${slugify(t.name) === active ? " on" : ""}" data-slug="${esc(slugify(t.name))}" data-type="${t.type}">${esc(t.name)}</button>`).join("");
  el.querySelectorAll<HTMLButtonElement>(".chip").forEach((b) => b.onclick = () => selectMarket(ext, x, b.dataset.slug!));
}

async function selectMarket(ext: MarketTheme, x: Extracted, slug?: string) {
  const theme = (slug && x.themes.find((t) => slugify(t.name) === slug)) ?? x.themes[0]!;
  selected = { theme, source: { kind: "market", ext, slug: slugify(theme.name) } };
  renderVariants(ext, x, slugify(theme.name));
  markActive(`m:${ext.id}`);
  await paint();
}

async function pickMarket(ext: MarketTheme, slug?: string) {
  setStatus(`fetching ${ext.id}…`, "info");
  markActive(`m:${ext.id}`);
  try {
    const x = await loadExtension(ext);
    await selectMarket(ext, x, slug);
    setStatus("");
  } catch (e) {
    setStatus(`${ext.id}: ${(e as Error).message}`, "error");
  }
}

const builtinCache = new Map<string, Promise<VscodeTheme>>();
async function pickBuiltin(entry: CatalogEntry) {
  markActive(`t:${entry.slug}`);
  $("#variants").innerHTML = "";
  let p = builtinCache.get(entry.slug);
  if (!p) {
    p = entry.slug === DEFAULT_THEME.slug
      ? Promise.resolve(DEFAULT_THEME.theme as VscodeTheme)
      : fetch(`${THEMES_BASE}/${entry.slug}.json`).then(async (r) => { if (!r.ok) throw new Error(`fetch failed (${r.status})`); const raw = JSON5.parse(await r.text()); return { name: raw.name ?? entry.name, type: entry.type, colors: raw.colors ?? {}, tokenColors: raw.tokenColors ?? raw.settings ?? [] } as VscodeTheme; });
    builtinCache.set(entry.slug, p); p.catch(() => builtinCache.delete(entry.slug));
  }
  try {
    const theme = await p;
    selected = { theme, source: { kind: "builtin", slug: entry.slug } };
    setStatus("");
    await paint();
  } catch (e) { setStatus(`${entry.slug}: ${(e as Error).message}`, "error"); }
}

function markActive(key: string) {
  document.querySelectorAll<HTMLElement>("[data-key]").forEach((el) => el.classList.toggle("on", el.dataset.key === key));
}

// ── lists ──────────────────────────────────────────────────────────────────
let lastResults: MarketTheme[] = [];
let page = 1, lastQuery = "", searching = 0;

function renderResults(list: MarketTheme[], append: boolean) {
  const ul = $("#results");
  const html = list.map((e) => `<li><button class="row" data-key="m:${esc(e.id)}" title="${esc(e.description)}"><span class="name">${esc(e.displayName)}</span><span class="sub">${esc(e.publisher)} · ${fmtInstalls(e.installs)}</span></button></li>`).join("");
  if (append) ul.insertAdjacentHTML("beforeend", html); else ul.innerHTML = html;
  ul.querySelectorAll<HTMLButtonElement>("button.row").forEach((b) => {
    const id = b.dataset.key!.slice(2);
    b.onclick = () => { const ext = lastResults.find((x) => x.id === id); if (ext) pickMarket(ext); };
  });
  if (selected?.source.kind === "market") markActive(`m:${selected.source.ext.id}`);
  $("#more").hidden = list.length < 20;
}

async function search(query: string, append = false) {
  const my = ++searching;
  if (!append) { page = 1; lastQuery = query; }
  $("#results").classList.add("busy");
  try {
    const sortBy = SORT[$<HTMLSelectElement>("#sort").value] ?? 4;
    const res = await searchThemes(query, { pageSize: 20, pageNumber: page, sortBy });
    if (my !== searching) return;
    lastResults = append ? [...lastResults, ...res] : res;
    renderResults(res, append);
    $("#results-empty").hidden = lastResults.length > 0;
  } catch (e) {
    if (my === searching) setStatus(`marketplace: ${(e as Error).message}`, "error");
  } finally { if (my === searching) $("#results").classList.remove("busy"); }
}

function renderCatalog() {
  $("#builtin").innerHTML = CATALOG.map((e) => `<li><button class="row" data-key="t:${e.slug}"><i class="sw" style="background:${e.bg};border-color:${e.accent}"><b style="background:${e.accent}"></b></i><span class="name">${esc(e.name)}</span><span class="sub">${e.type}</span></button></li>`).join("");
  $("#builtin").querySelectorAll<HTMLButtonElement>("button.row").forEach((b) => {
    const slug = b.dataset.key!.slice(2);
    b.onclick = () => { const e = CATALOG.find((x) => x.slug === slug); if (e) pickBuiltin(e); };
  });
}

// ── boot ───────────────────────────────────────────────────────────────────
async function fromHash(): Promise<boolean> {
  const h = decodeURIComponent(location.hash.slice(1));
  const t = /^t\/([a-z0-9-]+)$/.exec(h);
  if (t) { const e = CATALOG.find((x) => x.slug === t[1]); if (e) { await pickBuiltin(e); return true; } }
  const m = /^m\/([^/]+)\/([a-z0-9-]+)$/.exec(h);
  if (m) {
    const [, id, slug] = m;
    setStatus(`looking up ${id}…`, "info");
    try {
      const [pub, name] = id!.split(".");
      const hits = await searchThemes(`${pub} ${name}`, { pageSize: 25 });
      const ext = hits.find((x) => x.id.toLowerCase() === id!.toLowerCase());
      if (!ext) throw new Error("not found on the Marketplace");
      await pickMarket(ext, slug);
      return true;
    } catch (e) { setStatus(`${id}: ${(e as Error).message}`, "error"); }
  }
  return false;
}

async function main() {
  hl = await createHighlighterCore({ themes: [], langs: [tsLang], engine: createJavaScriptRegexEngine({ forgiving: true }) });
  renderCatalog();
  const q = $<HTMLInputElement>("#q");
  let timer = 0;
  q.oninput = () => { clearTimeout(timer); timer = window.setTimeout(() => search(q.value), 300); };
  $<HTMLSelectElement>("#sort").onchange = () => search(q.value);
  $("#more").onclick = () => { page++; search(lastQuery, true); };
  for (const w of ["editor", "herdr"] as const) $(`#win-${w}`).onmousedown = () => { focused = w; document.querySelectorAll(".win").forEach((x) => x.classList.toggle("focused", x.id === `win-${w}`)); };
  $("#copy").onclick = async () => {
    try { await navigator.clipboard.writeText($("#cmd").textContent ?? ""); $("#copy").textContent = "copied"; setTimeout(() => ($("#copy").textContent = "copy"), 1200); }
    catch { setStatus("clipboard blocked — select the command and copy it", "error"); }
  };
  window.addEventListener("hashchange", () => { fromHash(); });
  // first paint: the URL's theme, else the shipped default (embedded — no network)
  if (!(await fromHash())) await pickBuiltin(CATALOG.find((e) => e.slug === DEFAULT_THEME.slug)!);
  search("");
}

main().catch((e) => setStatus(`failed to start: ${(e as Error).message}`, "error"));

// exposed for the screenshot harness (tools/site/verify) — not a public API
(window as any).__mt = { pickBuiltin: (slug: string) => pickBuiltin(CATALOG.find((e) => e.slug === slug)!), pickMarketId: async (id: string) => { const [pub, name] = id.split("."); const hits = await searchThemes(`${pub} ${name}`, { pageSize: 25 }); const ext = hits.find((x) => x.id.toLowerCase() === id.toLowerCase()); if (!ext) throw new Error("not found"); await pickMarket(ext); }, search, state: () => ({ selected: selected && { name: selected.theme.name, type: selected.theme.type, source: selected.source.kind }, results: lastResults.length }) };
