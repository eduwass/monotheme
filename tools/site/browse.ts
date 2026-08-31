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
import { ANSI_KEYS } from "../../src/project.ts";
import { desktopVars, shellVars, canonicalTheme, ROLE_SPECS, ANSI_NAMES, type Flavor } from "./palette.ts";
import { extractThemes, type Extracted } from "./market-extract.ts";
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
let overrides: Record<string, string> = {};
let pendingOverrides: Record<string, string> | null = null; // parsed from a share link, applied on next selection
let hl: HighlighterCore;
let themeSeq = 0;

// ── marketplace ────────────────────────────────────────────────────────────
const extCache = new Map<string, Promise<Extracted>>();

function loadExtension(ext: MarketTheme): Promise<Extracted> {
  let p = extCache.get(ext.id);
  if (!p) { p = extractThemes(ext); extCache.set(ext.id, p); p.catch(() => extCache.delete(ext.id)); }
  return p;
}

// ── tweaks ─────────────────────────────────────────────────────────────────
const dirty = () => Object.keys(overrides).length > 0;
function effectiveTheme(): VscodeTheme {
  const t = selected!.theme;
  return dirty() ? { ...t, colors: { ...t.colors, ...overrides } } : t;
}
function tweak(key: string, value: string) {
  // project() honours terminal.ansi* only when ALL 16 exist — materialise the
  // currently-derived palette first so a single ANSI tweak takes effect.
  if (key.startsWith("terminal.ansi") && !ANSI_KEYS.every((k) => effectiveTheme().colors[k])) {
    const cur = desktopVars(effectiveTheme(), flavor).p.ansi;
    for (let i = 0; i < 16; i++) overrides[ANSI_KEYS[i]!] ??= cur[i]!;
  }
  overrides[key] = value;
  // live drag: repaint the desktop but DON'T rebuild the inspector — replacing
  // the <input> mid-drag closes the native color picker. The full inspector
  // refresh happens on 'change' (picker closed) or when the selection changes.
  paint(false);
}
const b64e = (o: object) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o)))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const b64d = (t: string) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(t.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0))));

function renderInspector(d: ReturnType<typeof desktopVars>) {
  const roleRow = (name: string, key: string, val: string, note: string, mono = false) =>
    `<label class="insp-row"><input type="color" value="${val}" data-key="${esc(key)}"><span class="rname">${esc(name)}${mono ? "" : `<small>${esc(key)}</small>`}</span><span class="rnote">${esc(note)}</span></label>`;
  $("#insp-roles").innerHTML = ROLE_SPECS.map((r) => roleRow(r.role, r.key, r.get(d.p), r.note)).join("");
  $("#insp-ansi").innerHTML = d.p.ansi.map((c, i) => roleRow(ANSI_NAMES[i]!, ANSI_KEYS[i]!, c, "", true)).join("");
  document.querySelectorAll<HTMLInputElement>(".insp-row input").forEach((inp) => {
    let raf = 0;
    inp.oninput = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => tweak(inp.dataset.key!, inp.value)); };
    inp.onchange = () => paint(); // picker closed — refresh dependent swatches
  });
  syncInspectorButtons();
}
function syncInspectorButtons() {
  for (const b of ["insp-reset", "insp-share", "insp-dl"]) ($(`#${b}`) as HTMLButtonElement).disabled = !dirty();
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

async function paint(rebuildInspector = true) {
  if (!selected) return;
  const { source } = selected;
  const theme = effectiveTheme();
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
  const cmd = dirty()
    ? `theme set ~/Downloads/${slug}-tweaked.json   # download json above first`
    : source.kind === "builtin" ? `theme set ${slug}` : `theme add ${source.ext.id} && theme set ${slug}`;
  $("#cmd").textContent = cmd;
  $("#open-market").hidden = source.kind !== "market";
  if (source.kind === "market") $<HTMLAnchorElement>("#open-market").href = `https://marketplace.visualstudio.com/items?itemName=${source.ext.id}`;
  const swatches = $("#swatches");
  swatches.innerHTML = d.p.ansi.map((c, i) => `<i title="ansi ${i}" style="background:${c}"></i>`).join("");
  // replaceState, not location.hash: assigning the hash fires hashchange and
  // would re-run the (network) hash router after every local selection.
  const tweaks = dirty() ? `~${b64e(overrides)}` : "";
  history.replaceState(null, "", (source.kind === "builtin" ? `#t/${slug}` : `#m/${source.ext.id}/${slug}`) + tweaks);
  if (rebuildInspector) renderInspector(d); else syncInspectorButtons();
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
  if (selected?.theme !== theme) overrides = pendingOverrides ?? {};
  pendingOverrides = null;
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
    if (selected?.theme !== theme) overrides = pendingOverrides ?? {};
    pendingOverrides = null;
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
  const sw = (e: MarketTheme) => e.icon
    ? `<i class="sw ico"><img src="${esc(e.icon)}" alt="" loading="lazy" onerror="this.parentElement.replaceChildren(this.parentElement.dataset.l)"><\/i>`.replace("<\/i>", "</i>").replace('<i class="sw ico">', `<i class="sw ico" data-l="${esc(e.displayName[0] ?? "?")}">`)
    : `<i class="sw ico" data-l="">${esc(e.displayName[0] ?? "?")}</i>`;
  const html = list.map((e) => `<li><button class="row" data-key="m:${esc(e.id)}" title="${esc(e.description)}">${sw(e)}<span class="name">${esc(e.displayName)}</span><span class="sub">${esc(e.publisher)} · ${fmtInstalls(e.installs)}</span></button></li>`).join("");
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
    // text queries always rank by installs — the well-known theme should be hit #1
    // (Marketplace "relevance" buries it); the dropdown governs browsing.
    const sortBy = query.trim() ? SORT.installs! : SORT[$<HTMLSelectElement>("#sort").value] ?? 4;
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

// ── discover ───────────────────────────────────────────────────────────────
// Random theme: a random page of the Marketplace's theme category, a random
// extension off it, a random variant out of that. Retries past extensions that
// fail to extract (tmTheme-only, huge, corrupt).
async function lucky(attempts = 3): Promise<void> {
  setStatus("rolling the dice…", "info");
  for (let i = 0; i < attempts; i++) {
    try {
      const page = 1 + Math.floor(Math.random() * 40);
      const hits = await searchThemes("", { pageSize: 20, pageNumber: page, sortBy: SORT.installs! });
      const ext = hits[Math.floor(Math.random() * hits.length)];
      if (!ext) continue;
      const x = await loadExtension(ext);
      const theme = x.themes[Math.floor(Math.random() * x.themes.length)]!;
      await selectMarket(ext, x, slugify(theme.name));
      setStatus("");
      return;
    } catch { /* roll again */ }
  }
  setStatus("the dice failed three times — try again", "error");
}

// ── boot ───────────────────────────────────────────────────────────────────
async function fromHash(): Promise<boolean> {
  let h = decodeURIComponent(location.hash.slice(1));
  const tw = /~([A-Za-z0-9_-]+)$/.exec(h);
  if (tw) { try { pendingOverrides = b64d(tw[1]!); } catch { pendingOverrides = null; } h = h.slice(0, tw.index); }
  const t = /^t\/([a-z0-9-]+)$/.exec(h);
  if (t) { const e = CATALOG.find((x) => x.slug === t[1]); if (e) { await pickBuiltin(e); return true; } }
  const m = /^m\/([^/]+)(?:\/([a-z0-9-]+))?$/.exec(h);
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
  document.querySelectorAll<HTMLButtonElement>("[data-explore]").forEach((b) => b.onclick = () => {
    const [kind, val] = b.dataset.explore!.split(/:(.*)/s) as [string, string];
    if (kind === "sort") { $<HTMLSelectElement>("#sort").value = val; q.value = ""; }
    else { q.value = val; }
    search(q.value);
  });
  $("#lucky").onclick = () => lucky();
  $("#more").onclick = () => { page++; search(lastQuery, true); };
  for (const w of ["editor", "herdr"] as const) $(`#win-${w}`).onmousedown = () => { focused = w; document.querySelectorAll(".win").forEach((x) => x.classList.toggle("focused", x.id === `win-${w}`)); };
  $("#copy").onclick = async () => {
    try { await navigator.clipboard.writeText($("#cmd").textContent ?? ""); $("#copy").textContent = "copied"; setTimeout(() => ($("#copy").textContent = "copy"), 1200); }
    catch { setStatus("clipboard blocked — select the command and copy it", "error"); }
  };
  $("#insp-reset").onclick = () => { overrides = {}; paint(); };
  $("#insp-share").onclick = async () => {
    try { await navigator.clipboard.writeText(location.href); $("#insp-share").textContent = "copied"; setTimeout(() => ($("#insp-share").textContent = "copy share link"), 1200); }
    catch { setStatus("clipboard blocked — copy the address bar URL", "error"); }
  };
  $("#insp-dl").onclick = () => {
    const slug = selected!.source.slug;
    const t = effectiveTheme();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([canonicalTheme({ ...t, name: `${t.name} (tweaked)` })], { type: "application/json" }));
    a.download = `${slug}-tweaked.json`;
    a.click(); URL.revokeObjectURL(a.href);
  };
  window.addEventListener("hashchange", () => { fromHash(); });
  // first paint: the URL's theme, else the shipped default (embedded — no network)
  if (!(await fromHash())) await pickBuiltin(CATALOG.find((e) => e.slug === DEFAULT_THEME.slug)!);
  search("");
}

main().catch((e) => setStatus(`failed to start: ${(e as Error).message}`, "error"));

// exposed for the screenshot harness (tools/site/verify) — not a public API
(window as any).__mt = { tweak, overrides: () => ({ ...overrides }), lucky, pickBuiltin: (slug: string) => pickBuiltin(CATALOG.find((e) => e.slug === slug)!), pickMarketId: async (id: string) => { const [pub, name] = id.split("."); const hits = await searchThemes(`${pub} ${name}`, { pageSize: 25 }); const ext = hits.find((x) => x.id.toLowerCase() === id.toLowerCase()); if (!ext) throw new Error("not found"); await pickMarket(ext); }, search, state: () => ({ selected: selected && { name: selected.theme.name, type: selected.theme.type, source: selected.source.kind }, results: lastResults.length }) };
