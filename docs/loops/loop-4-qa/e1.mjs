// E1: the dev server (vite, :5610, candidate client from the replay's scratch copy) loads at /,
// its hub box defaults to http://127.0.0.1:4000 (read, not used: E0 showed 4000 free), is pointed
// at the QA hub, and with a scratch aaron key lists sessions and posts from == aaron, cross-origin.
import { createRequire } from "node:module";
import { H, hub, keyFile, check, summary } from "./l4.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE ?? "C:/Users/melve/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core");
const DEV = "http://127.0.0.1:5610";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const aaron = keyFile(H.newW, "aaron");
const browser = await chromium.launch({ headless: true, executablePath: process.env.PW_EXE ?? "C:/Users/melve/AppData/Local/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-win64/chrome-headless-shell.exe" });
const ctx = await browser.newContext(); const page = await ctx.newPage();
const reqs = []; page.on("request", (r) => reqs.push({ method: r.method(), url: r.url() }));
const fails = []; page.on("requestfailed", (r) => fails.push(`${r.method()} ${r.url()} ${r.failure()?.errorText}`));
const res = await page.goto(`${DEV}/`, { waitUntil: "load" }); await sleep(2500);
const hubBox = page.locator("details.config label", { hasText: "Hub" }).locator("input");
const def = await hubBox.inputValue();
check("E1", "dev page loads at / (200) and its hub box defaults to http://127.0.0.1:4000", { status: res?.status(), def }, res?.status() === 200 && def === "http://127.0.0.1:4000");
const to4000 = reqs.filter((r) => r.url.startsWith("http://127.0.0.1:4000"));
check("E1", "(info) requests the default made to :4000 (nothing listens; E0)", { to4000: to4000.map((r) => `${r.method} ${new URL(r.url).pathname}`), failed: fails.filter((f) => f.includes(":4000")).length }, true);
await hubBox.fill(H.newW); await hubBox.press("Tab"); await sleep(1500);
const key = page.locator('input[type="password"]'); await key.fill(aaron); await key.press("Tab"); await sleep(2500);
const t = await page.locator("body").innerText();
check("E1", "with the QA hub and aaron's key: you are aaron, sessions listed", { you: /you are\s+aaron/.test(t), seeded: t.includes("qa-b seeded 1") }, /you are\s+aaron/.test(t) && t.includes("qa-b seeded 1"));
await page.locator("button.item", { hasText: "qa-b seeded 1" }).click(); await sleep(2500);
const body = `E1 dev post ${Date.now()}`;
await page.locator("form.composer input").fill(body); await page.locator("form.composer button[type=submit]").click(); await sleep(2000);
const sid = ((await hub(H.newW, "GET", "/a2a/sessions", { key: aaron })).json?.sessions ?? []).find((s) => s.title === "qa-b seeded 1")?._id;
const m = ((await hub(H.newW, "GET", `/a2a/session/${sid}/messages`, { key: aaron })).json?.messages ?? []).find((x) => x.content === body);
check("E1", "post from the dev page reads back from == aaron", { from: m?.from }, m?.from === "aaron");
const cross = reqs.filter((r) => r.url.startsWith(H.newW) && new URL(r.url).pathname.startsWith("/a2a"));
check("E1", "cross-origin /a2a calls from :5610 to :4610 succeed (CORS intact)", { calls: cross.length, failed: fails.filter((f) => f.includes(":4610")) }, cross.length > 0 && fails.filter((f) => f.includes(":4610")).length === 0);
await browser.close();
process.exitCode = summary() ? 1 : 0;
