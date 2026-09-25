// W (Playwright headless Chromium, a fresh context per flow): E4, E5 (owner view in the page), RG2
// (Loop 4 page B1-B3), F1's page flow (the c4d2d1c page on the candidate functions), and B3 (no
// [authz] line from as-self page use). Keys are filled from the QA key files; never printed.
import { createRequire } from "node:module";
import { readFileSync, appendFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { H, TMP, key, hub, check, summary, sleep, parseAuthz } from "./l5.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/melve/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core");
const browser = await chromium.launch({ headless: true, executablePath: "C:/Users/melve/AppData/Local/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-win64/chrome-headless-shell.exe" });
const { S } = JSON.parse(readFileSync(join(TMP, "l5-ids.json"), "utf8"));
const LOGW = join(TMP, "w5-requests.jsonl"); writeFileSync(LOGW, "");

async function open(base, flow) {
  const ctx = await browser.newContext(); const page = await ctx.newPage(); const reqs = [];
  page.on("request", (r) => { const e = { flow, method: r.method(), url: r.url(), hasKey: "x-agent-key" in r.headers() }; reqs.push(e); appendFileSync(LOGW, JSON.stringify(e) + "\n"); });
  await page.goto(`${base}/ui/`, { waitUntil: "networkidle" });
  return { ctx, page, reqs };
}
async function setKey(page, name) { const b = page.locator('input[type="password"]'); await b.fill(key(name)); await b.press("Tab"); await sleep(2000); }
const titles = async (page) => (await page.locator("button.item .item-title").allInnerTexts()).map((t) => t.trim());
const posts = (reqs, from) => reqs.slice(from).filter((r) => r.method === "POST" && new URL(r.url).pathname.startsWith("/a2a"));
const logLen = (n) => statSync(join(TMP, "logs", `${n}.err.log`)).size;
const linesSince = (n, off) => parseAuthz(readFileSync(join(TMP, "logs", `${n}.err.log`)).subarray(off).toString("utf8"));
// Titles may have been renamed by warn-mode rows (allowed in warn); map ids to current titles.
const titleOf = async (id, as) => ((await hub(H.nS, "GET", "/a2a/sessions", { as })).json?.sessions ?? []).find((s) => s._id === id)?.title;

// ---------------------------------------------------------------- E4 (aaron) and E5 (qa-owner2), strict hub
for (const [who, own, mine, other] of [["aaron", S.Ain, S.Aag, S.B], ["qa-owner2", null, S.B, S.Ain]]) {
  const off = logLen("nS");
  const { ctx, page, reqs } = await open(H.nS, `E ${who}`);
  await setKey(page, who);
  const t = await titles(page);
  const tMine = await titleOf(mine, who), tOther = await titleOf(other, "aaron") ?? await titleOf(other, "qa-owner2"), tOwn = own ? await titleOf(own, who) : null;
  const expectList = who === "aaron" ? [tOwn, tMine] : [tMine];
  check(`E${who === "aaron" ? 4 : 5} list`, `${who}'s history lists his rooms and his agents' rooms, not the other owner's`, { listed: t.filter((x) => [tOwn, tMine, tOther].includes(x)), other: tOther },
    expectList.every((x) => t.includes(x)) && !t.includes(tOther));
  if (who === "aaron") {
    // A-agents: owner view, read-only
    const before = reqs.length;
    await page.locator("button.item", { hasText: tMine }).first().click(); await sleep(2500);
    const txt = await page.locator("section.pane").innerText();
    const ui = { notInRoom: /not in this room/i.test(txt), composer: await page.locator("form.composer").count(), extend: await page.locator("button", { hasText: "+ extend" }).count(), rename: await page.locator("button.pencil").count(), transcript: /A-agents seed|seed/.test(txt) };
    check("E4 read-only", "A-agents opens read-only: 'not in this room', no composer, no extend, no POST", { ...ui, posts: posts(reqs, before).length },
      ui.notInRoom && ui.composer === 0 && ui.extend === 0 && ui.transcript && posts(reqs, before).length === 0);
    check("E4 read-only (rename)", "(info) rename pencils shown in the history list", { pencils: ui.rename }, true);
    // A-in: participant, composer works
    await page.locator("button.item", { hasText: tOwn }).first().click(); await sleep(2000);
    const body = `E4 post ${Date.now()}`;
    await page.locator("form.composer input").fill(body); await page.locator("form.composer button[type=submit]").click(); await sleep(2000);
    const m = ((await hub(H.nS, "GET", `/a2a/session/${own}/messages`, { as: "aaron" })).json?.messages ?? []).find((x) => x.content === body);
    check("E4 post", "in A-in (a participant) the composer posts, from == aaron", { from: m?.from }, m?.from === "aaron");
  } else {
    await page.locator("button.item", { hasText: tMine }).first().click(); await sleep(2500);
    const txt = await page.locator("section.pane").innerText();
    check("E5 read-only", "B-room opens read-only for qa-owner2 (not a participant): no composer", { notInRoom: /not in this room/i.test(txt), composer: await page.locator("form.composer").count() },
      /not in this room/i.test(txt) && (await page.locator("form.composer").count()) === 0);
  }
  const lines = linesSince("nS", off);
  check(`B3 page ${who}`, "as-self page use (list, open own/owner-view room, post in own room, panel) writes no [authz] line", { lines: lines.length }, lines.length === 0);
  await ctx.close();
}

// ---------------------------------------------------------------- RG2: Loop 4 page B1-B3 on the candidate (warn hub)
{
  const { ctx, page, reqs } = await open(H.nW, "RG2");
  await sleep(3000);
  const a2a = reqs.filter((r) => new URL(r.url).pathname.startsWith("/a2a"));
  check("RG2 B1", "no key: zero /a2a requests", { a2a: a2a.length }, a2a.length === 0);
  await setKey(page, "qa-a1");
  const first = reqs.filter((r) => new URL(r.url).pathname.startsWith("/a2a"))[0];
  check("RG2 B1b", "after a key, whoami is the first /a2a call", { first: first && new URL(first.url).pathname }, first?.url.endsWith("/a2a/whoami"));
  for (const n of ["qa-a2", "qa-a3", "qa-b1", "qa-b2"]) await hub(H.nW, "POST", `/a2a/heartbeat/${n}`, { as: n, body: {} }); // live within 45 s
  await page.locator("details.new-chat > summary").click(); await sleep(1500);
  await page.locator("label.peer", { hasText: "qa-a3" }).locator("input").check(); // qa-a2 carries C's restrictive askPolicy
  const text = `RG2 seed ${Date.now()}`;
  await page.locator("form.start input").first().fill(text); await page.locator("form.start button[type=submit]").click(); await sleep(2500);
  const s = ((await hub(H.nW, "GET", "/a2a/sessions", { as: "qa-a1" })).json?.sessions ?? []).find((x) => x.title === text.slice(0, 48));
  const msgs = s ? (await hub(H.nW, "GET", `/a2a/session/${s._id}/messages`, { as: "qa-a1" })).json?.messages ?? [] : [];
  check("RG2 B3", "new chat from the page: participants [qa-a1, qa-a3]; seed from qa-a1", { participants: s?.participants, from: msgs[0]?.from }, JSON.stringify(s?.participants) === '["qa-a1","qa-a3"]' && msgs[0]?.from === "qa-a1");
  const peers = (await page.locator("label.peer input[type=checkbox]").evaluateAll((els) => els.map((e) => e.value))).filter((n) => /^qa-/.test(n)).sort();
  check("RG2 panel (Q4)", "the new-chat panel offers only the caller's owner's live agents (no qa-b*)", { peers }, peers.every((n) => !/^qa-b/.test(n)));
  await ctx.close();
}

// ---------------------------------------------------------------- F1 page: the c4d2d1c page + hub on the candidate functions
{
  const { ctx, page } = await open(H.onW, "F1 page");
  await setKey(page, "qa-a1");
  const tIn = await titleOf(S.Ain, "qa-a1");
  const t = await titles(page);
  check("F1 page list", "c4d2d1c page on candidate functions lists sessions (old hub: unfiltered listAll)", { n: t.length, hasAin: t.includes(tIn) }, t.includes(tIn));
  await page.locator("button.item", { hasText: tIn }).first().click(); await sleep(2000);
  const body = `F1 page post ${Date.now()}`;
  await page.locator("form.composer input").fill(body); await page.locator("form.composer button[type=submit]").click(); await sleep(2000);
  const m = ((await hub(H.nW, "GET", `/a2a/session/${S.Ain}/messages`, { as: "qa-a1" })).json?.messages ?? []).find((x) => x.content === body);
  check("F1 page post", "c4d2d1c page posts through the old hub on candidate functions (old page sends from 'aaron' via its hard-coded HUMAN? recorded)", { stored: !!m, from: m?.from }, !!m);
  await ctx.close();
}
await browser.close();
process.exitCode = summary(join(TMP, "page.results.txt")) ? 1 : 0;
