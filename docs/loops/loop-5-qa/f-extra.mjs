// F (Relay's deviation): agents.getByName and agents.listOnline return more fields in the candidate
// (owner, human). The c4d2d1c hub on the candidate functions must still: gate asks by askPolicy,
// escalate, list live agents (without leaking the new fields), and register. Plus the Loop 3 F1 guard:
// no public query returns apiKeyHash. Run after suite p2. QA_TMP=... node f-extra.mjs
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { H, CVX, TREE, TMP, hub, key, sha, cq, cm, cvxData, check, summary, sleep } from "./l5.mjs";

const hk = (port, name) => readFileSync(join(TMP, "keys", `127.0.0.1-${port}`, `${name}.key`), "utf8").trim();
const T1 = "qa-t1-p2", T3 = "qa-t3-p2", D1 = "qa-d1-p2";
for (const [base, port] of [[H.ooW, 4720], [H.ooS, 4721]]) {
  const mode = base === H.ooW ? "warn" : "strict";
  const asker = mode === "warn" ? T1 : T3;
  const k = hk(port, asker);
  // agents/live: the old hub maps only the fields it knows
  await hub(base, "POST", `/a2a/heartbeat/${asker}`, { rawKey: k, body: {} });
  const live = await hub(base, "GET", "/a2a/agents/live", { rawKey: k });
  const keys = [...new Set((live.json?.agents ?? []).flatMap((a) => Object.keys(a)))].sort();
  check(`F-live ${mode}`, "c4d2d1c hub on candidate listOnline: 200; entries carry only the old fields (no owner/human)", { status: live.status, keys, n: live.json?.agents?.length },
    live.status === 200 && keys.every((x) => ["kind", "lastSeen", "name", "rowCount"].includes(x)) && !keys.includes("owner"));
  // escalation with no `to`: the old hub picks from listOnline and assigns a task
  const text = `F escalate ${mode} ${Date.now()}`;
  Promise.race([hub(base, "POST", "/a2a/message/send", { rawKey: k, body: { jsonrpc: "2.0", id: 1, method: "message/send", params: { message: { role: "user", parts: [{ kind: "text", text }] } } } }), sleep(3000)]);
  await sleep(3500);
  const task = cvxData(TREE.old, "tasks").find((t) => JSON.stringify(t).includes(text));
  check(`F-escalate ${mode}`, "c4d2d1c hub escalation on candidate functions assigns the task to an online agent", { found: !!task, assignedAgent: task?.assignedAgent, status: task?.status }, !!task && !!task.assignedAgent);
  // re-register the same key through the old hub (register path on candidate functions)
  const rr = await hub(base, "POST", "/a2a/register", { body: { name: asker, apiKey: k, agentCard: { name: asker, description: "re-register", kind: "ide-session" } } });
  check(`F-register ${mode}`, "c4d2d1c hub re-register (same key) on candidate functions: 200", { status: rr.status, body: rr.text.slice(0, 80) }, rr.status === 200);
}
// the ask gate: the old hub reads askPolicy from the widened getByName
{
  const reg = await cm(CVX.O, "agents:registerAgent", { name: D1, apiKeyHash: sha(key(D1)), agentCard: { name: D1, description: "QA", kind: "ide-session" }, askPolicy: { allow: ["qa-nobody"] } });
  for (const [base, port, asker] of [[H.ooW, 4720, T1], [H.ooS, 4721, T3]]) {
    const r = await hub(base, "POST", "/a2a/message/send", { rawKey: hk(port, asker), body: { jsonrpc: "2.0", id: 1, method: "message/send", params: { message: { role: "user", parts: [{ kind: "text", text: "F gate" }] }, to: D1 } } });
    check(`F-askgate ${base === H.ooW ? "warn" : "strict"}`, "c4d2d1c hub still denies by askPolicy read from the widened getByName: 403", { event: reg?.event, status: r.status, body: r.text.slice(0, 100) }, r.status === 403 && /askPolicy/.test(r.text));
  }
}
// Loop 3 F1 guard: no public query returns apiKeyHash (runtime, on the candidate database)
{
  const probes = [
    ["agents:getByName", { name: "qa-a1" }], ["agents:listOnline", {}], ["sessions:listAll", {}],
    ["sessions:listVisibleTo", { name: "aaron" }], ["sessions:createCheck", { caller: "qa-a1", participantNames: ["qa-a1", "qa-b1"] }],
  ];
  const ids = JSON.parse(readFileSync(join(TMP, "l5-ids.json"), "utf8"));
  probes.push(["sessions:access", { sessionId: ids.S.Ain, caller: "aaron" }]);
  const hits = [];
  for (const [p, a] of probes) {
    let v; try { v = await cq(CVX.N, p, a); } catch (e) { v = { error: e.message.slice(0, 80) }; }
    const s = JSON.stringify(v);
    if (/apiKeyHash|[0-9a-f]{64}/.test(s)) hits.push(p);
  }
  check("F-guard runtime", "no public query (old and new) returns apiKeyHash or a 64-hex value", { probed: probes.map((x) => x[0]), hits }, hits.length === 0);
}
process.exitCode = summary(join(TMP, "f-extra.results.txt")) ? 1 : 0;
