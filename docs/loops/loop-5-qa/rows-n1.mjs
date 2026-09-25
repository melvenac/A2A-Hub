// Loop 5 rows on the candidate database (cvxN), part 1: P13 setup; A1-A10, A13, A14, A18 (strict,
// both directions, the Q2 oracle); B1/B2 for the same (warn = old's answer + exactly one parsed
// [authz] line); E1-E3, E6 by API. Run: QA_TMP=... node rows-n1.mjs
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { H, CVX, TREE, TMP, hub, register, key, cq, cvxRun, withLog, check, summary, norm, sleep, UNKNOWN } from "./l5.mjs";

// ---------------------------------------------------------------- P13 setup
const humans = ["aaron", "qa-owner2"], agentsA = ["qa-a1", "qa-a2", "qa-a3"], agentsB = ["qa-b1", "qa-b2"];
for (const n of humans) { const r = await register(H.nW, n, "human"); check("P13.reg", `register ${n} (human)`, { status: r.status }, r.status === 200); }
for (const n of [...agentsA, ...agentsB]) { const r = await register(H.nW, n); check("P13.reg", `register ${n}`, { status: r.status }, r.status === 200); }
for (const n of agentsB) { const r = cvxRun(TREE.cand, "agents:setOwner", { name: n, owner: "qa-owner2" }); check("P13.setOwner", `setOwner ${n} -> qa-owner2`, r, r?.updated >= 1); }
const owners = {};
for (const n of [...humans, ...agentsA, ...agentsB]) owners[n] = (await cq(CVX.N, "agents:getByName", { name: n }))?.owner;
check("P13.owners", "owners read back", owners,
  owners.aaron === "aaron" && owners["qa-owner2"] === "qa-owner2" && agentsA.every((n) => owners[n] === "aaron") && agentsB.every((n) => owners[n] === "qa-owner2"));
const beat = async () => { for (const n of [...agentsA, ...agentsB]) await hub(H.nW, "POST", `/a2a/heartbeat/${n}`, { as: n, body: {} }); };
await beat();
let seedMsg = null;
const mk = async (as, title, participants) => {
  const r = await hub(H.nW, "POST", "/a2a/session", { as, body: { title, participants, maxTurns: 40 } });
  const id = r.json?.sessionId;
  const m = await hub(H.nW, "POST", `/a2a/session/${id}/message`, { as, body: { from: as, content: `${title} seed` } });
  seedMsg = seedMsg ?? m.json?.messageId;
  return id;
};
const S = { Ain: await mk("qa-a1", "A-in", ["aaron", "qa-a1"]), Aag: await mk("qa-a1", "A-agents", ["qa-a1", "qa-a2"]), B: await mk("qa-b1", "B-room", ["qa-b1", "qa-b2"]) };
const FAKE = seedMsg; // a real id of another table (messages): sessions.access reads it as absent
check("P13.rooms", "rooms created; FAKE is a messages id", { ...S, fake: FAKE?.slice(0, 8) }, S.Ain && S.Aag && S.B && FAKE);
writeFileSync(join(TMP, "l5-ids.json"), JSON.stringify({ S, FAKE }));

// ---------------------------------------------------------------- A (strict) + B (warn) per case
const COUNTERS = (v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, /^(turn|maxTurns)$/.test(k) && typeof x === "number" ? "<n>" : x])) : v);
// Named volatile for routes that write (the new and the old call both write to the same room): turn, maxTurns.
const same = (a, b) => a.status === b.status && JSON.stringify(norm(COUNTERS(a.json) ?? a.text)) === JSON.stringify(norm(COUNTERS(b.json) ?? b.text));
async function caseRow(c) {
  // A: strict, the mismatch
  const s = await withLog([H.nS], () => hub(H.nS, c.method, c.path, { as: c.as, body: c.body }));
  const sl = s.lines.nS;
  const aOk = s.res.status === c.strict && (!c.error || s.res.json?.error === c.error) &&
    (c.noLine ? sl.length === 0 : sl.length === 1 && sl[0].ok && sl[0].mode === "REJECT" && c.what.test(sl[0].what) && sl[0].caller === c.as && !sl[0].bad32);
  check(`${c.row} strict`, `${c.desc}: ${c.strict}${c.error ? ` "${c.error}"` : ""}, one [authz] REJECT ${c.what}`, { status: s.res.status, body: s.res.json ?? s.res.text.slice(0, 80), lines: sl }, aOk);
  // Q2 oracle: the same caller on an id that does not exist gets the identical answer
  if (c.oracle) {
    const f = await hub(H.nS, c.method, c.oracle, { as: c.as, body: c.body });
    check(`${c.row} oracle`, "forbidden and nonexistent are byte-identical in strict", { forbidden: [s.res.status, s.res.text], absent: [f.status, f.text] }, s.res.status === f.status && s.res.text === f.text);
  }
  // both directions: as itself, in its own room
  if (c.self) {
    const o = await withLog([H.nS], () => hub(H.nS, c.self.method ?? c.method, c.self.path ?? c.path, { as: c.self.as ?? c.as, body: c.self.body ?? c.body }));
    check(`${c.row} self`, `as itself: ${c.self.expect ?? 200}, no [authz] line`, { status: o.res.status, lines: o.lines.nS.length }, o.res.status === (c.self.expect ?? 200) && o.lines.nS.length === 0);
  }
  // B: warn gives old's answer, and exactly one WOULD REJECT line
  if (!c.noWarn) {
    const w = await withLog([H.nW], () => hub(H.nW, c.method, c.path, { as: c.as, body: c.body }));
    const o = await hub(H.onW, c.method, c.path, { as: c.as, body: c.body });
    const wl = w.lines.nW;
    const bOk = same(w.res, o) && (c.noLine ? wl.length === 0 : wl.length === 1 && wl[0].ok && wl[0].mode === "WOULD REJECT" && wl[0].warnTail && c.what.test(wl[0].what) && wl[0].caller === c.as && !wl[0].bad32);
    check(`B1 ${c.row}`, `warn = c4d2d1c's answer; one WOULD REJECT ${c.what}`, { new: [w.res.status, (w.res.text ?? "").slice(0, 90)], old: [o.status, (o.text ?? "").slice(0, 90)], lines: wl }, bOk);
  }
}
const A = S.Ain, AG = S.Aag, B = S.B;
const cases = [
  { row: "A1", desc: "from != caller in own room", method: "POST", path: `/a2a/session/${A}/message`, as: "qa-a1", body: { from: "qa-a2", content: "A1" }, strict: 403, error: "from is not the caller", what: /^from=qa-a2$/, self: { body: { from: "qa-a1", content: "A1 self" } } },
  { row: "A2", desc: "non-participant posts (qa-b1 into A-in)", method: "POST", path: `/a2a/session/${A}/message`, as: "qa-b1", body: { from: "qa-b1", content: "A2" }, strict: 404, error: "session not found", what: /^non-member session=\S{8}…$/, oracle: `/a2a/session/${FAKE}/message`, self: { path: `/a2a/session/${B}/message`, body: { from: "qa-b1", content: "A2 self" } } },
  { row: "A3a", desc: "non-participant reads (qa-b1 on A-in)", method: "GET", path: `/a2a/session/${A}/messages`, as: "qa-b1", strict: 404, error: "session not found", what: /^non-member session=/, oracle: `/a2a/session/${FAKE}/messages`, self: { path: `/a2a/session/${B}/messages` } },
  { row: "A3b", desc: "same-owner non-participant reads (qa-a3 on A-agents)", method: "GET", path: `/a2a/session/${AG}/messages`, as: "qa-a3", strict: 404, error: "session not found", what: /^non-member session=/, oracle: `/a2a/session/${FAKE}/messages`, self: { as: "qa-a1" } },
  { row: "A3c", desc: "malformed id, strict (Q2)", method: "GET", path: `/a2a/session/bogus/messages`, as: "qa-a1", strict: 404, error: "session not found", noLine: true, noWarn: true },
  { row: "A4", desc: "non-participant reads receipts", method: "GET", path: `/a2a/session/${A}/reads`, as: "qa-b1", strict: 404, error: "session not found", what: /^non-member session=/, oracle: `/a2a/session/${FAKE}/reads`, self: { path: `/a2a/session/${B}/reads` } },
  { row: "A5a", desc: "rename by non-participant", method: "POST", path: `/a2a/session/${A}/rename`, as: "qa-b1", body: { title: "A5" }, strict: 404, error: "session not found", what: /^non-member session=/, oracle: `/a2a/session/${FAKE}/rename`, self: { path: `/a2a/session/${B}/rename`, body: { title: "B-room" } } },
  { row: "A5b", desc: "extend by non-participant", method: "POST", path: `/a2a/session/${A}/extend`, as: "qa-b1", body: { addTurns: 1 }, strict: 404, error: "session not found", what: /^non-member session=/, oracle: `/a2a/session/${FAKE}/extend`, self: { path: `/a2a/session/${B}/extend` } },
  { row: "A5c", desc: "rename by aaron on A-agents (owner view is read-only)", method: "POST", path: `/a2a/session/${AG}/rename`, as: "aaron", body: { title: "A5c" }, strict: 404, error: "session not found", what: /^non-member session=/, self: { path: `/a2a/session/${A}/rename`, body: { title: "A-in" } } },
  { row: "A5d", desc: "extend by aaron on A-agents", method: "POST", path: `/a2a/session/${AG}/extend`, as: "aaron", body: { addTurns: 1 }, strict: 404, error: "session not found", what: /^non-member session=/, self: { path: `/a2a/session/${A}/extend` } },
  { row: "A5e", desc: "post by aaron on A-agents (owner view is read-only, Q1)", method: "POST", path: `/a2a/session/${AG}/message`, as: "aaron", body: { from: "aaron", content: "A5e" }, strict: 404, error: "session not found", what: /^non-member session=/, self: { path: `/a2a/session/${A}/message`, body: { from: "aaron", content: "A5e self" } } },
  { row: "A6a", desc: "read with reader != caller", method: "POST", path: `/a2a/session/${A}/read`, as: "qa-a1", body: { reader: "qa-a2", via: "inbox", upTo: 1 }, strict: 403, error: "reader is not the caller", what: /^reader=qa-a2$/ },
  { row: "A8", desc: "peer sessions of another name", method: "GET", path: "/a2a/peer/qa-a2/sessions", as: "qa-a1", strict: 403, error: "peerName is not the caller", what: /^peerName=qa-a2$/, self: { path: "/a2a/peer/qa-a1/sessions" } },
  { row: "A9", desc: "queue of another name", method: "GET", path: "/a2a/queue/qa-a2", as: "qa-a1", strict: 403, error: "agentId is not the caller", what: /^agentId=qa-a2$/, self: { path: "/a2a/queue/qa-a1" } },
  { row: "A13a", desc: "create without the caller", method: "POST", path: "/a2a/session", as: "qa-a1", body: { title: "A13a", participants: ["qa-a2", "qa-a3"], maxTurns: 4 }, strict: 403, error: "participants must include the caller", what: /^create-without-caller$/, self: { body: { title: "A13 self", participants: ["qa-a1", "qa-a2"], maxTurns: 4 } } },
  { row: "A13b", desc: "create with another owner's agent (O2)", method: "POST", path: "/a2a/session", as: "qa-a1", body: { title: "A13b", participants: ["qa-a1", "qa-b1"], maxTurns: 4 }, strict: 403, what: /^cross-owner participant=qa-b1$/ },
];
for (const c of cases) await caseRow(c);

// A6b: a non-member reader who is the caller: markRead's own answer, unchanged from c4d2d1c in both modes
{
  const body = { reader: "qa-b1", via: "inbox", upTo: 1 };
  const n = await withLog([H.nS], () => hub(H.nS, "POST", `/a2a/session/${A}/read`, { as: "qa-b1", body }));
  const o = await hub(H.onS, "POST", `/a2a/session/${A}/read`, { as: "qa-b1", body });
  check("A6b strict", "non-member reader: same code and text as c4d2d1c; logged as [authz]", { new: [n.res.status, n.res.text], old: [o.status, o.text], lines: n.lines.nS }, n.res.status === o.status && n.res.text === o.text && n.lines.nS.length === 1 && /^non-member session=/.test(n.lines.nS[0].what ?? ""));
  const fk = await hub(H.nS, "POST", `/a2a/session/${FAKE}/read`, { as: "qa-b1", body });
  check("A6b oracle (info)", "markRead: non-member vs nonexistent (unchanged behaviour; recorded)", { nonMember: [n.res.status, n.res.text], absent: [fk.status, fk.text] }, true);
}

// A10: heartbeat for another name refused, and the target's lastSeen does not move
{
  const seen = async (n) => (await cq(CVX.N, "agents:listOnline", {})).find((a) => a.name === n)?.lastSeen;
  const before = await seen("qa-a2"); await sleep(1100);
  const s = await withLog([H.nS], () => hub(H.nS, "POST", "/a2a/heartbeat/qa-a2", { as: "qa-a1", body: {} }));
  const after = await seen("qa-a2");
  check("A10 strict", "heartbeat for another name: 403; target lastSeen unmoved; one REJECT", { status: s.res.status, moved: after !== before, lines: s.lines.nS }, s.res.status === 403 && after === before && s.lines.nS.length === 1 && s.lines.nS[0].what === "agentId=qa-a2");
  const self = await hub(H.nS, "POST", "/a2a/heartbeat/qa-a1", { as: "qa-a1", body: {} });
  check("A10 self", "own heartbeat 200", { status: self.status }, self.status === 200);
  const w = await withLog([H.nW], () => hub(H.nW, "POST", "/a2a/heartbeat/qa-a2", { as: "qa-a1", body: {} }));
  const o = await hub(H.onW, "POST", "/a2a/heartbeat/qa-a2", { as: "qa-a1", body: {} });
  check("B1 A10", "warn heartbeat for another = old's answer; one WOULD REJECT", { new: w.res.status, old: o.status, lines: w.lines.nW }, same(w.res, o) && w.lines.nW.length === 1 && w.lines.nW[0].what === "agentId=qa-a2");
}

// A7 / E1-E3: the session lists (a filter in both modes, not a refusal)
{
  await beat();
  // By id, not title: a warn-mode rename (allowed in warn) changes titles.
  const label = { [S.Ain]: "A-in", [S.Aag]: "A-agents", [S.B]: "B-room" };
  const titles = async (base, as) => ((await hub(base, "GET", "/a2a/sessions", { as })).json?.sessions ?? []).map((s) => label[s._id]).filter(Boolean).sort();
  for (const base of [H.nS, H.nW]) {
    const mode = base === H.nS ? "strict" : "warn";
    const v = { a1: await titles(base, "qa-a1"), a3: await titles(base, "qa-a3"), b1: await titles(base, "qa-b1"), aaron: await titles(base, "aaron"), owner2: await titles(base, "qa-owner2") };
    check(`A7/E ${mode}`, "a1:[A-agents,A-in] a3:[] b1:[B-room] aaron:[A-agents,A-in] owner2:[B-room]", v,
      JSON.stringify(v) === JSON.stringify({ a1: ["A-agents", "A-in"], a3: [], b1: ["B-room"], aaron: ["A-agents", "A-in"], owner2: ["B-room"] }));
  }
  const g = async (as, id) => (await hub(H.nS, "GET", `/a2a/session/${id}/messages`, { as })).status;
  const e = { aaronAg: await g("aaron", AG), aaronB: await g("aaron", B), owner2B: await g("qa-owner2", B), owner2A: await g("qa-owner2", A), owner2Ag: await g("qa-owner2", AG), a3Ag: await g("qa-a3", AG) };
  check("E1-E3 strict", "aaron reads A-agents 200 and B 404; owner2 reads B 200, A and A-agents 404; qa-a3 404", e,
    e.aaronAg === 200 && e.aaronB === 404 && e.owner2B === 200 && e.owner2A === 404 && e.owner2Ag === 404 && e.a3Ag === 404);
  const reads = { aaronAg: (await hub(H.nS, "GET", `/a2a/session/${AG}/reads`, { as: "aaron" })).status, owner2B: (await hub(H.nS, "GET", `/a2a/session/${B}/reads`, { as: "qa-owner2" })).status };
  check("E1 reads", "owner view reads receipts of his agents' rooms", reads, reads.aaronAg === 200 && reads.owner2B === 200);
  // E3: an agent registering as kind human gains no view
  const r = await register(H.nW, "qa-h9", "human");
  const h9 = { reg: r.status, list: await titles(H.nS, "qa-h9"), ag: await g("qa-h9", AG), b: await g("qa-h9", B), owner: (await cq(CVX.N, "agents:getByName", { name: "qa-h9" }))?.owner };
  check("E3", "a self-declared human owns itself and sees nothing of A's or B's", h9, h9.reg === 200 && h9.list.length === 0 && h9.ag === 404 && h9.b === 404 && h9.owner === "qa-h9");
}

// E6 / O5: a register body cannot choose an owner
{
  const r = await register(H.nW, "qa-e6", "ide-session", { top: { owner: "qa-x" }, card: { owner: "qa-x" } });
  const owner = (await cq(CVX.N, "agents:getByName", { name: "qa-e6" }))?.owner;
  check("E6", "body owner (top level and in agentCard) ignored: owner = HUB_OWNER (aaron)", { reg: r.status, owner }, r.status === 200 && owner === "aaron");
}

// A14: agents/live filtered to the caller's owner (both modes); O1 unknown caller in warn
{
  await beat();
  const live = async (base, as) => ((await hub(base, "GET", "/a2a/agents/live", { as })).json?.agents ?? []).map((a) => a.name).filter((n) => /^qa-[ab]\d$/.test(n)).sort();
  for (const base of [H.nS, H.nW]) {
    const v = { a1: await live(base, "qa-a1"), b1: await live(base, "qa-b1"), aaron: await live(base, "aaron") };
    check(`A14 ${base === H.nS ? "strict" : "warn"}`, "A's key sees only A's agents; B's only B's", v,
      JSON.stringify(v.a1) === '["qa-a1","qa-a2","qa-a3"]' && JSON.stringify(v.b1) === '["qa-b1","qa-b2"]' && JSON.stringify(v.aaron) === '["qa-a1","qa-a2","qa-a3"]');
  }
}

// A18 / B2 (O1): an unknown key
{
  const probes = [["GET", "/a2a/sessions"], ["GET", "/a2a/agents/live"], ["GET", `/a2a/session/${A}/messages`], ["GET", "/a2a/queue/qa-a1"], ["POST", `/a2a/session/${A}/message`, { from: "qa-a1", content: "B2" }]];
  for (const [m, p, body] of probes) {
    const s = await withLog([H.nS], () => hub(H.nS, m, p, { rawKey: UNKNOWN, body }));
    check("A18", `unknown key in strict on ${m} ${p.replace(/k[0-9a-z]{31}/g, ":id")}: 403, no [authz] line`, { status: s.res.status, lines: s.lines.nS.length }, s.res.status === 403 && s.lines.nS.length === 0);
    const w = await withLog([H.nW], () => hub(H.nW, m, p, { rawKey: UNKNOWN, body }));
    const o = await hub(H.onW, m, p, { rawKey: UNKNOWN, body });
    const lines = w.lines.nW;
    check("B2", `unknown key in warn on ${m} ${p.replace(/k[0-9a-z]{31}/g, ":id")}: old's answer + caller=unknown line(s)`, { same: same(w.res, o), status: w.res.status, lines },
      same(w.res, o) && lines.length >= 1 && lines.every((l) => l.ok && l.caller === "unknown" && l.mode === "WOULD REJECT"));
  }
}
process.exitCode = summary(join(TMP, "rows-n1.results.txt")) ? 1 : 0;
