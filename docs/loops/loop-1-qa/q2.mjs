// Q2 observation (no verdict): what /reads shows for a member with leftAt set, and whether markRead accepts them.
// Runs against the throwaway Q2 stack only (QA_HUB_DIRECT=:4460, Convex :3450). QA_Q2_DIR = the q2 copy.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { hub, reads } from "./harness.mjs";
const Q = process.env.QA_Q2_DIR;
const tag = Date.now().toString(36);
const key = (n) => `${n}-key`;
const [a, b, c] = ["a", "b", "c"].map((x) => `qa-q2${x}-${tag}`);
for (const n of [a, b, c]) await hub("POST", "/a2a/register", { name: n, apiKey: key(n), agentCard: { name: n, description: `QA ${n}`, kind: "ide-session" } });
const sid = (await hub("POST", "/a2a/session", { title: "qa-Q2", participants: [a, b, c], maxTurns: 500 }, { headers: { "X-Agent-Key": key(a) } })).json.sessionId;
await hub("POST", `/a2a/session/${sid}/message`, { from: a, content: "Q2 t1" }, { headers: { "X-Agent-Key": key(a) } });
const r0 = await reads(sid);
const run = spawnSync(process.execPath, [join(Q, "node_modules", "convex", "bin", "main.js"), "run", "qaHelpers:setLeftAt", JSON.stringify({ sessionId: sid, name: b })], { cwd: Q, encoding: "utf8" });
console.log("setLeftAt:", run.status, (run.stdout || run.stderr).trim().split("\n").pop());
await hub("POST", `/a2a/session/${sid}/message`, { from: a, content: "Q2 t2 after b left" }, { headers: { "X-Agent-Key": key(a) } });
const r1 = await reads(sid);
const show = (r, n) => JSON.stringify(r.participant(n));
console.log("before leave  b:", show(r0, b));
console.log("after leave   b (left):", show(r1, b));
console.log("after leave   c (present, never read):", show(r1, c));
const sameShape = JSON.stringify(Object.keys(r1.participant(b) || {}).sort()) === JSON.stringify(Object.keys(r1.participant(c) || {}).sort());
console.log("left member distinguishable from present-unread member in /reads:", !sameShape || JSON.stringify(r1.participant(b)).includes("left") ? "yes" : "NO (same fields, same values shape)");
const p = await hub("POST", `/a2a/session/${sid}/read`, { reader: b, throughTurn: 2, via: "wait" }, { headers: { "X-Agent-Key": key(b) } });
const r2 = await reads(sid);
console.log("markRead for left member b:", p.status, JSON.stringify(p.json), "-> b.lastRead now", JSON.stringify(r2.participant(b)?.lastRead));
