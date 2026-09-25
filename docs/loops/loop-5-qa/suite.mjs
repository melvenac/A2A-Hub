// The flow suite shared by D1 (hub-talk), D2 (daemons) and F1 (skew): run against one warn hub and one
// strict hub, under a phase suffix, writing a normalised transcript for comparison across phases.
// Usage: QA_TMP=... node suite.mjs <warnHub> <strictHub> <daemonTree> <phase> <out.json>
import { spawnSync, spawn } from "node:child_process";
import { writeFileSync, readFileSync, mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { TMP, hub, key, placeKey, register, sleep } from "./l5.mjs";

const [W, Sx, DTREE, PH, OUT] = process.argv.slice(2);
const HT = "C:/Users/melve/Worktrees/qa3-cand/scripts/hub-talk.mjs"; // identical at both SHAs (D0)
const T = []; // transcript
const env = (url) => { const e = { ...process.env, HUB_URL: url, A2A_KEY_DIR: join(TMP, "keys") }; delete e.AGENT_KEY; delete e.ANTHROPIC_API_KEY; return e; };
const scrub = (s) => s.replace(new RegExp(`-${PH}\\b`, "g"), "").replace(/k[0-9a-z]{31}/g, "<sid>").replace(/\b\d{4}-\d\d-\d\dT[\d:.]+Z\b/g, "<ts>")
  .replace(/\b\d{12,}\b/g, "<n>").replace(/\b47\d\d\b/g, "<port>").replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<uuid>").replace(/\r/g, "").trim();
function talk(url, args, label) {
  const r = spawnSync(process.execPath, [HT, ...args], { env: env(url), encoding: "utf8", timeout: 90_000 });
  const rec = { step: label, rc: r.status, out: scrub((r.stdout ?? "") + (r.stderr ?? "")) };
  T.push(rec); return rec;
}
const n = (s) => `${s}-${PH}`;
// The key hub-talk (or the harness, for daemons) wrote for a name at a hub; copied for the other hub.
const kf = (url, name) => { const u = new URL(url); return join(TMP, "keys", `${u.hostname}-${u.port}`, `${name}.key`); };
const hkey = (url, name) => readFileSync(kf(url, name), "utf8").trim();
const copyKey = (name, from, to) => { mkdirSync(join(kf(to, name), ".."), { recursive: true }); copyFileSync(kf(from, name), kf(to, name)); };

for (const [mode, url, a, b] of [["warn", W, "qa-t1", "qa-t2"], ["strict", Sx, "qa-t3", "qa-t4"]]) {
  const A = n(a), B = n(b);
  // --init-key registers on the warn hub (register is open in both modes); the same key serves the strict hub.
  talk(W, ["--as", A, "--init-key"], `${mode} init ${a}`); talk(W, ["--as", B, "--init-key"], `${mode} init ${b}`);
  if (url !== W) { copyKey(A, W, url); copyKey(B, W, url); }
  talk(url, ["--as", A, "--peer", B, "--say", `hello from ${a}`], `${mode} ${a} --peer --say`);
  talk(url, ["--as", B, "--peer", A, "--wait", "--wait-timeout", "30"], `${mode} ${b} --wait`);
  talk(url, ["--as", B, "--peer", A, "--say", `reply from ${b}`], `${mode} ${b} --say`);
  talk(url, ["--as", A, "--peer", B, "--inbox"], `${mode} ${a} --inbox`);
  talk(url, ["--as", A, "--peer", B, "--wait", "--wait-timeout", "5"], `${mode} ${a} --wait (no new turn)`);
  // receipts, parsed
  const k = (nm) => ({ rawKey: hkey(url, nm) });
  const rooms = (await hub(url, "GET", `/a2a/peer/${A}/sessions`, { ...k(A) })).json?.sessions ?? [];
  const room = rooms.find((s) => (s.participants ?? []).includes(B)) ?? rooms[0];
  const reads = await hub(url, "GET", `/a2a/session/${room?._id}/reads`, { ...k(A) });
  T.push({ step: `${mode} reads`, status: reads.status, body: scrub(JSON.stringify(reads.json)) });
}

// D2: a daemon per mode (deterministic fallback: ANTHROPIC_API_KEY unset), from the hub's own tree
const daemons = [];
for (const [mode, url, d, asker] of [["warn", W, "qa-d1", "qa-t1"], ["strict", Sx, "qa-d2", "qa-t3"]]) {
  const D = n(d), Q = n(asker);
  await register(W, D); placeKey(D, W); if (url !== W) placeKey(D, url); // harness key for daemons, registered
  const p = spawn(process.execPath, ["--import", "tsx", "src/wrapper/daemon.ts", "--name", D], { cwd: DTREE, env: { ...env(url), POLL_MS: "1000" }, stdio: ["ignore", "pipe", "pipe"] });
  let log = ""; p.stdout.on("data", (x) => (log += x)); p.stderr.on("data", (x) => (log += x)); daemons.push(p);
  await sleep(5000);
  const live = ((await hub(url, "GET", "/a2a/agents/live", { rawKey: hkey(url, Q) })).json?.agents ?? []).some((a) => a.name === D);
  T.push({ step: `${mode} daemon heartbeat (seen live)`, live });
  talk(url, ["--as", Q, "--peer", D, "--say", `ping ${d}`], `${mode} ${asker} -> ${d} --say`);
  const w = talk(url, ["--as", Q, "--peer", D, "--wait", "--wait-timeout", "30"], `${mode} ${asker} waits for ${d}'s reply`);
  const askRes = await Promise.race([
    hub(url, "POST", "/a2a/message/send", { rawKey: hkey(url, Q), body: { jsonrpc: "2.0", id: 1, method: "message/send", params: { message: { role: "user", parts: [{ kind: "text", text: `task for ${d}` }] }, to: D } } }),
    sleep(60_000).then(() => ({ status: "timeout", json: null })),
  ]);
  T.push({ step: `${mode} ask ${d} (queue: claim + respond)`, status: askRes.status, answered: !!askRes.json?.result, body: scrub(JSON.stringify(askRes.json?.result ?? askRes.json ?? "")).slice(0, 200) });
  T.push({ step: `${mode} daemon log (errors)`, errors: (log.match(/error|refused|\b4\d\d\b/gi) ?? []).length });
}
for (const p of daemons) p.kill();
writeFileSync(OUT, JSON.stringify(T, null, 1));
for (const r of T) console.log(JSON.stringify(r).slice(0, 260));
