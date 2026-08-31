// Homepage strip: top theme extensions from the VS Code Marketplace, with their
// icons — each card links into the theme browser, where the theme is previewed
// across a whole mock desktop. Built by tools/site/build.ts → docs/home.js.
import { searchThemes, SORT, type MarketTheme } from "../../src/market-search.ts";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmt = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "k" : String(n));
const strip = document.getElementById("mkt-strip")!;
const note = document.getElementById("mkt-note")!;

function card(e: MarketTheme): string {
  const ico = e.icon ? `<img src="${esc(e.icon)}" alt="" loading="lazy" onerror="this.hidden=true">` : `<b>${esc(e.displayName[0] ?? "?")}</b>`;
  return `<a class="mkt-card" href="./browse.html#m/${esc(e.id)}" title="${esc(e.description)}"><i>${ico}</i><span>${esc(e.displayName)}</span><small>${fmt(e.installs)} installs</small></a>`;
}

async function load() {
  try {
    const hits = (await searchThemes("", { pageSize: 20, sortBy: SORT.installs! })).slice(0, 10);
    strip.innerHTML = hits.map(card).join("");
    note.textContent = "";
  } catch { note.textContent = "Marketplace unreachable right now — the strip will be back."; }
}
load();
// the dice sits under the strip; it resolves a random Marketplace theme on
// click, then follows the same browse deep link the cards use
document.getElementById("mkt-dice")!.addEventListener("click", async (ev) => {
  ev.preventDefault();
  note.textContent = "rolling…";
  try {
    const page = 1 + Math.floor(Math.random() * 40);
    const rand = await searchThemes("", { pageSize: 20, pageNumber: page, sortBy: SORT.installs! });
    const pick = rand[Math.floor(Math.random() * rand.length)];
    if (pick) location.href = `./browse.html#m/${pick.id}`;
  } catch { note.textContent = "the dice failed — try again"; }
});
// exposed for the screenshot harness — not a public API
(window as any).__home = { count: () => strip.querySelectorAll("a[href*='#m/']").length };
