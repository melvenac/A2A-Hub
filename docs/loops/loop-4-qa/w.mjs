// Instrument W (Loop 4), substituted: Playwright headless Chromium (a throwaway context per flow)
// instead of Claude-in-Chrome, whose extension was not connected. Records, per request: method,
// URL, and WHETHER an X-Agent-Key header was sent (never its value). Keys are read from the
// QA key files and filled into the page here; they never reach stdout.
// Rows: W.pos, A2, A3, B1-B7 (B8/B9 are static). Run: QA_TMP=... node w.mjs
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { H, TMP, hub, keyFile, heartbeat, check, summary, SECRETS, sha } from "./l4.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_CORE ?? "C:/Users/melve/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core");

const LOG = join(TMP, "w-requests.jsonl"), CONSOLE = join(TMP, "w-console.log");
writeFileSync(LOG, ""); writeFileSync(CONSOLE, "");
const K = Object.fromEntries(["aaron", "qa-h2", "qa-l4a", "qa-l4b", "qa-l4c"].map((n) => [n, keyFile(H.newW, n)]));
const UNKNOWN = "qa-unknown-" + "0".repeat(40); SECRETS.push(UNKNOWN);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ headless: true, executablePath: process.env.PW_EXE ?? "C:/Users/melve/AppData/Local/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-win64/chrome-headless-shell.exe" });

async function open(url, flow) {
  const ctx = await browser.newContext(); // fresh storage every flow
  const page = await ctx.newPage();
  const reqs = [];
  page.on("request", (r) => {
    const e = { flow, method: r.method(), url: r.url(), hasKey: "x-agent-key" in r.headers() };
    reqs.push(e); appendFileSync(LOG, JSON.stringify(e) + "\n");
  });
  page.on("console", (m) => appendFileSync(CONSOLE, `[${flow}] ${m.type()}: ${m.text()}\n`));
  await page.goto(url, { waitUntil: "networkidle" });
  return { ctx, page, reqs };
}
const a2a = (reqs) => reqs.filter((r) => new URL(r.url).pathname.startsWith("/a2a"));
const origins = (reqs) => [...new Set(reqs.map((r) => new URL(r.url).origin))];
async function setKey(page, key) {
  const box = page.locator('input[type="password"]');
  await box.fill(key); await box.press("Tab"); await sleep(1500);
}
const text = (page) => page.locator("body").innerText();
async function panelPeers(page) {
  const d = page.locator("details.new-chat");
  if (!(await d.evaluate((e) => e.open))) { await page.locator("details.new-chat > summary").click(); }
  await sleep(1200);
  return (await page.locator("label.peer input[type=checkbox]").evaluateAll((els) => els.map((e) => e.value))).sort();
}
async function refreshPeers(page) { await page.locator("details.new-chat .panel-head button").click(); await sleep(1200); }
const liveMinus = async (me) => ((await hub(H.newW, "GET", "/a2a/agents/live", { key: K.aaron })).json?.agents ?? [])
  .map((a) => a.name).filter((n) => n !== me && n !== "hub").sort();
const messages = async (sid) => (await hub(H.newW, "GET", `/a2a/session/${sid}/messages`, { key: K.aaron })).json?.messages ?? [];
const sessions = async (key) => (await hub(H.newW, "GET", "/a2a/sessions", { key })).json?.sessions ?? [];
function hbPids() { return Object.fromEntries(readFileSync(join(TMP, "hb-pids.txt"), "utf8").trim().split(/\r?\n/).map((l) => l.trim().split(/\s+/))); }
function stopHb(name) { try { process.kill(Number(hbPids()[name])); return true; } catch { return false; } }

// ---------------------------------------------------------------- W.pos: a cross-origin request must be seen
{
  const { ctx, page, reqs } = await open(`${H.newW}/ui/`, "W.pos");
  const hubBox = page.locator("details.config label", { hasText: "Hub" }).locator("input");
  await hubBox.fill(H.oldW); await hubBox.press("Tab"); await sleep(1500);
  const o = origins(reqs);
  check("W.pos", "W flags a request to another origin (hub box pointed at :4620)", { origins: o }, o.includes(H.oldW) && o.includes(H.newW));
  await ctx.close();
}

// ---------------------------------------------------------------- A2 / A3 / B1
for (const base of [H.newW, H.newW.replace("127.0.0.1", "localhost")]) {
  const { ctx, page, reqs } = await open(`${base}/ui/`, `A3 ${base}`);
  const hubVal = await page.locator("details.config label", { hasText: "Hub" }).locator("input").inputValue();
  check("A3", `hub box defaults to the page origin (${base})`, { hubVal }, hubVal === base);
  await sleep(4000);
  const t = await text(page);
  check("B1", `no key: zero /a2a requests after load+4s (${base})`, { requests: reqs.map((r) => `${r.method} ${new URL(r.url).pathname}`), a2a: a2a(reqs).length }, a2a(reqs).length === 0);
  check("B1", "no key: key-needed state shown and connection box open", { noKeyText: /no key/i.test(t), connOpen: await page.locator("details.config").evaluate((e) => e.open) },
    /no key/i.test(t) && (await page.locator("details.config").evaluate((e) => e.open)));
  await setKey(page, K.aaron);
  const after = a2a(reqs);
  check("B1", "both directions: after a key, whoami is the first /a2a call, exactly once", { first: after[0] && new URL(after[0].url).pathname, whoamiCount: after.filter((r) => r.url.endsWith("/a2a/whoami")).length, calls: after.map((r) => new URL(r.url).pathname) },
    after.length > 0 && after[0].url.endsWith("/a2a/whoami") && after.filter((r) => r.url.endsWith("/a2a/whoami")).length === 1);
  const o = origins(reqs);
  check("A2", `every request is same-origin (${base})`, { origins: o }, o.length === 1 && o[0] === base);
  await ctx.close();
}

// ---------------------------------------------------------------- B2 / B3 / B4 / R-L / B5
const seeded = (await sessions(K.aaron)).filter((s) => /^qa-b seeded/.test(s.title ?? ""));
{
  const { ctx, page, reqs } = await open(`${H.newW}/ui/`, "B2-B5");
  await setKey(page, K.aaron);
  const t = await text(page);
  check("B2", "whoami name shown; seeded sessions listed", { you: /you are\s+aaron/i.test(t), seeded: seeded.map((s) => s.title), listed: seeded.every((s) => t.includes(s.title)) },
    /you are\s+aaron/i.test(t) && seeded.length === 2 && seeded.every((s) => t.includes(s.title)));
  for (const s of seeded) {
    await page.locator("button.item", { hasText: s.title }).click(); await sleep(2500);
    const body = `B2 composer post ${Date.now()}`;
    await page.locator("form.composer input").fill(body); await page.locator("form.composer button[type=submit]").click(); await sleep(2000);
    const m = (await messages(s._id)).find((x) => x.content === body);
    const pt = await text(page);
    check("B2", `composer post in "${s.title}" reads back from == aaron`, { found: !!m, from: m?.from, seenOpen: pt.includes(`hello aaron from`) }, m?.from === "aaron");
  }
  // B4: panel == agents/live minus me and hub
  const p1 = await panelPeers(page), l1 = await liveMinus("aaron");
  check("B4", "panel on open == GET /a2a/agents/live minus aaron and hub", { panel: p1, live: l1 }, JSON.stringify(p1) === JSON.stringify(l1) && p1.includes("qa-l4a") && p1.includes("qa-l4b") && !p1.includes("qa-l4c"));
  const t2 = await text(page);
  check("R-L", "panel states it lists agents seen in the last 45 s", { hasText: /last 45 s/.test(t2) }, /last 45 s/.test(t2));
  // B3: new chat with qa-l4a and a first message
  await page.locator("label.peer", { hasText: "qa-l4a" }).locator("input").check();
  const first = `B3 seed ${Date.now()}`;
  await page.locator("form.start input").first().fill(first);
  const posts0 = reqs.length;
  await page.locator("form.start button[type=submit]").click(); await sleep(2500);
  const created = (await sessions(K.aaron)).find((s) => s.title === first.slice(0, 48));
  const msgs = created ? await messages(created._id) : [];
  check("B3", "new chat: participants exactly [aaron, qa-l4a]; first message from aaron", { participants: created?.participants, first: msgs[0] && { from: msgs[0].from, content: msgs[0].content === first } },
    JSON.stringify(created?.participants) === JSON.stringify(["aaron", "qa-l4a"]) && msgs[0]?.from === "aaron" && msgs[0]?.content === first);
  const bodiesFrom = reqs.slice(posts0).filter((r) => r.method === "POST").map((r) => new URL(r.url).pathname);
  check("B3", "(info) POSTs made by Start", { posts: bodiesFrom }, true);
  // B4 part 2: qa-l4b stops; after >45 s, refresh shows only what the route returns
  check("B4", "stop qa-l4b heartbeat", { killed: stopHb("qa-l4b") }, true);
  await sleep(50_000);
  await refreshPeers(page);
  const p2 = (await page.locator("label.peer input[type=checkbox]").evaluateAll((els) => els.map((e) => e.value))).sort(), l2 = await liveMinus("aaron");
  check("B4", "after qa-l4b stale: panel == agents/live minus me, hub", { panel: p2, live: l2 }, JSON.stringify(p2) === JSON.stringify(l2) && !p2.includes("qa-l4b") && p2.includes("qa-l4a"));
  await heartbeat(H.newW, "qa-l4c", K["qa-l4c"]);
  await refreshPeers(page);
  const p3 = (await page.locator("label.peer input[type=checkbox]").evaluateAll((els) => els.map((e) => e.value))).sort(), l3 = await liveMinus("aaron");
  check("B4", "qa-l4c heartbeats: refresh adds it; panel == route", { panel: p3, live: l3 }, JSON.stringify(p3) === JSON.stringify(l3) && p3.includes("qa-l4c"));
  // B5: everyone stale
  check("B5", "stop qa-l4a heartbeat", { killed: stopHb("qa-l4a") }, true);
  await sleep(50_000);
  await refreshPeers(page);
  const p4 = await page.locator("label.peer input[type=checkbox]").count(), l4 = await liveMinus("aaron");
  const t4 = await text(page);
  check("B5", "no live agents: panel says so; route agrees", { checkboxes: p4, live: l4, says: /no agents are live/.test(t4) }, p4 === 0 && l4.length === 0 && /no agents are live/.test(t4));
  await page.locator("div.history button.ghost").first().click(); await sleep(1500); // history refresh
  const t5 = await text(page);
  check("B5", "session list still loads with no live agents", { seededListed: seeded.every((s) => t5.includes(s.title)) }, seeded.every((s) => t5.includes(s.title)));
  await page.locator("button.item", { hasText: seeded[0].title }).click(); await sleep(2500);
  const body5 = `B5 post with nobody live ${Date.now()}`;
  await page.locator("form.composer input").fill(body5); await page.locator("form.composer button[type=submit]").click(); await sleep(2000);
  const m5 = (await messages(seeded[0]._id)).find((x) => x.content === body5);
  check("B5", "existing session opens and takes a post from aaron with nobody live", { from: m5?.from }, m5?.from === "aaron");
  const o = origins(reqs);
  check("A2", "B2-B5 flow: every request same-origin", { origins: o }, o.length === 1 && o[0] === H.newW);
  await ctx.close();
}

// ---------------------------------------------------------------- B6: unrecognised key, warn and strict
for (const [base, expect] of [[H.newW, /does not recognise/], [H.newS, /403/]]) {
  const { ctx, page, reqs } = await open(`${base}/ui/`, `B6 ${base}`);
  await setKey(page, UNKNOWN);
  await sleep(1500);
  const t = await text(page);
  const posts = a2a(reqs).filter((r) => r.method === "POST");
  check("B6", `unknown key on ${base.endsWith("4611") ? "strict" : "warn"}: refusal shown, no POST under /a2a, no composer or panel`,
    { shown: expect.test(t), a2a: a2a(reqs).map((r) => `${r.method} ${new URL(r.url).pathname}`), posts: posts.length, composer: await page.locator("form.composer").count(), panel: await page.locator("details.new-chat").count() },
    expect.test(t) && posts.length === 0 && (await page.locator("form.composer").count()) === 0 && (await page.locator("details.new-chat").count()) === 0);
  await ctx.close();
}

// ---------------------------------------------------------------- B7: key change aaron -> qa-h2
{
  const s = await hub(H.newW, "POST", "/a2a/session", { key: K["qa-h2"], body: { title: "qa-b7 h2 room", participants: ["qa-h2", "qa-l4a"], maxTurns: 12 } });
  const sid = s.json?.sessionId;
  const { ctx, page, reqs } = await open(`${H.newW}/ui/`, "B7");
  await setKey(page, K.aaron);
  await page.locator("button.item", { hasText: seeded[0].title }).click(); await sleep(2000);
  const mark = reqs.length;
  await setKey(page, K["qa-h2"]); await sleep(1500);
  const t = await text(page);
  const after = a2a(reqs.slice(mark));
  check("B7", "key change: whoami runs again first, name becomes qa-h2, open room reset", { first: after[0] && new URL(after[0].url).pathname, you: /you are\s+qa-h2/.test(t), roomOpen: await page.locator("form.composer").count() },
    after[0]?.url.endsWith("/a2a/whoami") && /you are\s+qa-h2/.test(t) && (await page.locator("form.composer").count()) === 0);
  await page.locator("div.history button.ghost").first().click(); await sleep(1500);
  await page.locator("button.item", { hasText: "qa-b7 h2 room" }).click(); await sleep(2000);
  const body = `B7 post as h2 ${Date.now()}`;
  await page.locator("form.composer input").fill(body); await page.locator("form.composer button[type=submit]").click(); await sleep(2000);
  const m = (await messages(sid)).find((x) => x.content === body);
  check("B7", "post after key change reads back from == qa-h2", { from: m?.from }, m?.from === "qa-h2");
  // No post after the switch carried aaron: every message created after `mark` across aaron-visible sessions
  const all = [];
  for (const x of await sessions(K.aaron)) all.push(...(await messages(x._id)));
  const late = all.filter((x) => /^B7 /.test(x.content ?? ""));
  check("B7", "no B7 post carries aaron", { late: late.map((x) => x.from) }, late.every((x) => x.from !== "aaron"));
  await ctx.close();
}

await browser.close();
// The console dump and request log are K's D2 inputs; confirm here they carry no key or hash.
for (const f of [LOG, CONSOLE]) {
  const c = readFileSync(f, "utf8");
  const hits = SECRETS.filter((s) => c.includes(s) || c.includes(sha(s))).length;
  check("D2.w", `${f.split(/[\\/]/).pop()} carries no key or hash`, { bytes: c.length, hits }, hits === 0);
}
process.exitCode = summary() ? 1 : 0;
