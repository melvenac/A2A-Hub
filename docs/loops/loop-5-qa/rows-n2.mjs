// Loop 5 rows on the candidate database, part 2: A6 (valid body), tasks A11/A12, escalation and
// narration A15, cross-owner `to` A19/A20, JSON-RPC A16/A17 + every SDK method (INV1), askPolicy C1/C2.
// Needs rows-n1's setup (same QA_TMP). Run: QA_TMP=... node rows-n2.mjs
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { H, CVX, TMP, hub, key, sha, cq, cm, withLog, check, summary, norm, sleep } from "./l5.mjs";

const { S, FAKE } = JSON.parse(readFileSync(join(TMP, "l5-ids.json"), "utf8"));
const A = S.Ain;
const beat = async () => { for (const n of ["qa-a1", "qa-a2", "qa-a3", "qa-b1", "qa-b2"]) await hub(H.nW, "POST", `/a2a/heartbeat/${n}`, { as: n, body: {} }); };
await beat();
// A prior run's C rows leave qa-a2 allowing only qa-a3; start each run from a permissive policy (C re-narrows it).
await cm(CVX.N, "agents:registerAgent", { name: "qa-a2", apiKeyHash: sha(key("qa-a2")), agentCard: { name: "qa-a2", description: "QA qa-a2", kind: "ide-session" }, askPolicy: { allow: ["qa-a1", "qa-a2", "qa-a3"] } });
const one = (lines, re) => lines.length === 1 && lines[0].ok && re.test(lines[0].what) && !lines[0].bad32;

// ---------------------------------------------------------------- A6 with a valid body
{
  const bad = { reader: "qa-a2", via: "inbox", throughTurn: 1 };
  const s = await withLog([H.nS], () => hub(H.nS, "POST", `/a2a/session/${A}/read`, { as: "qa-a1", body: bad }));
  const o = await hub(H.onS, "POST", `/a2a/session/${A}/read`, { as: "qa-a1", body: bad });
  check("A6a strict", "reader != caller: 403 'reader is not the caller' (as c4d2d1c); one REJECT reader=qa-a2", { new: [s.res.status, s.res.text], old: [o.status, o.text], lines: s.lines.nS },
    s.res.status === 403 && s.res.text === o.text && one(s.lines.nS, /^reader=qa-a2$/));
  const w = await withLog([H.nW], () => hub(H.nW, "POST", `/a2a/session/${A}/read`, { as: "qa-a1", body: bad }));
  const ow = await hub(H.onW, "POST", `/a2a/session/${A}/read`, { as: "qa-a1", body: bad });
  check("B1 A6a", "warn: c4d2d1c's answer; one WOULD REJECT reader=qa-a2", { new: [w.res.status, w.res.text], old: [ow.status, ow.text], lines: w.lines.nW },
    w.res.status === ow.status && JSON.stringify(norm(w.res.json)) === JSON.stringify(norm(ow.json)) && one(w.lines.nW, /^reader=qa-a2$/));
  const nm = { reader: "qa-b1", via: "inbox", throughTurn: 1 };
  for (const [nb, ob, mode] of [[H.nS, H.onS, "strict"], [H.nW, H.onW, "warn"]]) {
    const n = await withLog([nb], () => hub(nb, "POST", `/a2a/session/${A}/read`, { as: "qa-b1", body: nm }));
    const oo = await hub(ob, "POST", `/a2a/session/${A}/read`, { as: "qa-b1", body: nm });
    const ln = Object.values(n.lines)[0];
    check(`A6b ${mode}`, "non-member reader (the caller): markRead's answer, identical to c4d2d1c; logged as non-member [authz]", { new: [n.res.status, n.res.text], old: [oo.status, oo.text], lines: ln },
      n.res.status === oo.status && n.res.text === oo.text && one(ln, /^non-member session=/));
  }
  const fk = await hub(H.nS, "POST", `/a2a/session/${FAKE}/read`, { as: "qa-b1", body: nm });
  const nmS = await hub(H.nS, "POST", `/a2a/session/${A}/read`, { as: "qa-b1", body: nm });
  check("A6 oracle (recorded)", "/read keeps markRead's own answers (criteria A6: unchanged); non-member vs nonexistent", { nonMember: [nmS.status, nmS.text], absent: [fk.status, fk.text] }, true);
  const self = await hub(H.nS, "POST", `/a2a/session/${A}/read`, { as: "qa-a1", body: { reader: "qa-a1", via: "inbox", throughTurn: 1 } });
  check("A6 self", "own read receipt 200", { status: self.status, body: self.text.slice(0, 80) }, self.status === 200);
}

// ---------------------------------------------------------------- legacy asks (background: an ask blocks up to 2 min)
const ask = (base, as, content, to, extra = {}) =>
  hub(base, "POST", "/a2a/message/send", { as, body: { jsonrpc: "2.0", id: 1, method: "message/send", params: { message: { role: extra.role ?? "user", parts: [{ kind: "text", text: content }] }, ...(to ? { to } : {}) } } });
const bg = (p) => Promise.race([p, sleep(2500).then(() => ({ status: "pending" }))]);
const queue = async (name) => ((await hub(H.nW, "GET", `/a2a/queue/${name}`, { as: name })).json?.tasks ?? []);
async function taskFor(name, text, tries = 20) {
  for (let i = 0; i < tries; i++) { const t = (await queue(name)).find((x) => JSON.stringify(x).includes(text)); if (t) return t; await sleep(500); }
  return null;
}
const tid = (t) => t?.taskId ?? t?.id;

// A11 / A12
{
  const mkTask = async (label) => { const text = `task ${label} ${Date.now()}`; bg(ask(H.nW, "qa-a1", text, "qa-a2")); return taskFor("qa-a2", text); };
  const T1 = await mkTask("T1"), T2 = await mkTask("T2");
  check("A11/12 setup", "two tasks assigned to qa-a2", { T1: !!T1, T2: !!T2 }, T1 && T2);
  const c = await withLog([H.nS], () => hub(H.nS, "POST", `/a2a/task/${tid(T1)}/claim`, { as: "qa-a3", body: { agentName: "qa-a2" } }));
  check("A11 strict", "claim with agentName != caller: 403; one REJECT agentName=qa-a2", { status: c.res.status, body: c.res.text, lines: c.lines.nS }, c.res.status === 403 && one(c.lines.nS, /^agentName=qa-a2$/));
  const cs = await hub(H.nS, "POST", `/a2a/task/${tid(T1)}/claim`, { as: "qa-a2", body: { agentName: "qa-a2" } });
  check("A11 self", "assignee claims its own task: 200", { status: cs.status, body: cs.text.slice(0, 80) }, cs.status === 200);
  for (const [T, label] of [[T1, "claimed"], [T2, "unclaimed"]]) {
    const r = await withLog([H.nS], () => hub(H.nS, "POST", `/a2a/task/${tid(T)}/respond`, { as: "qa-a3", body: { response: "not mine" } }));
    const nx = await hub(H.nS, "POST", "/a2a/task/qa-no-such-task/respond", { as: "qa-a3", body: { response: "x" } });
    check(`A12 strict ${label}`, "respond by a non-assignee: 404, byte-identical to a nonexistent task; one REJECT not-assigned", { status: r.res.status, body: r.res.text, absent: [nx.status, nx.text], lines: r.lines.nS },
      r.res.status === 404 && r.res.text === nx.text && nx.status === 404 && one(r.lines.nS, /^not-assigned task=/));
  }
  for (const T of [T1, T2]) {
    const r = await hub(H.nS, "POST", `/a2a/task/${tid(T)}/respond`, { as: "qa-a2", body: { response: "answer from qa-a2" } });
    const row = await cq(CVX.N, "tasks:getByTaskId", { taskId: tid(T) });
    check("A12 self", "assignee responds: 200; task completed and assignedAgent kept (Q8)", { status: r.status, state: row?.status, assignedAgent: row?.assignedAgent }, r.status === 200 && row?.status === "completed" && row?.assignedAgent === "qa-a2");
  }
  // B1 for claim and respond: fresh tasks per hub, same preconditions
  const T3 = await mkTask("T3"), T4 = await mkTask("T4"), T5 = await mkTask("T5"), T6 = await mkTask("T6");
  const cw = await withLog([H.nW], () => hub(H.nW, "POST", `/a2a/task/${tid(T3)}/claim`, { as: "qa-a3", body: { agentName: "qa-a2" } }));
  const co = await hub(H.onW, "POST", `/a2a/task/${tid(T4)}/claim`, { as: "qa-a3", body: { agentName: "qa-a2" } });
  check("B1 A11", "warn claim for another: c4d2d1c's answer; one WOULD REJECT", { new: [cw.res.status, cw.res.text], old: [co.status, co.text], lines: cw.lines.nW },
    cw.res.status === co.status && JSON.stringify(norm(cw.res.json)) === JSON.stringify(norm(co.json)) && one(cw.lines.nW, /^agentName=qa-a2$/));
  const rw = await withLog([H.nW], () => hub(H.nW, "POST", `/a2a/task/${tid(T5)}/respond`, { as: "qa-a3", body: { response: "warn respond" } }));
  const ro = await hub(H.onW, "POST", `/a2a/task/${tid(T6)}/respond`, { as: "qa-a3", body: { response: "warn respond" } });
  check("B1 A12", "warn respond by non-assignee: c4d2d1c's answer; one WOULD REJECT", { new: [rw.res.status, rw.res.text], old: [ro.status, ro.text], lines: rw.lines.nW },
    rw.res.status === ro.status && rw.res.text === ro.text && one(rw.lines.nW, /^not-assigned task=/));
  const t5 = await cq(CVX.N, "tasks:getByTaskId", { taskId: tid(T5) }), t6 = await cq(CVX.N, "tasks:getByTaskId", { taskId: tid(T6) });
  check("B1 A12 (Q8 in warn)", "new hub keeps assignedAgent on completion; c4d2d1c wipes it (the fixed defect)", { newAssigned: t5?.assignedAgent, oldAssigned: t6?.assignedAgent ?? null }, t5?.assignedAgent === "qa-a2");
  await hub(H.nW, "POST", `/a2a/task/${tid(T3)}/respond`, { as: "qa-a2", body: { response: "done" } });
  await hub(H.nW, "POST", `/a2a/task/${tid(T4)}/respond`, { as: "qa-a2", body: { response: "done" } });
}

// A15 / A19: escalation, narration, cross-owner `to` (legacy)
{
  // Each hub process creates its own Hub activity room at startup, and four hubs share this DB: read them all.
  const hubRooms = ((await hub(H.nS, "GET", "/a2a/sessions", { as: "aaron" })).json?.sessions ?? []).filter((s) => JSON.stringify(s.participants?.slice().sort()) === '["aaron","hub"]');
  const activity = async () => { const out = []; for (const r of hubRooms) out.push(...((await hub(H.nS, "GET", `/a2a/session/${r._id}/messages`, { as: "aaron" })).json?.messages ?? []).map((m) => m.content)); return out; };
  check("A15 setup", "aaron's Hub activity rooms found (one per hub process)", { rooms: hubRooms.length }, hubRooms.length >= 1);
  for (const base of [H.nS, H.nW]) {
    const mode = base === H.nS ? "strict" : "warn";
    await beat();
    const tb = `A15 from b1 ${mode} ${Date.now()}`; bg(ask(base, "qa-b1", tb, undefined, { role: "aaron" }));
    await sleep(1500);
    const where = { b1: !!(await taskFor("qa-b1", tb, 4)), b2: !!(await taskFor("qa-b2", tb, 4)), a1: !!(await taskFor("qa-a1", tb, 1)), a2: !!(await taskFor("qa-a2", tb, 1)), a3: !!(await taskFor("qa-a3", tb, 1)) };
    check(`A15b ${mode}`, "no-`to` ask from B lands only on a B-owned agent (Q5)", where, (where.b1 || where.b2) && !where.a1 && !where.a2 && !where.a3);
    const act = await activity();
    check(`A15c ${mode}`, "B's text is not narrated into aaron's Hub activity room (Q5)", { hits: act.filter((c) => c.includes(tb)).length }, act.filter((c) => c.includes(tb)).length === 0);
    const ta = `A15 from a1 ${mode} ${Date.now()}`; bg(ask(base, "qa-a1", ta, undefined, { role: "aaron" }));
    await sleep(2000);
    const act2 = await activity(); const line = act2.find((c) => c.includes(ta)) ?? "";
    check(`A15a ${mode}`, "A's ask is narrated with the sender = caller (qa-a1), not role 'aaron'", { narrated: !!line, line: line.slice(0, 60) }, /Incoming from qa-a1/.test(line) && !/Incoming from aaron/.test(line));
  }
  // A19: explicit cross-owner `to`
  const tq = `A19 ${Date.now()}`;
  const s = await withLog([H.nS], () => ask(H.nS, "qa-b1", tq, "qa-a1"));
  await sleep(1000);
  check("A19 strict", "qa-b1 to=qa-a1: 403 'cross-owner to=qa-a1'; no task for qa-a1; one REJECT", { status: s.res.status, body: s.res.text, taskForA1: !!(await taskFor("qa-a1", tq, 2)), lines: s.lines.nS },
    s.res.status === 403 && s.res.json?.error === "cross-owner to=qa-a1" && !(await taskFor("qa-a1", tq, 1)) && one(s.lines.nS, /^cross-owner to=qa-a1$/));
  const ts = `A19 self ${Date.now()}`; const sr = await bg(ask(H.nS, "qa-b1", ts, "qa-b2"));
  check("A19 self", "qa-b1 to=qa-b2 (same owner): not refused; the task reaches qa-b2", { status: sr.status, task: !!(await taskFor("qa-b2", ts)) }, sr.status !== 403 && !!(await taskFor("qa-b2", ts, 2)));
  const tw = `A19 warn ${Date.now()}`;
  const w = await withLog([H.nW], () => bg(ask(H.nW, "qa-b1", tw, "qa-a1")));
  check("B1 A19", "warn: not refused (the ask proceeds to qa-a1); one WOULD REJECT cross-owner", { status: w.res.status, task: !!(await taskFor("qa-a1", tw)), lines: w.lines.nW },
    w.res.status !== 403 && !!(await taskFor("qa-a1", tw, 2)) && one(w.lines.nW, /^cross-owner to=qa-a1$/));
}

// ---------------------------------------------------------------- JSON-RPC
const rpc = (base, as, method, params) => hub(base, "POST", "/a2a/jsonrpc", { as, body: { jsonrpc: "2.0", id: 7, method, params } });
const rpcSend = (base, as, text, to, blocking = false) =>
  rpc(base, as, "message/send", { message: { kind: "message", messageId: randomUUID(), role: "user", parts: [{ kind: "text", text }], ...(to ? { metadata: { to } } : {}) }, configuration: { blocking } });
const stateOf = (r) => r.json?.result?.status?.state ?? r.json?.result?.kind ?? (r.json?.error ? `error ${r.json.error.code}` : `http ${r.status}`);
const reasonOf = (r) => JSON.stringify(r.json?.result?.status?.message ?? r.json?.result ?? r.json?.error ?? "").slice(0, 160);
{
  const created = await rpcSend(H.nS, "qa-a1", `A16 ${Date.now()}`, "qa-a2");
  const T = created.json?.result?.id;
  check("A16 setup", "qa-a1 creates an A2A task through JSON-RPC (non-blocking)", { status: created.status, state: stateOf(created), id: T?.slice(0, 8) }, !!T);
  const lf = T ? await cq(CVX.N, "a2aTasks:loadFor", { taskId: T }) : null;
  check("A17", "the task records createdBy = the caller (qa-a1)", { createdBy: lf?.createdBy }, lf?.createdBy === "qa-a1");
  const methods = [
    ["tasks/get", { id: T }], ["tasks/cancel", { id: T }], ["tasks/resubscribe", { id: T }],
    ["tasks/pushNotificationConfig/get", { id: T }], ["tasks/pushNotificationConfig/list", { id: T }],
    ["tasks/pushNotificationConfig/delete", { id: T, pushNotificationConfigId: "x" }],
    ["tasks/pushNotificationConfig/set", { taskId: T, pushNotificationConfig: { url: "http://127.0.0.1:9/x" } }],
  ];
  const absentId = "qa-no-such-a2a-task";
  for (const [m, p] of methods) {
    const other = await withLog([H.nS], () => Promise.race([rpc(H.nS, "qa-b1", m, p), sleep(4000).then(() => ({ status: "timeout", text: "" }))]));
    const pAbs = JSON.parse(JSON.stringify(p).replaceAll(T, absentId));
    const absent = await Promise.race([rpc(H.nS, "qa-b1", m, pAbs), sleep(4000).then(() => ({ status: "timeout", text: "" }))]);
    const noLeak = !(other.res.text ?? "").includes(`A16 `);
    check(`A16 strict ${m}`, "another caller: same answer as a nonexistent id (O6), no task content", { other: [other.res.status, (other.res.text ?? "").slice(0, 140)], absent: [absent.status, (absent.text ?? "").slice(0, 140)], lines: other.lines.nS.length },
      other.res.status === absent.status && (other.res.text ?? "").replaceAll(T, absentId) === (absent.text ?? "") && noLeak);
  }
  const after = await rpc(H.nS, "qa-a1", "tasks/get", { id: T });
  check("A16 self", "the creator reads its task; cancel by another left its state unchanged", { status: after.status, state: stateOf(after) }, after.json?.result?.id === T && stateOf(after) !== "canceled");
  const ext = await rpc(H.nS, "qa-b1", "agent/getAuthenticatedExtendedCard", {});
  const extO = await rpc(H.onS, "qa-b1", "agent/getAuthenticatedExtendedCard", {});
  check("INV1 agent/getAuthenticatedExtendedCard", "no per-caller data; same answer as c4d2d1c", { new: ext.text.slice(0, 120), old: extO.text.slice(0, 120) }, ext.status === extO.status && ext.text === extO.text);
  // warn: another caller's tasks/get succeeds as today, with one line
  const gw = await withLog([H.nW], () => rpc(H.nW, "qa-b1", "tasks/get", { id: T }));
  const go = await rpc(H.onW, "qa-b1", "tasks/get", { id: T });
  check("B1 A16", "warn tasks/get by another: c4d2d1c's answer; one WOULD REJECT a2a-task", { new: gw.res.json?.result?.id === T, old: go.json?.result?.id === T, lines: gw.lines.nW },
    gw.res.json?.result?.id === T && go.json?.result?.id === T && one(gw.lines.nW, /^a2a-task=/));
  // A20: cross-owner `to` through JSON-RPC
  const x = await withLog([H.nS], () => rpcSend(H.nS, "qa-b1", `A20 ${Date.now()}`, "qa-a1", true));
  const xnb = await rpcSend(H.nS, "qa-b1", `A20 nb ${Date.now()}`, "qa-a1"); await sleep(1500);
  const xnbFinal = await rpc(H.nS, "qa-b1", "tasks/get", { id: xnb.json?.result?.id });
  check("A20 strict (non-blocking)", "the non-blocking reply is interim; the task's final state is rejected (observation: submitted->working->rejected)", { first: stateOf(xnb), final: stateOf(xnbFinal) }, stateOf(xnbFinal) === "rejected");
  check("A20 strict", "qa-b1 metadata.to=qa-a1: terminal rejected carrying cross-owner; one REJECT", { state: stateOf(x.res), reason: reasonOf(x.res), lines: x.lines.nS },
    stateOf(x.res) === "rejected" && /cross-owner to=qa-a1/.test(reasonOf(x.res)) && one(x.lines.nS, /^cross-owner to=qa-a1$/));
  const xs = await rpcSend(H.nS, "qa-b1", `A20 self ${Date.now()}`, "qa-b2");
  check("A20 self", "qa-b1 to=qa-b2: not rejected", { state: stateOf(xs) }, stateOf(xs) !== "rejected" && xs.status === 200);
  const xw = await withLog([H.nW], () => rpcSend(H.nW, "qa-b1", `A20 warn ${Date.now()}`, "qa-a1"));
  check("B1 A20", "warn: not rejected; one WOULD REJECT cross-owner", { state: stateOf(xw.res), lines: xw.lines.nW }, stateOf(xw.res) !== "rejected" && one(xw.lines.nW, /^cross-owner to=qa-a1$/));
}

// ---------------------------------------------------------------- C: askPolicy (Q9), both routes, both modes
{
  const reg = await cm(CVX.N, "agents:registerAgent", { name: "qa-a2", apiKeyHash: sha(key("qa-a2")), agentCard: { name: "qa-a2", description: "QA qa-a2", kind: "ide-session" }, askPolicy: { allow: ["qa-a3"] } });
  const pol = (await cq(CVX.N, "agents:getByName", { name: "qa-a2" }))?.askPolicy;
  check("C setup", "qa-a2 askPolicy allow [qa-a3] set on scratch via registerAgent", { event: reg?.event ?? reg, policy: pol }, JSON.stringify(pol?.allow) === '["qa-a3"]');
  await beat();
  for (const base of [H.nS, H.nW]) {
    const mode = base === H.nS ? "strict" : "warn";
    const l = await ask(base, "qa-a1", `C1 legacy ${mode} ${Date.now()}`, "qa-a2");
    check(`C1 legacy ${mode}`, "qa-a1 -> qa-a2 via /message/send: 403 with askDeniedReason", { status: l.status, body: l.text.slice(0, 120) }, l.status === 403);
    const j = await rpcSend(base, "qa-a1", `C1 rpc ${mode} ${Date.now()}`, "qa-a2", true);
    check(`C1 jsonrpc ${mode}`, "the same ask via /a2a/jsonrpc: terminal rejected carrying the same reason", { state: stateOf(j), reason: reasonOf(j), legacyReason: l.json?.reason },
      stateOf(j) === "rejected" && !!l.json?.reason && reasonOf(j).includes(l.json.reason));
    const ta = `C1 allowed ${mode} ${Date.now()}`; const al = await bg(ask(base, "qa-a3", ta, "qa-a2"));
    const ja = await rpcSend(base, "qa-a3", `C1 allowed rpc ${mode} ${Date.now()}`, "qa-a2"); // non-blocking: an allowed ask escalates and waits
    check(`C1 both directions ${mode}`, "qa-a3 (allowed) is not refused on either route", { legacy: al.status, rpc: stateOf(ja) }, al.status !== 403 && stateOf(ja) !== "rejected");
  }
  const old = await rpcSend(H.onW, "qa-a1", `C1 old ${Date.now()}`, "qa-a2");
  check("C1 baseline (the defect)", "c4d2d1c's JSON-RPC does NOT enforce askPolicy (T-004): shows C1 detects the fix", { state: stateOf(old) }, stateOf(old) !== "rejected");
}
process.exitCode = summary(join(TMP, "rows-n2.results.txt")) ? 1 : 0;
