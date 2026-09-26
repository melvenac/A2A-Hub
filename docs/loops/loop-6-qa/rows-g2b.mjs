// G2b (added 2026-09-26 on Gauge's finding): a human row keeps kind human across the ordinary registers
// every seat makes: hub-talk (--say, which calls register()), a daemon's boot register, and hub-key's
// initKey register (hub-talk --init-key with an existing file exits early, so hub-key's card shape is
// sent directly). Each on a FRESH createHuman row, so one step's damage does not mask the next.
// Usage: QA_TMP=... node rows-g2b.mjs
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { H, TMP, TREE, key, sha, placeKey, hub, register, cvxRun, rows, setRow, check, summary, sleep } from "./l6.mjs";
setRow("G2b");
const env = { ...process.env, HUB_URL: H.nS, A2A_KEY_DIR: join(TMP, "keys") }; delete env.AGENT_KEY; delete env.ANTHROPIC_API_KEY;
const kindOf = (n) => rows("agents").find((r) => r.name === n)?.agentCard?.kind ?? null;
const canIssue = async (n) => (await hub(H.nS, "POST", "/a2a/enroll", { as: n, body: {} })).status;
const fresh = (n) => { cvxRun(TREE.cand, "agents:createHuman", { name: n, apiKeyHash: sha(key(n)) }); placeKey(n, H.nS); return kindOf(n); };
const out = {};
{ const n = "qa-h2b-talk"; const k0 = fresh(n);
  const r = spawnSync(process.execPath, [join(TREE.cand, "scripts", "hub-talk.mjs"), "--as", n, "--peer", "relay", "--say", "g2b"], { env, encoding: "utf8", timeout: 60_000 });
  out.hubTalk = { before: k0, rc: r.status, after: kindOf(n), issue: await canIssue(n) }; }
{ const n = "qa-h2b-daemon"; const k0 = fresh(n);
  const d = spawn(process.execPath, ["--import", "tsx", "src/wrapper/daemon.ts", "--name", n], { cwd: TREE.cand, env, stdio: "ignore" });
  await sleep(8000); d.kill();
  out.daemon = { before: k0, after: kindOf(n), issue: await canIssue(n) }; }
{ const n = "qa-h2b-hubkey"; const k0 = fresh(n);
  const r = await register(H.nS, n, { kind: "ide-session", card: { description: `Coding-session peer ${n}` } }); // hub-key describeCard(name,"ide-session") shape
  out.hubKeyShape = { before: k0, status: r.status, after: kindOf(n), issue: await canIssue(n) }; }
{ const n = "qa-h2b-control"; const k0 = fresh(n);  // control: no register at all
  out.control = { before: k0, after: kindOf(n), issue: await canIssue(n) }; }
check("G2b", "a human row keeps kind human (and can still issue) after hub-talk, a daemon, and a hub-key-shaped register; control untouched",
  out, Object.values(out).every((o) => o.before === "human" && o.after === "human" && o.issue === 200));
summary(join(TMP, "rows-g2b.results.txt"));
