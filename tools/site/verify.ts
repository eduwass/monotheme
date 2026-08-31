#!/usr/bin/env bun
// End-to-end check of the theme browser in a real (headless) Chromium over CDP:
// boot, built-in + Marketplace themes, variants, both editor flavors, search,
// deep links, graceful failure — collecting console errors / exceptions / failed
// requests, and screenshotting each state so a human can eyeball the result.
//
//   bun run site:build
//   bun -e 'Bun.serve({port:4374,fetch(r){const p=new URL(r.url).pathname;return new Response(Bun.file("docs"+(p==="/"?"/index.html":p)))}})' &
//   chrome --headless=new --remote-debugging-port=9333 about:blank &
//   bun tools/site/verify.ts [http://localhost:4374/browse.html] [out-dir]
//
// Exits non-zero if any step times out or the page logged a problem.
const S = process.argv[3] ?? "/tmp";
const URL_ = process.argv[2] ?? "http://localhost:4374/browse.html";

let tab = await (await fetch("http://localhost:9333/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map<number, (v: any) => void>();
const problems: string[] = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(String(ev.data));
  if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); return; }
  if (m.method === "Runtime.consoleAPICalled" && (m.params.type === "error" || m.params.type === "warning")) problems.push(`console.${m.params.type}: ${m.params.args.map((a: any) => a.value ?? a.description).join(" ")}`);
  if (m.method === "Runtime.exceptionThrown") problems.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
  if (m.method === "Network.loadingFailed") problems.push(`request failed: ${m.params.errorText} ${m.params.requestId}`);
  if (m.method === "Network.responseReceived" && m.params.response.status >= 400) problems.push(`HTTP ${m.params.response.status} ${m.params.response.url}`);
};
const send = (method: string, params: any = {}) => new Promise<any>((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr: string) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? "eval failed"); return r.result?.result?.value; };
const shot = async (name: string) => { const r = await send("Page.captureScreenshot", { format: "png" }); await Bun.write(`${S}/shot-${name}.png`, Buffer.from(r.result.data, "base64")); console.log(`  📸 ${name}`); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (expr: string, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await evalJs(expr)) return true; await sleep(150); } throw new Error(`timeout waiting for: ${expr}`); };

await send("Runtime.enable"); await send("Network.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: URL_ });
await waitFor(`window.__mt && __mt.state().selected !== null`);
await waitFor(`document.querySelectorAll('#code .line').length > 5`);
console.log("state after boot:", JSON.stringify(await evalJs("__mt.state()")));
await waitFor(`__mt.state().results > 0`, 25000);
console.log("marketplace results:", await evalJs("__mt.state().results"), "· first:", await evalJs("document.querySelector('#results .name')?.textContent"));
await sleep(600); await shot("1-default");

// light built-in theme
await evalJs(`__mt.pickBuiltin('tokyo-night-light')`);
await waitFor(`__mt.state().selected?.name === 'Tokyo Night Light'`);
await sleep(300); await shot("2-light-builtin");
console.log("hash:", await evalJs("location.hash"));

// zed flavor
await evalJs(`document.querySelector('input[name=flavor][value=zed]').click()`); await sleep(400); await shot("3-zed");
await evalJs(`document.querySelector('input[name=flavor][value=vscode]').click()`);

// focus the herdr window (accent border moves)
await evalJs(`document.querySelector('#win-herdr').dispatchEvent(new MouseEvent('mousedown', {bubbles:true}))`); await sleep(200);
console.log("focused window:", await evalJs("document.querySelector('.win.focused').id"));

// marketplace theme (vsix → zip → json5 → paint)
await evalJs(`__mt.pickMarketId('enkia.tokyo-night')`);
await waitFor(`__mt.state().selected?.source === 'market'`, 40000);
await waitFor(`document.querySelector('#status').hidden`);
console.log("market state:", JSON.stringify(await evalJs("__mt.state()")), "· variants:", await evalJs("document.querySelectorAll('#variants .chip').length"), "· cmd:", await evalJs("document.querySelector('#cmd').textContent"));
await sleep(300); await shot("4-marketplace");
// switch variant via chip
const chips = await evalJs("[...document.querySelectorAll('#variants .chip')].map(c=>c.textContent)");
console.log("chips:", chips);
await evalJs(`document.querySelectorAll('#variants .chip')[2]?.click()`); await sleep(500);
console.log("after chip:", JSON.stringify(await evalJs("__mt.state().selected")), "hash:", await evalJs("location.hash"));
await shot("5-variant");

// search flow through the real input
await evalJs(`const q=document.querySelector('#q'); q.value='catppuccin'; q.dispatchEvent(new Event('input'))`);
await sleep(400); await waitFor(`document.querySelector('#results .name')?.textContent?.toLowerCase().includes('catppuccin')`, 25000);
console.log("search 'catppuccin' →", await evalJs("[...document.querySelectorAll('#results .name')].slice(0,3).map(e=>e.textContent)"));
await evalJs(`document.querySelector('#results button.row').click()`);
await waitFor(`__mt.state().selected?.name?.toLowerCase().includes('catppuccin')`, 40000);
await waitFor(`document.querySelector('#status').hidden`);
await sleep(300); await shot("6-search-pick");

// deep link reload
await send("Page.navigate", { url: URL_.replace(/#.*/, "") + "#m/enkia.tokyo-night/tokyo-night-storm" });
await sleep(300);
await waitFor(`window.__mt && __mt.state().selected?.name === 'Tokyo Night Storm'`, 40000);
console.log("deep link →", JSON.stringify(await evalJs("__mt.state().selected")));

// a (deliberately) huge/odd extension should fail gracefully, not blank the page
await evalJs(`__mt.pickMarketId('ms-vscode.cpptools').catch(e=>console.log('expected:', e.message))`);
await sleep(4000);
console.log("status text:", await evalJs("document.querySelector('#status').textContent"));
await shot("7-error-state");

// narrow viewport
await send("Emulation.setDeviceMetricsOverride", { width: 800, height: 1100, deviceScaleFactor: 1, mobile: false }); await sleep(400); await shot("8-narrow");

console.log("\nproblems:", problems.length ? "\n  " + problems.join("\n  ") : "none");
ws.close(); process.exit(problems.length ? 1 : 0);
