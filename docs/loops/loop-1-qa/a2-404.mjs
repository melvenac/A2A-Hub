// Addition for report 2 (A2.6 third shape): a well-formed sessions id that does not exist in this
// deployment must give 404, not 400 and not 500. The id is a real sessions id from run 1's database
// (cb7cda7 run, A3 room), which is not in the fresh deployment. Control: a live session gives 200.
import { hub, check, results } from "./harness.mjs";
const GHOST = process.env.QA_GHOST_SID;
const key = (n) => `${n}-key`;
const tag = Date.now().toString(36);
const [a, b] = ["a", "b"].map((x) => `qa-404${x}-${tag}`);
for (const n of [a, b]) await hub("POST", "/a2a/register", { name: n, apiKey: key(n), agentCard: { name: n, description: `QA ${n}`, kind: "ide-session" } });
const live = (await hub("POST", "/a2a/session", { title: "qa-404", participants: [a, b], maxTurns: 500 }, { headers: { "X-Agent-Key": key(a) } })).json.sessionId;
await hub("POST", `/a2a/session/${live}/message`, { from: a, content: "404 control" }, { headers: { "X-Agent-Key": key(a) } });
const ctlReads = await hub("GET", `/a2a/session/${live}/reads`);
check("A2.6-control", "a live session: /reads 200, with the same shape as before (turnCount + participants, no ok field)", { status: ctlReads.status, keys: Object.keys(ctlReads.json ?? {}) }, ctlReads.status === 200 && Object.keys(ctlReads.json).sort().join() === "participants,turnCount");
const r = await hub("GET", `/a2a/session/${GHOST}/reads`);
const p = await hub("POST", `/a2a/session/${GHOST}/read`, { reader: b, throughTurn: 1, via: "wait" }, { headers: { "X-Agent-Key": key(b) } });
check("A2.6-unknown-wellformed", "well-formed sessions id absent from this DB: /reads 404 and /read 404 'session not found'", { reads: [r.status, r.json?.error], read: [p.status, p.json?.error] },
  r.status === 404 && p.status === 404 && /session not found/.test(r.json?.error) && /session not found/.test(p.json?.error));
const failed = results.filter((x) => !x.pass).length;
console.log(`\nA2.6 404: ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
