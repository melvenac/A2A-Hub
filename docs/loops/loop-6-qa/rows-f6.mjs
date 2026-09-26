// Loop 6 rows F1-F7 (loop-6-qa-criteria.md F, limits as ruled: 3150 per name / 90 global per 60 s).
// Counted at the counting proxy (proxy.mjs) in front of the hub, never from stdout. F2 drives REAL
// hub-talk processes and daemons (candidate tree). Needs the seed (seed6.mjs) and rows-a6 done (codes).
// Usage: QA_TMP=... node rows-f6.mjs <warn|strict> [--only F1,F2a,...]
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { H, TMP, TREE, key, placeKey, P8, hub, register, issue, rows, setRow, check, summary, sleep } from "./l6.mjs";
const MODE = process.argv[2]; if (!["warn", "strict"].includes(MODE)) throw new Error("usage: rows-f6.mjs <warn|strict>");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7).split(",").filter(Boolean);
const want = (r) => !ONLY.length || ONLY.includes(r);
const HUBU = MODE === "warn" ? H.nW : H.nS; const PPORT = MODE === "warn" ? 4791 : 4792; const P = `http://127.0.0.1:${PPORT}`;
const PER_KEY = 3150, GLOBAL = 90;
// Issuer for codes: qa-owner2 (human, never registered through hub-talk). F2 runs hub-talk AS aaron, and on
// c461c65 any such register strips aaron's kind human (reported defect), so aaron cannot issue after F2.
const ISSUER = "qa-owner2";
const LIVE = ["aaron", "a2a-grok", "atlas", "cursor-grok", "grok", "grok-probe", "grokbot", "melve-76", "relay"];
const QW = TMP; const PLOG = join(QW, `f6-proxy-${MODE}.jsonl`);
const proxy = spawn(process.execPath, [join(import.meta.dirname, "proxy.mjs"), String(PPORT), HUBU, PLOG], { stdio: "ignore" });
await sleep(1200);
const plog = () => readFileSync(PLOG, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const k8 = Object.fromEntries(LIVE.map((n) => [P8(key(n)), n]));
const HT = join(TREE.cand, "scripts", "hub-talk.mjs");
const env = { ...process.env, HUB_URL: P, A2A_KEY_DIR: join(TMP, "keys") }; delete env.AGENT_KEY; delete env.ANTHROPIC_API_KEY;
for (const n of LIVE) placeKey(n, P);
const burst = async (n, fn) => { const out = []; for (let i = 0; i < n; i += 50) out.push(...(await Promise.all(Array.from({ length: Math.min(50, n - i) }, (_, j) => fn(i + j))))); return out; };
/** Wait until a bucket's current window has ended: send one probe until it 429s, then wait Retry-After. */
async function freshGlobal() {
  for (let i = 0; i < GLOBAL + 5; i++) { const r = await fetch(`${HUBU}/ui/`); if (r.status === 429) { await sleep((+r.headers.get("retry-after") + 1) * 1000); return true; } }
  return false;
}

// ---------------------------------------------------------------- F1: per-key boundary
if (want("F1")) {
  setRow(`F1-${MODE}`);
  const nm = `qa-f1-${MODE}`; const { json } = await issue(HUBU, ISSUER); await register(HUBU, nm, { code: json?.code });
  const t0 = Date.now();
  const rs = await burst(PER_KEY, () => hub(HUBU, "GET", "/a2a/whoami", { as: nm }));
  const nth = await fetch(`${HUBU}/a2a/whoami`, { headers: { "X-Agent-Key": key(nm) } }); const nb = await nth.text(); const ra = nth.headers.get("retry-after");
  const left = Math.ceil((t0 + 60e3 - Date.now()) / 1000);
  const served = rs.filter((r) => r.status === 200).length, got429 = rs.filter((r) => r.status === 429).length;
  check(`F1 ${MODE}`, "one key: requests 1-3150 served, 3151 gets 429 {too many requests} with integer Retry-After in (0,60] ~ window left", { served, got429, nth: nth.status, body: nb, retryAfter: ra, windowLeftS: left, elapsedS: ((Date.now() - t0) / 1000).toFixed(1) },
    served === PER_KEY && got429 === 0 && nth.status === 429 && nb === '{"error":"too many requests"}' && /^\d+$/.test(ra ?? "") && +ra > 0 && +ra <= 60 && Math.abs(+ra - left) <= 2);
  await sleep((+ra + 1) * 1000);
  const again = await hub(HUBU, "GET", "/a2a/whoami", { as: nm });
  check(`F1b ${MODE}`, "after Retry-After the same key is served again", { status: again.status }, again.status === 200);
}

// ---------------------------------------------------------------- F2: every row's hub-talk at once
async function f2(mix, seconds) {
  // Rooms: pairs among the 9 names (aaron pairs with relay), created as self through the hub.
  const pairs = [["a2a-grok", "atlas"], ["cursor-grok", "grok"], ["grok-probe", "grokbot"], ["melve-76", "relay"], ["aaron", "relay"]];
  const peerOf = {}; for (const [a, b] of pairs) { peerOf[a] ??= b; peerOf[b] ??= a; }
  for (const [a, b] of pairs) await hub(HUBU, "POST", "/a2a/session", { as: a, body: { title: `F2 ${a}-${b}`, participants: [a, b], maxTurns: 400 } });
  writeFileSync(PLOG, ""); const t0 = Date.now(); const procs = []; const rcs = [];
  const run = (args) => new Promise((res) => { const p = spawn(process.execPath, [HT, ...args], { env, stdio: "ignore" }); procs.push(p); p.on("exit", (c) => { rcs.push({ args: args.slice(0, 3).join(" "), rc: c }); res(c); }); });
  const loops = [];
  for (const n of LIVE) {
    const peer = peerOf[n];
    if (mix === "a") {
      // a --wait returns when the peer's --say lands; a seat relaunches it, so this loop does too
      loops.push((async () => { while (Date.now() - t0 < seconds * 1000) await run(["--as", n, "--peer", peer, "--wait", "--wait-timeout", String(Math.max(1, Math.ceil(seconds - (Date.now() - t0) / 1000)))]); })());
      loops.push((async () => { while (Date.now() - t0 < seconds * 1000) { await run(["--as", n, "--peer", peer, "--say", `F2a ${n}`]); await sleep(5000); } })());
      loops.push((async () => { while (Date.now() - t0 < seconds * 1000) { await run(["--as", n, "--peer", peer, "--inbox"]); await sleep(5000); } })());
    } else for (let i = 0; i < 3; i++) loops.push(run(["--as", n, "--peer", peer, "--wait", "--wait-timeout", String(seconds)]));
    // one daemon loop per name
    const d = spawn(process.execPath, ["--import", "tsx", "src/wrapper/daemon.ts", "--name", n], { cwd: TREE.cand, env, stdio: "ignore" }); procs.push(d);
  }
  await Promise.all(loops);
  for (const p of procs) try { p.kill(); } catch {}
  await sleep(1500);
  const L = plog().filter((l) => l.t >= t0);
  const n429 = L.filter((l) => l.s === 429).length, errs = L.filter((l) => l.s === "proxy-error").length;
  const who = (l) => (l.n ?? k8[l.k] ?? l.k);
  const perName = {}; for (const l of L) { const w = Math.floor((l.t - t0) / 60e3); const k = `${who(l)}#${w}`; perName[k] = (perName[k] ?? 0) + 1; }
  const peak = Object.entries(perName).filter(([k]) => LIVE.includes(k.split("#")[0])).sort((a, b) => b[1] - a[1])[0];
  const badRc = rcs.filter((r) => ![0, 2].includes(r.rc)); // --wait timing out is rc 2 (no peer turn), which is the expected end
  return { requests: L.length, n429, proxyErrors: errs, hubTalkRuns: rcs.length, badRc: badRc.slice(0, 5), badRcCount: badRc.length, peakNameWindow: peak, seconds };
}
if (want("F2a")) { setRow(`F2a-${MODE}`); const r = await f2("a", 130); check(`F2a ${MODE}`, "9 names x (--wait + --say loop + --inbox loop) + a daemon each, >= 2 windows: 0 x 429, no hub-talk failure; peak per name per 60 s vs ~315 / 3150", r, r.n429 === 0 && r.badRcCount === 0 && r.proxyErrors === 0); }
if (want("F2b")) { setRow(`F2b-${MODE}`); const r = await f2("b", 130); check(`F2b ${MODE}`, "9 names x 3 concurrent --wait + a daemon each, >= 2 windows: 0 x 429; peak per name per 60 s vs ~315 / 3150", r, r.n429 === 0 && r.badRcCount === 0 && r.proxyErrors === 0); }

// ---------------------------------------------------------------- F3b: global boundary; F3: existing names never in the global bucket
if (want("F3")) {
  setRow(`F3-${MODE}`);
  const fresh = await freshGlobal();
  const rs = await burst(GLOBAL, () => fetch(`${HUBU}/ui/`).then((r) => r.status));
  const n91 = await fetch(`${HUBU}/ui/`); const ra = n91.headers.get("retry-after");
  check(`F3b ${MODE}`, "fresh global window: requests 1-90 (/ui/) served, the 91st gets 429 with Retry-After", { fresh, served: rs.filter((s) => s === 200).length, got429: rs.filter((s) => s === 429).length, n91: n91.status, retryAfter: ra },
    fresh && rs.every((s) => s === 200) && n91.status === 429 && /^\d+$/.test(ra ?? ""));
  // global is saturated now: a new-name register and an --invite are refused (the accepted limit, recorded)
  const { json } = await issue(HUBU, ISSUER);
  const nn = await register(HUBU, `qa-f3-new-${MODE}`, { code: json?.code });
  const miss = await fetch(`${HUBU}/a2a/whoami`);
  // existing names' own traffic in the same window
  const ex = await burst(60, (i) => register(HUBU, LIVE[i % LIVE.length]));
  const exw = await burst(60, (i) => hub(HUBU, "GET", "/a2a/whoami", { as: LIVE[i % LIVE.length] }));
  check(`F3 ${MODE}`, "with the global bucket saturated: existing names' registers (own key) and requests get 0 x 429; a new-name register and a missing-key request DO get 429 (detector positive; accepted limit)",
    { existingRegister429: ex.filter((r) => r.status === 429).length, existingReq429: exw.filter((r) => r.status === 429).length, newName: nn.status, missingKey: miss.status },
    ex.every((r) => r.status === 200) && exw.every((r) => r.status === 200) && nn.status === 429 && miss.status === 429);
}

// ---------------------------------------------------------------- F4: an existing name's register is in its own bucket
if (want("F4")) {
  setRow(`F4-${MODE}`);
  const X = `qa-f4x-${MODE}`, Y = `qa-f4y-${MODE}`;
  for (const n of [X, Y]) { const { json } = await issue(HUBU, ISSUER); await register(HUBU, n, { code: json?.code }); }
  const fresh = await freshGlobal();
  const regs = await burst(50, () => register(HUBU, X));
  const g = await burst(GLOBAL, () => fetch(`${HUBU}/ui/`).then((r) => r.status));
  check(`F4a ${MODE}`, "50 same-registers by X, then 90 global requests in the same fresh global window: all served (X's registers were not counted in the global bucket)",
    { fresh, xRegs: regs.filter((r) => r.status === 200).length, global200: g.filter((s) => s === 200).length }, fresh && regs.every((r) => r.status === 200) && g.every((s) => s === 200));
  await burst(PER_KEY - 50, () => hub(HUBU, "GET", "/a2a/whoami", { as: X }));
  const xr = await register(HUBU, X), yr = await register(HUBU, Y);
  check(`F4b ${MODE}`, "X's bucket exhausted: X's own register gets 429, Y's register is served", { x: xr.status, y: yr.status }, xr.status === 429 && yr.status === 200);
}

// ---------------------------------------------------------------- F6: unknown keys use the global bucket
if (want("F6")) {
  setRow(`F6-${MODE}`);
  const fresh = await freshGlobal();
  const U = "qa6-unknown-" + "1".repeat(40);
  const us = await burst(GLOBAL, () => fetch(`${HUBU}/a2a/whoami`, { headers: { "X-Agent-Key": U } }).then((r) => r.status));
  const u91 = await fetch(`${HUBU}/a2a/whoami`, { headers: { "X-Agent-Key": U } });
  const { json } = await issue(HUBU, ISSUER); const nn = await register(HUBU, `qa-f6-new-${MODE}`, { code: json?.code });
  const exw = await burst(40, (i) => hub(HUBU, "GET", "/a2a/whoami", { as: LIVE[i % LIVE.length] }));
  const expect1 = MODE === "warn" ? 200 : 403;
  check(`F6 ${MODE}`, `unknown key: 90 answered (${expect1}) then the 91st 429; a new-name register in that window 429 (one shared bucket); existing names 0 x 429`,
    { fresh, answered: us.filter((s) => s === expect1).length, other: [...new Set(us)], u91: u91.status, newName: nn.status, existing429: exw.filter((r) => r.status === 429).length },
    fresh && us.every((s) => s === expect1) && u91.status === 429 && nn.status === 429 && exw.every((r) => r.status === 200));
}

// ---------------------------------------------------------------- F7: bucket names do not collide
if (want("F7")) {
  setRow(`F7-${MODE}`);
  const out = {};
  for (const nm of ["global", "name:x", "bucket:global", "name:global"]) {
    const { json } = await issue(HUBU, ISSUER); const r = await register(HUBU, nm, { code: json?.code });
    out[nm] = { register: r.status, body: r.json?.error };
    if (r.status !== 200) continue;
    const fresh = await freshGlobal();
    const own = await burst(200, () => hub(HUBU, "GET", "/a2a/whoami", { as: nm }));
    const ui = await fetch(`${HUBU}/ui/`); const miss = await fetch(`${HUBU}/a2a/whoami`);
    const sat = await burst(GLOBAL + 5, () => fetch(`${HUBU}/ui/`).then((x) => x.status));
    const own2 = await burst(50, () => hub(HUBU, "GET", "/a2a/whoami", { as: nm }));
    Object.assign(out[nm], { fresh, own429: own.filter((x) => x.status === 429).length, uiAfterOwn: ui.status, missingKeyAfterOwn: miss.status, globalSaturated: sat.includes(429), ownAfterSat429: own2.filter((x) => x.status === 429).length });
  }
  const ok = Object.values(out).every((o) => o.register !== 200 || (o.own429 === 0 && o.uiAfterOwn === 200 && o.missingKeyAfterOwn === 401 && o.globalSaturated && o.ownAfterSat429 === 0));
  check(`F7 ${MODE}`, "names 'global', 'name:x', 'key:global' (if they can enroll): 200 of their own requests leave /ui and missing-key unthrottled; a saturated global bucket does not throttle them", out, ok);
}

proxy.kill();
const f = summary(join(TMP, `rows-f6-${MODE}.results.txt`));
process.exitCode = f ? 1 : 0;
