// Loop 6 rows A1-A16, B1-B4, E1-E4, G5b, X1, X2 (loop-6-qa-criteria.md) on the candidate's scratch stack:
// nW (warn) and nS (strict) on cvxN, seeded by seed6.mjs. Codes are never printed: each is remembered in
// QA_TMP/codes for K6 and added to the print guard. Needs E_FAKE_SESSION (a sessions id from ANOTHER
// scratch deployment, self-checked below) for E1.
// Usage: QA_TMP=... E_FAKE_SESSION=<id> node rows-a6.mjs
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { H, CVX, TREE, TMP, key, sha, P8, SECRETS, hub, register, issue, fakeCode, withLines, rows, setRow, check, summary, cm, sleep } from "./l6.mjs";

const T = { nocode: "this name is new and needs an enrollment code from its owner", expired: "this enrollment code is expired", used: "this enrollment code is already used",
  notvalid: "this enrollment code is not valid", human: "a register cannot create a human owner", agentIssue: "only a human owner can issue an enrollment code" };
const guard = (c) => { if (c && !SECRETS.includes(c)) SECRETS.push(c); return c; };
const counts = () => { const a = rows("agents"); const p = rows("peers"); return { agents: a.length, peers: p.length, humanPeers: p.filter((x) => x.type === "human").map((x) => x.name).sort() }; };
const codeRow = (c) => rows("enrollmentCodes").find((r) => r.codeHash === sha(c));
const agent = (n) => rows("agents").find((r) => r.name === n);
const body = (r) => r.json ?? r.text.slice(0, 120);
const enrollOf = (x, hubName) => x.enroll[hubName].filter((l) => !l.issue);
async function codeBy(base, as) { const r = await issue(base, as); return { r, code: guard(r.json?.code) }; }

// ---------------------------------------------------------------- A5 (0 codes) first: the uniformity baseline
setRow("A5");
const fake = guard(fakeCode());
const a5zero = await register(H.nS, "qa-a5-0", { code: fake });
const base0 = counts();

// ---------------------------------------------------------------- A1
setRow("A1");
{ const before = counts();
  const x = await withLines([H.nS], () => register(H.nS, "qa-a1"));
  const after = counts();
  check("A1", `strict new name, no code: 403 "${T.nocode}", no mutation`, { status: x.res.status, body: body(x.res), before, after, lines: enrollOf(x, "nS") },
    x.res.status === 403 && x.res.json?.error === T.nocode && after.agents === before.agents && after.peers === before.peers && !agent("qa-a1")); }

// ---------------------------------------------------------------- A12, A2, A8, A13
setRow("A12");
const t0 = Date.now();
const { r: i12, code: c2 } = await codeBy(H.nS, "aaron");
{ const row = c2 && codeRow(c2); const fields = row ? Object.values(row).map(String) : [];
  check("A12", "human issues: 200 {ok,code,expiresAt}, expiresAt = issue + 24h +/- 1 min, row holds the hash and no field equals the code",
    { status: i12.status, keys: i12.json && Object.keys(i12.json).sort(), expiresInH: i12.json && ((i12.json.expiresAt - t0) / 3600e3).toFixed(4), rowIssuer: row?.issuer, rowHasHash: !!row, anyFieldIsCode: fields.includes(c2) },
    i12.status === 200 && i12.json?.ok === true && typeof c2 === "string" && Math.abs(i12.json.expiresAt - (t0 + 24 * 3600e3)) < 60e3 + (Date.now() - t0) && row?.issuer === "aaron" && !fields.includes(c2)); }
setRow("A2");
{ const x = await withLines([H.nS], () => register(H.nS, "qa-a2", { code: c2, top: { owner: "qa-x" }, card: { owner: "qa-x" } }));
  const row = agent("qa-a2"); const cr = codeRow(c2);
  const who = await hub(H.nS, "GET", "/a2a/whoami", { as: "qa-a2" });
  check("A2", "strict valid code: 200; owner = issuer (aaron); code usedAt set; whoami is itself", { status: x.res.status, owner: row?.owner, usedAt: !!cr?.usedAt, whoami: who.json?.name, lines: x.enroll.nS },
    x.res.status === 200 && row?.owner === "aaron" && !!cr?.usedAt && who.json?.name === "qa-a2");
  check("A8", "body owner (top level and in agentCard) ignored: owner = issuer", { owner: row?.owner }, row?.owner === "aaron");
  check("A13", "a code is not bound to a name: an arbitrary new name spent it (as ruled, O2)", { name: "qa-a2", status: x.res.status }, x.res.status === 200); }

// ---------------------------------------------------------------- A3
setRow("A3");
{ const u0 = codeRow(c2)?.usedAt;
  const x = await withLines([H.nS], () => register(H.nS, "qa-a3", { code: c2 }));
  check("A3", `same code again: 403 "${T.used}", no row, usedAt unchanged`, { status: x.res.status, body: body(x.res), row: !!agent("qa-a3"), usedAtSame: codeRow(c2)?.usedAt === u0, lines: enrollOf(x, "nS") },
    x.res.status === 403 && x.res.json?.error === T.used && !agent("qa-a3") && codeRow(c2)?.usedAt === u0); }

// ---------------------------------------------------------------- A4 (expired: scratch rewrite of expiresAt, O3 as ruled)
setRow("A4");
const { code: c4 } = await codeBy(H.nS, "aaron");
function expireOnScratch(code) {
  const all = rows("enrollmentCodes");
  const t = all.map((r) => { const { _id, _creationTime, ...rest } = r; return r.codeHash === sha(code) ? { ...rest, expiresAt: Date.now() - 1000 } : rest; });
  const f = join(TMP, "enrollmentCodes-rewrite.jsonl"); writeFileSync(f, t.map((r) => JSON.stringify(r)).join("\n") + "\n");
  execFileSync(process.execPath, ["node_modules/convex/bin/main.js", "import", "--table", "enrollmentCodes", "--replace", "-y", f], { cwd: TREE.cand, env: { ...process.env, CONVEX_AGENT_MODE: "anonymous" }, stdio: ["ignore", "pipe", "pipe"] });
  return rows("enrollmentCodes").length === all.length;
}
{ const kept = expireOnScratch(c4); const cr = codeRow(c4);
  const x = await withLines([H.nS], () => register(H.nS, "qa-a4", { code: c4 }));
  check("A4", `expired code: 403 "${T.expired}", no row, code not marked used`, { rewriteKeptRows: kept, expiredNow: cr && cr.expiresAt < Date.now(), status: x.res.status, body: body(x.res), row: !!agent("qa-a4"), usedAt: codeRow(c4)?.usedAt ?? null, lines: enrollOf(x, "nS") },
    kept && x.res.status === 403 && x.res.json?.error === T.expired && !agent("qa-a4") && codeRow(c4)?.usedAt === undefined); }

// ---------------------------------------------------------------- A5 uniformity (0 codes / an unused one / a used one)
setRow("A5");
const { code: cUnused } = await codeBy(H.nS, "aaron");
const a5one = await register(H.nS, "qa-a5-1", { code: guard(fakeCode()) });
check("A5", `never-issued code: 403 "${T.notvalid}"; byte-identical with 0 codes, with codes (used, unused, expired) present`,
  { zero: [a5zero.status, a5zero.text], withCodes: [a5one.status, a5one.text], base0Agents: base0.agents },
  a5zero.status === 403 && a5zero.json?.error === T.notvalid && a5one.status === a5zero.status && a5one.text === a5zero.text);

// ---------------------------------------------------------------- A6 (second owner)
setRow("A6");
{ const { code: c6 } = await codeBy(H.nS, "qa-owner2");
  const r = await register(H.nS, "qa-a6", { code: c6 });
  const s = await hub(H.nS, "POST", "/a2a/session", { as: "qa-a6", body: { title: "A6 room", participants: ["qa-a6", "qa-owner2"], maxTurns: 6 } });
  const sid = s.json?.sessionId;
  const la = await hub(H.nS, "GET", "/a2a/sessions", { as: "aaron" }); const l2 = await hub(H.nS, "GET", "/a2a/sessions", { as: "qa-owner2" });
  const has = (l) => (l.json?.sessions ?? []).some((x) => (x._id ?? x.id ?? x.sessionId) === sid);
  check("A6", "code from qa-owner2 (createHuman): owner qa-owner2; aaron's view does not list the row's room, qa-owner2's does",
    { register: r.status, owner: agent("qa-a6")?.owner, session: s.status, aaronSees: has(la), owner2Sees: has(l2) },
    r.status === 200 && agent("qa-a6")?.owner === "qa-owner2" && !!sid && !has(la) && has(l2)); }

// ---------------------------------------------------------------- A7 (+ G5b's issue), both modes
setRow("A7");
for (const [hubName, base] of [["strict", H.nS], ["warn", H.nW]]) {
  const n0 = rows("enrollmentCodes").length;
  const ag = await issue(base, "grok"); const o0 = await issue(base, "qa-owner0");
  const unk = await hub(base, "POST", "/a2a/enroll", { rawKey: "qa6-unknown-" + "0".repeat(40), body: {} });
  const n1 = rows("enrollmentCodes").length;
  check(`A7 ${hubName}`, `agent key, no-kind owner row, unknown key: 403 "${T.agentIssue}" (unknown key in strict: the guard's 403); no code row written`,
    { agent: [ag.status, body(ag)], owner0: [o0.status, body(o0)], unknown: [unk.status, body(unk)], codeRows: [n0, n1] },
    ag.status === 403 && ag.json?.error === T.agentIssue && o0.status === 403 && o0.json?.error === T.agentIssue && unk.status === 403 && n1 === n0 && !ag.json?.code && !o0.json?.code && !unk.json?.code);
}

// ---------------------------------------------------------------- A9, A10 (strict)
setRow("A9");
{ const { code: c9 } = await codeBy(H.nS, "aaron");
  const x = await withLines([H.nS], () => register(H.nS, "qa-a9", { code: c9, kind: "human" }));
  const y = await withLines([H.nS], () => register(H.nS, "qa-a9b", { kind: "human" }));
  check("A9", `new name + kind human: 403 "${T.human}" with a valid code (code not consumed, no row); codeless: which text wins is recorded`,
    { withCode: [x.res.status, body(x.res)], codeUsed: !!codeRow(c9)?.usedAt, rows: [!!agent("qa-a9"), !!agent("qa-a9b")], codeless: [y.res.status, body(y.res)], lines: [...enrollOf(x, "nS"), ...enrollOf(y, "nS")] },
    x.res.status === 403 && x.res.json?.error === T.human && !codeRow(c9)?.usedAt && !agent("qa-a9") && !agent("qa-a9b") && y.res.status === 403);
  // the unconsumed code still enrolls (A15's second half, strict)
  const z = await register(H.nS, "qa-a9c", { code: c9 });
  check("A9 code intact", "the code refused with kind human still enrolls a plain new name", { status: z.status, owner: agent("qa-a9c")?.owner }, z.status === 200 && agent("qa-a9c")?.owner === "aaron"); }
setRow("A10");
{ const before = agent("grok");
  const x = await withLines([H.nS], () => register(H.nS, "grok", { kind: "human" }));
  const after = agent("grok"); const e = await issue(H.nS, "grok");
  check("A10", "existing non-human row + kind human, strict: 403; stored agentCard unchanged; enroll still 403",
    { status: x.res.status, body: body(x.res), cardSame: JSON.stringify(after?.agentCard) === JSON.stringify(before?.agentCard), enroll: e.status, lines: enrollOf(x, "nS") },
    x.res.status === 403 && x.res.json?.error === T.human && JSON.stringify(after?.agentCard) === JSON.stringify(before?.agentCard) && e.status === 403); }

// ---------------------------------------------------------------- A14 (concurrent double spend, 10 runs)
setRow("A14");
{ const res = [];
  for (let i = 0; i < 10; i++) {
    const { code } = await codeBy(H.nS, "aaron");
    const [p, q] = await Promise.all([register(H.nS, `qa-a14-${i}a`, { code }), register(H.nS, `qa-a14-${i}b`, { code })]);
    const made = [agent(`qa-a14-${i}a`), agent(`qa-a14-${i}b`)].filter(Boolean).length;
    res.push({ s: [p.status, q.status].sort().join("/"), usedErr: [p, q].filter((r) => r.json?.error === T.used).length, made });
  }
  check("A14", "10 races of one code for two names: exactly one 200 and one used-403, one new row, 10 of 10", res,
    res.every((r) => r.s === "200/403" && r.usedErr === 1 && r.made === 1)); }

// ---------------------------------------------------------------- A15 (a failed insert does not consume)
setRow("A15");
{ const { code } = await codeBy(H.nS, "aaron");
  const same = await register(H.nS, "atlas", { code });                               // existing name, its own key: same
  const u1 = !!codeRow(code)?.usedAt;
  const clash = await register(H.nS, "relay", { code, apiKey: key("qa-a15-otherkey") }); // owned name, new key: 409
  const u2 = !!codeRow(code)?.usedAt;
  const fresh = await register(H.nS, "qa-a15", { code });
  check("A15", "valid code on a same-register (200) and on an owned name with a new key (409) stays unused; then enrolls a new name",
    { same: same.status, usedAfterSame: u1, clash: [clash.status, body(clash)], usedAfterClash: u2, fresh: fresh.status, freshOwner: agent("qa-a15")?.owner },
    same.status === 200 && !u1 && clash.status === 409 && !u2 && fresh.status === 200 && agent("qa-a15")?.owner === "aaron"); }

// ---------------------------------------------------------------- A16 (texts)
setRow("A16");
{ const ts = [T.nocode, T.expired, T.used, T.notvalid];
  const leak = ts.filter((t) => /qa-|aaron|grok|\d/.test(t));
  check("A16", "no-code, expired, used, not-valid are four distinct strings with no name, code, hash or count", { texts: ts, leak },
    new Set(ts).size === 4 && leak.length === 0); }

// ---------------------------------------------------------------- A11
setRow("A11");
{ const now = counts().humanPeers;
  check("A11", "human peers = the seed's (aaron, qa-owner2) after every A row: no register made a human", { before: base0.humanPeers, now }, JSON.stringify(now) === JSON.stringify(base0.humanPeers)); }

// ---------------------------------------------------------------- B (warn) and B4 (strict lines)
setRow("B1");
const wantWarn = (x, what) => { const l = enrollOf(x, "nW"); return l.length === 1 && l[0].ok && l[0].mode === "WOULD REJECT" && l[0].what === what && l[0].warnTail && !l[0].bad32; };
{ const { code: cU } = await codeBy(H.nW, "aaron"); await register(H.nW, "qa-b-used0", { code: cU }); // spend it
  const { code: cE } = await codeBy(H.nW, "aaron"); expireOnScratch(cE);
  const { code: cH } = await codeBy(H.nW, "aaron");
  const cases = [
    ["no-code", () => register(H.nW, "qa-b1")],
    ["used", () => register(H.nW, "qa-b2", { code: cU })],
    ["expired", () => register(H.nW, "qa-b3", { code: cE })],
    ["not-valid", () => register(H.nW, "qa-b4", { code: guard(fakeCode()) })],
    ["kind=human", () => register(H.nW, "qa-b5", { code: cH, kind: "human" })],
  ];
  const out = [];
  for (const [what, fn] of cases) { const x = await withLines([H.nW], fn); out.push({ what, status: x.res.status, lines: enrollOf(x, "nW"), ok: x.res.status === 200 && wantWarn(x, what) }); }
  check("B1", "warn: each of no-code, used, expired, not-valid, kind=human registers 200 and logs exactly one parsed [enroll] WOULD REJECT <what>", out, out.every((o) => o.ok));
  setRow("B2");
  const own = ["qa-b1", "qa-b3", "qa-b4"].map((n) => [n, agent(n)?.owner]);
  check("B2", "codeless / bad-code warn inserts get owner HUB_OWNER (aaron); the used and expired codes are unchanged (not re-consumed / not consumed)",
    { own, expiredUsedAt: codeRow(cE)?.usedAt ?? null, usedCodeUsedAt: !!codeRow(cU)?.usedAt },
    own.every(([, o]) => o === "aaron") && codeRow(cE)?.usedAt === undefined && !!codeRow(cU)?.usedAt);
  setRow("B3");
  const b5 = agent("qa-b5");
  const w10 = await withLines([H.nW], () => register(H.nW, "atlas", { kind: "human" }));
  const atlas = agent("atlas");
  const e1 = await issue(H.nW, "qa-b5"), e2 = await issue(H.nW, "atlas");
  check("B3", "warn does not persist a human: qa-b5 (new, kind human) and atlas (existing, kind human) are stored without kind human, and their enroll is 403 agent-issue",
    { b5kind: b5?.agentCard?.kind ?? null, b5owner: b5?.owner, atlasRegister: w10.res.status, atlasLines: enrollOf(w10, "nW"), atlasKind: atlas?.agentCard?.kind ?? null, enroll: [e1.status, e2.status] },
    b5 && b5.agentCard?.kind !== "human" && w10.res.status === 200 && atlas?.agentCard?.kind !== "human" && e1.status === 403 && e2.status === 403 && e1.json?.error === T.agentIssue); }

// ---------------------------------------------------------------- E1-E4 (T-070)
setRow("E");
{ const s = await hub(H.nS, "POST", "/a2a/session", { as: "a2a-grok", body: { title: "E room", participants: ["a2a-grok", "cursor-grok"], maxTurns: 6 } });
  const sid = s.json?.sessionId;
  await hub(H.nS, "POST", `/a2a/session/${sid}/message`, { as: "a2a-grok", body: { from: "a2a-grok", content: "E seed" } });
  const FAKE = process.env.E_FAKE_SESSION; const rb = { reader: "grokbot", throughTurn: 1, via: "inbox" };
  const snap = () => JSON.stringify(rows("sessionPeers").map(({ _creationTime, ...r }) => r).sort((x, y) => String(x._id).localeCompare(String(y._id))));
  const cur0 = snap();
  const nm = await hub(H.nS, "POST", `/a2a/session/${sid}/read`, { as: "grokbot", body: rb });
  const ab = await hub(H.nS, "POST", `/a2a/session/${FAKE}/read`, { as: "grokbot", body: rb });
  check("E1", "strict /read: non-member and a well-formed nonexistent id (sessions id from another deployment) are byte-identical 404 session not found",
    { session: s.status, nonMember: [nm.status, nm.text], absent: [ab.status, ab.text] }, !!sid && nm.status === 404 && nm.json?.error === "session not found" && ab.status === nm.status && ab.text === nm.text);
  const cur1 = snap();
  check("E2", "the non-member's strict call writes no read cursor (sessionPeers unchanged)", { sessionPeersUnchanged: cur1 === cur0 }, cur1 === cur0);
  const m1 = await hub(H.nS, "POST", "/a2a/session/not-an-id/read", { as: "grokbot", body: rb });
  const m2 = await hub(H.nS, "POST", "/a2a/session/not-an-id/read", { as: "a2a-grok", body: { ...rb, reader: "a2a-grok" } });
  check("E3", "malformed id: 400 not a session id for non-member and member alike", { nonMember: [m1.status, m1.text], member: [m2.status, m2.text] }, m1.status === 400 && m1.json?.error === "not a session id" && m1.text === m2.text);
  const w = await withLines([H.nW], () => hub(H.nW, "POST", `/a2a/session/${sid}/read`, { as: "grokbot", body: rb }));
  check("E4", "warn: the non-member still gets markRead's participant reason, and the [authz] note is logged", { status: w.res.status, body: body(w.res), authz: w.authz.nW },
    w.res.status === 404 && /not a participant/.test(w.res.json?.error ?? "") && w.authz.nW.length >= 1); }

// ---------------------------------------------------------------- G5b (qa-owner0: owner row, no kind)
setRow("G5b");
{ const before = agent("qa-owner0");
  const rr = await register(H.nS, "qa-owner0", { kind: null });
  const hs = await register(H.nS, "qa-owner0", { kind: "human" });
  const hw = await register(H.nW, "qa-owner0", { kind: "human" });
  const after = agent("qa-owner0");
  const s = await hub(H.nS, "POST", "/a2a/session", { as: "qa-o0-agent", body: { title: "G5b room", participants: ["qa-o0-agent", "qa-owner0"], maxTurns: 4 } });
  const s2 = await hub(H.nW, "POST", "/a2a/session", { as: "qa-o0-agent", body: { title: "G5b agent-only", participants: ["qa-o0-agent", "grokbot"], maxTurns: 4 } });
  const ls = await hub(H.nS, "GET", "/a2a/sessions", { as: "qa-owner0" });
  const ids = (ls.json?.sessions ?? []).map((x) => x._id ?? x.id ?? x.sessionId);
  check("G5b", "no-kind owner row: re-registers codeless 200; kind human 403 strict / stripped in warn; still no kind; no owner's view (does not see its agent's room without it)",
    { reRegister: rr.status, humanStrict: [hs.status, body(hs)], humanWarn: hw.status, kindAfter: after?.agentCard?.kind ?? null, hashSame: after?.apiKeyHash === before?.apiKeyHash, ownerRoom: s.status, agentOnlyRoom: s2.status, seesOwn: ids.includes(s.json?.sessionId), seesAgentOnly: ids.includes(s2.json?.sessionId) },
    rr.status === 200 && hs.status === 403 && hs.json?.error === T.human && hw.status === 200 && after?.agentCard?.kind === undefined && after?.apiKeyHash === before?.apiKeyHash && ids.includes(s.json?.sessionId) && s2.json?.sessionId && !ids.includes(s2.json.sessionId)); }

// ---------------------------------------------------------------- X1, X2 (observations; do not gate)
setRow("X");
{ let x1a, x1b, x2 = {};
  try { x1a = await cm(CVX.N, "agents:registerAgent", { name: "qa-x1", apiKeyHash: sha(key("qa-x1")), agentCard: { name: "qa-x1", description: "x1" }, strict: false, owner: "qa-x1-chosen" }); } catch (e) { x1a = { error: String(e.message).slice(0, 120) }; }
  try { x1b = await cm(CVX.N, "agents:registerAgent", { name: "melve-76", apiKeyHash: sha(key("melve-76")), agentCard: { name: "melve-76", description: "x", kind: "human" }, strict: true }); } catch (e) { x1b = { error: String(e.message).slice(0, 120) }; }
  const x1row = agent("qa-x1"), m76 = agent("melve-76");
  check("X1 (observation)", "direct Convex registerAgent: new name without a code, and kind human on an existing agent", { codeless: x1a, inserted: !!x1row, owner: x1row?.owner, humanOnAgent: x1b, m76kind: m76?.agentCard?.kind ?? null }, true);
  for (const issuer of ["aaron", "grok", "qa-no-such-name"]) {
    const code = guard(fakeCode());
    try { await cm(CVX.N, "agents:issueEnrollmentCode", { codeHash: sha(code), issuer, expiresAt: Date.now() + 3600e3 }); } catch (e) { x2[issuer] = { mint: String(e.message).slice(0, 80) }; continue; }
    const nm = `qa-x2-${issuer.replace(/[^a-z0-9]/g, "")}`;
    const r = await register(H.nS, nm, { code });
    x2[issuer] = { minted: true, enrollStrict: r.status, owner: agent(nm)?.owner ?? null };
  }
  check("X2 (observation)", "direct Convex issueEnrollmentCode: which issuers a minted code can claim through the strict hub", x2, true); }

const f = summary(join(TMP, "rows-a6.results.txt"));
process.exitCode = f ? 1 : 0;
