// A6.4 (seats still talk: default lobby join) and A6.5 (auth on the new routes).
// QA_STRICT_HUB=<:4450 AUTH_MODE=strict>, QA_OLD_HT, QA_OLD_HUB plus the usual env.
import { talk, hub, check, results, DIRECT } from "./harness.mjs";
import { join } from "node:path";
const tag = Date.now().toString(36);
const key = (n) => `${n}-key`;
const NEW_HT = join(process.env.QA_TREE, "scripts", "hub-talk.mjs");

// A6.4 default lobby join: two seats, no --peer, no --session. Run for new client on the candidate hub
// and, as the control, for the old client on the old hub.
async function lobby(script, base, label) {
  const [l1, l2] = [`qa-lob${label}1-${tag}`, `qa-lob${label}2-${tag}`];
  const waiter = talk(script, ["--as", l1, "--wait", "--wait-timeout", "90"], { hub: base, env: { AGENT_KEY: key(l1) } });
  await new Promise((r) => setTimeout(r, 3000));
  const sayer = await talk(script, ["--as", l2, "--say", `lobby hello ${label}`, "--join-timeout", "60"], { hub: base, env: { AGENT_KEY: key(l2) } });
  const w = await waiter;
  return { say: sayer.code, wait: w.code, got: w.stdout.includes(`lobby hello ${label}`), sayErr: sayer.stderr.trim().split("\n").slice(-2), waitErr: w.stderr.trim().split("\n").slice(-2) };
}
const ctl = await lobby(process.env.QA_OLD_HT, process.env.QA_OLD_HUB, "o");
const cand = await lobby(NEW_HT, DIRECT, "n");
check("A6.4-control", "control: old hub-talk on old hub, default lobby join works (instrument can see it)", ctl, ctl.say === 0 && ctl.wait === 0 && ctl.got);
check("A6.4", "candidate: default lobby join (no --peer/--session): say 0, wait 0 and receives", cand, cand.say === 0 && cand.wait === 0 && cand.got);

// A6.5 strict auth on the two new routes; warn mode passes through.
const S = process.env.QA_STRICT_HUB;
const [a, b] = ["a", "b"].map((x) => `qa-auth${x}-${tag}`);
for (const n of [a, b]) await hub("POST", "/a2a/register", { name: n, apiKey: key(n), agentCard: { name: n, description: `QA ${n}`, kind: "ide-session" } }, { base: S });
const sid = (await hub("POST", "/a2a/session", { title: "qa-auth", participants: [a, b], maxTurns: 500 }, { base: S, headers: { "X-Agent-Key": key(a) } })).json?.sessionId;
await hub("POST", `/a2a/session/${sid}/message`, { from: a, content: "auth t1" }, { base: S, headers: { "X-Agent-Key": key(a) } });
const mark = { reader: b, throughTurn: 1, via: "wait" };
const st = {};
for (const [label, headers] of [["nokey", {}], ["wrongkey", { "X-Agent-Key": "qa-wrong-key" }], ["validkey", { "X-Agent-Key": key(b) }]]) {
  st[`reads-${label}`] = (await hub("GET", `/a2a/session/${sid}/reads`, undefined, { base: S, headers })).status;
  st[`read-${label}`] = (await hub("POST", `/a2a/session/${sid}/read`, mark, { base: S, headers })).status;
}
check("A6.5-strict", "strict: /read and /reads reject no key and a wrong key; accept a valid key", st,
  [st["reads-nokey"], st["read-nokey"], st["reads-wrongkey"], st["read-wrongkey"]].every((s) => s === 401 || s === 403) && st["reads-validkey"] === 200 && st["read-validkey"] === 200);
const warn = { reads: (await hub("GET", `/a2a/session/${sid}/reads`, undefined, { base: DIRECT, headers: { "X-Agent-Key": "qa-wrong-key" } })).status };
check("A6.5-warn", "warn (default): a wrong key passes through on /reads", warn, warn.reads === 200);
const failed = results.filter((r) => !r.pass);
console.log(`\nA6 dyn: ${results.length - failed.length}/${results.length}; failed: ${failed.map((f) => f.row).join(", ") || "none"}`);
process.exit(failed.length ? 1 : 0);
