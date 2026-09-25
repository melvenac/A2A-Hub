// Run the one row each client mutant must fail, against the mutant hub (:4640, UI_DIR -> mut/<id>).
// A mutant is "caught" when that row's check FAILS on it. Usage: QA_TMP=... node mut-check.mjs <id>
import { createRequire } from "node:module";
import { H, hub, keyFile, heartbeat } from "./l4.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE ?? "C:/Users/melve/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core");
const id = process.argv[2];
const base = H.mut;
const K = { aaron: keyFile(H.newW, "aaron"), a: keyFile(H.newW, "qa-l4a") };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ headless: true, executablePath: process.env.PW_EXE ?? "C:/Users/melve/AppData/Local/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-win64/chrome-headless-shell.exe" });
const ctx = await browser.newContext(); const page = await ctx.newPage();
const reqs = []; page.on("request", (r) => reqs.push({ method: r.method(), url: r.url() }));
await page.goto(`${base}/ui/`, { waitUntil: "networkidle" }).catch(() => {});
async function setKey(k) { const b = page.locator('input[type="password"]'); await b.fill(k); await b.press("Tab"); await sleep(1500); }
let rowPass, obs;
if (id === "M1" || id === "M1b") {
  await heartbeat(H.newW, "qa-l4a", K.a);
  await setKey(K.aaron);
  await page.locator("details.new-chat > summary").click(); await sleep(1200);
  await page.locator("label.peer", { hasText: "qa-l4a" }).locator("input").check();
  const first = `M1 seed ${Date.now()}`;
  await page.locator("form.start input").first().fill(first);
  await page.locator("form.start button[type=submit]").click(); await sleep(2500);
  const s = ((await hub(H.newW, "GET", "/a2a/sessions", { key: K.aaron })).json?.sessions ?? []).find((x) => x.title === first);
  const m = s ? (await hub(H.newW, "GET", `/a2a/session/${s._id}/messages`, { key: K.aaron })).json?.messages ?? [] : [];
  obs = { session: !!s, messages: m.length, firstFrom: m[0]?.from }; rowPass = m[0]?.from === "aaron";
} else if (id === "M2") {
  const v = await page.locator("details.config label", { hasText: "Hub" }).locator("input").inputValue();
  obs = { hubVal: v }; rowPass = v === base;
} else if (id === "M3") {
  await sleep(4000);
  const a = reqs.filter((r) => new URL(r.url).pathname.startsWith("/a2a"));
  obs = { a2a: a.map((r) => `${r.method} ${new URL(r.url).pathname}`) }; rowPass = a.length === 0;
} else if (id === "M4") {
  await heartbeat(H.newW, "qa-l4a", K.a);
  await setKey(K.aaron);
  await page.locator("details.new-chat > summary").click(); await sleep(1200);
  const panel = (await page.locator("label.peer input[type=checkbox]").evaluateAll((els) => els.map((e) => e.value))).sort();
  const live = ((await hub(H.newW, "GET", "/a2a/agents/live", { key: K.aaron })).json?.agents ?? []).map((a) => a.name).filter((n) => n !== "aaron" && n !== "hub").sort();
  obs = { panel, live }; rowPass = JSON.stringify(panel) === JSON.stringify(live);
} else if (id === "M5") {
  const ui = await hub(base, "GET", "/ui/");
  const refs = [...ui.text.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((m) => m[1]);
  const st = []; for (const r of refs) st.push((await hub(base, "GET", r)).status);
  const mounted = await page.locator("main").count();
  obs = { refs, statuses: st, mounted }; rowPass = refs.every((r) => r.startsWith("/ui/assets/")) && st.every((s) => s === 200) && mounted > 0;
} else throw new Error(`unknown mutant ${id}`);
await browser.close();
console.log(`${rowPass ? "SURVIVED" : "CAUGHT"} ${id}: row ${rowPass ? "passes (mutant not detected)" : "fails as required"} :: ${JSON.stringify(obs)}`);
process.exitCode = rowPass ? 1 : 0;
