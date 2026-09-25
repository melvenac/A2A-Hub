// Loop 3 rows, part B (loop-3-qa-criteria.md): MIG, REL, H1 (before the hub restart), H2, H3.1, H3.3.
// QA_TMP=<run dir> node rows-b.mjs
import {
  H, CVX, CAND, OLD, sha, P8, DEV, newKey, shortKey, name, register, hub, cq, cm, q, data, run,
  seedLegacy, hubTalk, hubKey, keyOf, logCount, keyShaped, check, report, finish,
} from "./l3.mjs";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const rowsOf = (n) => data("agents").filter((r) => r.name === n);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** A room between a legacy seat (warn lets its key through, unattributed) and a normal one, with turns and a mark. */
async function roomWithHistory(legacy, legacyKey, other, otherKey) {
  const sid = (await hub(H.W, "POST", "/a2a/session", { key: otherKey, body: { title: `qa-${legacy}`, participants: [legacy, other], maxTurns: 500 } })).json.sessionId;
  await hub(H.W, "POST", `/a2a/session/${sid}/message`, { key: legacyKey, body: { from: legacy, content: "history t1" } });
  await hub(H.W, "POST", `/a2a/session/${sid}/message`, { key: otherKey, body: { from: other, content: "history t2" } });
  await hub(H.W, "POST", `/a2a/session/${sid}/read`, { key: legacyKey, body: { reader: legacy, throughTurn: 1, via: "wait" } });
  return sid;
}
/** Every row involving `n` and its room, whole rows (REL's snapshot). */
function snapshot(n, sid) {
  const peers = data("peers").filter((p) => p.name === n);
  const sessions = data("sessions").filter((s) => s._id === sid);
  const sessionPeers = data("sessionPeers").filter((s) => s.sessionId === sid);
  const messages = data("messages").filter((m) => m.sessionId === sid);
  return { peers, sessions, sessionPeers, messages, counts: [peers.length, sessions.length, sessionPeers.length, messages.length] };
}
// Every other agents row. The one change REL.4 requires (§1.1: a co-holder of the released hash with no
// status is stamped legacy) is folded in, so any OTHER change still shows up.
const others = (n, coHash) => data("agents").filter((r) => r.name !== n)
  .map((r) => JSON.stringify(r.apiKeyHash === coHash && r.keyStatus === "legacy" ? { ...r, keyStatus: undefined } : r)).sort();
const markOf = async (sid, reader, key) => (await hub(H.W, "GET", `/a2a/session/${sid}/reads`, { key })).json?.participants?.find((p) => p.name === reader)?.lastRead?.turn ?? null;

/** Polls listOnline for rows named `n` until stop(); records the min and max count seen. */
function poller(n) {
  let stop = false, min = Infinity, max = 0, polls = 0;
  const done = (async () => {
    while (!stop) {
      const r = await cq(CVX.A, "agents:listOnline", {});
      if (r.ok) { const c = r.value.filter((x) => x.name === n).length; min = Math.min(min, c); max = Math.max(max, c); polls++; }
    }
  })();
  return { stop: async () => { stop = true; await done; return { min, max, polls }; } };
}

// ================================================================ MIG
{
  const [mg, mg2, mx] = ["mig", "mig2", "migx"].map(name); const sm = shortKey("mig"); const kx = newKey();
  const policy = { allow: [mx] };
  seedLegacy([mg, mg2], sm, { [mg]: { askPolicy: policy } });
  await register(H.W, mx, kx);
  const sid = await roomWithHistory(mg, sm, mx, kx);
  const row0 = rowsOf(mg)[0];
  check("MIG.P8", "seed: one legacy row with askPolicy, no keyStatus; room has 2 turns and a mark for it", { rows: rowsOf(mg).length, status: row0?.keyStatus ?? "none", policy: !!row0?.askPolicy, mark: await markOf(sid, mg, kx) },
    rowsOf(mg).length === 1 && row0.keyStatus === undefined && eq(row0.askPolicy, policy) && (await markOf(sid, mg, kx)) === 1);
  const snap0 = snapshot(mg, sid);
  // 1. poller known positive: a two-act replacement (release, then a separate --init-key) on a control name
  const [c1, c2] = ["migc", "migc2"].map(name); const sc = shortKey("migc"); seedLegacy([c1, c2], sc);
  let p = poller(c1);
  await new Promise((r) => setTimeout(r, 300));
  run("agents:release", { name: c1 });
  await new Promise((r) => setTimeout(r, 500));
  await hubTalk(["--as", c1, "--init-key"], { hub: H.W });
  await new Promise((r) => setTimeout(r, 300));
  const kp = await p.stop();
  check("MIG.1", "poller known positive: across a two-act replacement it sees the zero-row gap", kp, kp.min === 0 && kp.polls > 10);
  // 2. the migration itself
  const mig0 = logCount("hubW", new RegExp(`MIGRATE ${mg}: legacy row replaced by a fresh owned row`));
  const t0 = Date.now();
  p = poller(mg);
  await new Promise((r) => setTimeout(r, 300));
  const ik = await hubTalk(["--as", mg, "--init-key"], { hub: H.W });
  await new Promise((r) => setTimeout(r, 300));
  const pp = await p.stop();
  const rows = rowsOf(mg), km = keyOf(mg, H.W);
  check("MIG.2", "--init-key with the poller running: never 0, never 2 rows; after: exactly one owned row, new _id, old _id gone, MIGRATE logged",
    { code: ik.code, poller: pp, rows: rows.length, status: rows[0]?.keyStatus, newId: rows[0]?._id !== row0._id, oldIdGone: !data("agents").some((r) => r._id === row0._id), migrateLines: logCount("hubW", new RegExp(`MIGRATE ${mg}: legacy row replaced by a fresh owned row`)) - mig0 },
    ik.code === 0 && pp.min === 1 && pp.max === 1 && pp.polls > 10 && rows.length === 1 && rows[0].keyStatus === "owned" && rows[0]._id !== row0._id
    && !data("agents").some((r) => r._id === row0._id) && logCount("hubW", new RegExp(`MIGRATE ${mg}: legacy row replaced by a fresh owned row`)) > mig0);
  check("MIG.3", "the fresh row keeps nothing: no askPolicy (present before); lease is the new instance's", { askPolicy: rows[0]?.askPolicy ?? "none", lease: !!rows[0]?.activeInstanceId, hbAfterAct: (rows[0]?.lastHeartbeatAt ?? 0) >= t0 },
    rows[0]?.askPolicy === undefined && !!rows[0]?.activeInstanceId && rows[0]?.lastHeartbeatAt >= t0);
  const snap1 = snapshot(mg, sid);
  check("MIG.4", "peers row, session, sessionPeers and messages of its room deep-equal; mig2 legacy (stamped, not promoted); sm resolves to no name",
    { counts: [snap0.counts, snap1.counts], equal: eq(snap0, snap1), mig2: rowsOf(mg2)[0]?.keyStatus, sm: (await cq(CVX.A, "agents:getByKeyHash", { apiKeyHash: sha(sm) })).value },
    eq(snap0, snap1) && rowsOf(mg2)[0]?.keyStatus === "legacy" && (await cq(CVX.A, "agents:getByKeyHash", { apiKeyHash: sha(sm) })).value === null);
  await hub(H.W, "POST", `/a2a/session/${sid}/message`, { key: kx, body: { from: mx, content: "t3 after migration" } });
  const ib = await hubTalk(["--as", mg, "--session", sid, "--inbox"], { hub: H.W });
  check("MIG.5", "the room still works: --inbox exits 0 and the mark moves to the last turn", { code: ib.code, mark: await markOf(sid, mg, kx) }, ib.code === 0 && (await markOf(sid, mg, kx)) === 3);
}

// ================================================================ REL
{
  const [rl, rl2, rx] = ["rel", "rel2", "relx"].map(name); const sr = shortKey("rel"); const kx = newKey();
  seedLegacy([rl, rl2], sr); await register(H.W, rx, kx);
  const sid = await roomWithHistory(rl, sr, rx, kx);
  const s0 = snapshot(rl, sid), o0 = others(rl, sha(sr));
  check("REL.known-positive", "the snapshot sees non-zero counts in every table", s0.counts, s0.counts.every((c) => c > 0));
  const out = run("agents:release", { name: rl });
  const s1 = snapshot(rl, sid);
  check("REL.3", "release: agents rows 1 -> 0; peers, session, sessionPeers, messages deep-equal with the same counts; no other agents row changed",
    { release: out.value, agents: [1, rowsOf(rl).length], counts: [s0.counts, s1.counts], equal: eq(s0, s1), othersUnchangedExceptStamp: eq(o0, others(rl, sha(sr))) },
    out.ok && rowsOf(rl).length === 0 && eq(s0, s1) && eq(o0, others(rl, sha(sr))));
  check("REL.4", "stamping: rel2 reads legacy; sr resolves to no name on both hubs", { rel2: rowsOf(rl2)[0]?.keyStatus, W: (await hub(H.W, "GET", "/a2a/whoami", { key: sr })).json?.name ?? null, S: (await hub(H.S, "GET", "/a2a/whoami", { key: sr })).status },
    rowsOf(rl2)[0]?.keyStatus === "legacy" && (await hub(H.W, "GET", "/a2a/whoami", { key: sr })).json?.name === null && (await hub(H.S, "GET", "/a2a/whoami", { key: sr })).status === 403);
  const before5 = JSON.stringify(data("agents"));
  const pub = await cm(CVX.A, "agents:release", { name: rl2 });
  const none = run("agents:release", { name: name("nobody") });
  check("REL.5", "release is admin-only: a public call is refused and changes nothing; releasing an unknown name changes nothing",
    { publicRefused: !pub.ok, unknown: none.value, unchanged: before5 === JSON.stringify(data("agents")) }, !pub.ok && none.ok && before5 === JSON.stringify(data("agents")));
  // 7 (report only) before the fresh --init-key: the ea9d057 client (dev-key) on the released name
  const old = await hubTalk(["--as", rl, "--session", sid, "--say", "old client on a released name"], { tree: OLD, hub: H.W });
  const landed = data("messages").some((m) => m.sessionId === sid && m.content === "old client on a released name");
  report("REL.7", `ea9d057 hub-talk (dev-key) on the released name: exit ${old.code}; its turn ${landed ? "was delivered" : "was NOT delivered"}; agents rows for the name afterwards: ${rowsOf(rl).length}; listed in /a2a/agents/live: ${JSON.stringify(((await hub(H.W, "GET", "/a2a/agents/live", { key: kx })).json?.agents ?? []).some((a) => a.name === rl))}. Design §4.3 rev 3 expects: register refused, talks unattributed, missing from agents/live.`);
  const pr0 = data("peers").find((p) => p.name === rl);
  const ik = await hubTalk(["--as", rl, "--init-key"], { hub: H.W });
  const kr = keyOf(rl, H.W); const rows = rowsOf(rl); const pr1 = data("peers").find((p) => p.name === rl);
  const printed = (ik.stderr.match(/prefix ([0-9a-f]{8})/) || [])[1];
  check("REL.6a", "fresh --init-key: exit 0, inserted owned, prefix = printed, key resolves; peers row same _id and type",
    { code: ik.code, rows: rows.length, status: rows[0]?.keyStatus, printedMatches: printed === P8(kr), who: (await hub(H.W, "GET", "/a2a/whoami", { key: kr })).json?.name, peerSameId: pr0?._id === pr1?._id, type: pr1?.type },
    ik.code === 0 && rows.length === 1 && rows[0].keyStatus === "owned" && printed === P8(kr) && (await hub(H.W, "GET", "/a2a/whoami", { key: kr })).json?.name === rl && pr0?._id === pr1?._id && pr1?.type === pr0?.type);
  await hub(H.W, "POST", `/a2a/session/${sid}/message`, { key: kx, body: { from: rx, content: "after re-registration" } });
  const turns = data("messages").filter((m) => m.sessionId === sid).length;
  const ib = await hubTalk(["--as", rl, "--session", sid, "--inbox"], { hub: H.W });
  check("REL.6b", "the old room: --inbox exits 0 and the mark moves to the last turn", { code: ib.code, mark: await markOf(sid, rl, kx), turns }, ib.code === 0 && (await markOf(sid, rl, kx)) === turns);
}

// ================================================================ H1 (before restart), H2, H3.1, H3.3
{
  const peerType = async (n) => (await cq(CVX.A, "peers:getByName", { name: n })).value?.type ?? null;
  check("H1.1", "hub startup/notification registers aaron as human (known positive: the instrument reads the type)", await peerType("aaron"), (await peerType("aaron")) === "human");
  const ik = await hubKey(["init", "--as", "aaron", "--kind", "human", "--register", "--hub", H.W], { hub: H.W });
  const ka = keyOf("aaron", H.W); const ar = rowsOf("aaron");
  check("H1.2a", "hub-key init --as aaron --kind human --register: exit 0; peers type still human", { code: ik.code, type: await peerType("aaron"), shaped: keyShaped(ik.stdout + ik.stderr) }, ik.code === 0 && (await peerType("aaron")) === "human" && !keyShaped(ik.stdout + ik.stderr));
  check("H2", "aaron: exactly one agents row, owned, agentCard.kind human; its key resolves to aaron", { rows: ar.length, status: ar[0]?.keyStatus, kind: ar[0]?.agentCard?.kind, who: (await hub(H.W, "GET", "/a2a/whoami", { key: ka })).json?.name },
    ar.length === 1 && ar[0].keyStatus === "owned" && ar[0].agentCard?.kind === "human" && (await hub(H.W, "GET", "/a2a/whoami", { key: ka })).json?.name === "aaron");
  const r2 = await register(H.W, "aaron", ka, { name: "aaron", kind: "human" });
  check("H1.2b", "a second register with aaron's own key: 200, type still human", { status: r2.status, type: await peerType("aaron") }, r2.status === 200 && (await peerType("aaron")) === "human");
  const hn = name("human"); const kh = newKey();
  await cm(CVX.A, "peers:register", { name: hn, type: "human", metadata: { qa: "keep-me" } });
  const m0 = data("peers").find((p) => p.name === hn)?.metadata;
  const rh = await register(H.W, hn, kh, { name: hn, kind: "ide-session" });
  const ph = data("peers").find((p) => p.name === hn);
  const [na, nh] = ["newagent", "newhuman"].map(name);
  await register(H.W, na, newKey(), { name: na, kind: "ide-session" }); await register(H.W, nh, newKey(), { name: nh, kind: "human" });
  check("H1.3", "an agent registering an existing human peer's name: type stays human, metadata unchanged; both directions: new ide-session -> agent, new human -> human",
    { reg: rh.status, type: ph?.type, metadataSame: eq(m0, ph?.metadata), newAgent: await peerType(na), newHuman: await peerType(nh) },
    rh.status === 200 && ph?.type === "human" && eq(m0, ph?.metadata) && (await peerType(na)) === "agent" && (await peerType(nh)) === "human");
  const hash0 = rowsOf("aaron")[0]?.apiKeyHash;
  const r4 = await register(H.W, "aaron", newKey(), { name: "aaron", kind: "ide-session" });
  check("H1.4", "an agent cannot re-register aaron: 409 (C7); type and stored hash unchanged", { status: r4.status, type: await peerType("aaron"), hashSame: rowsOf("aaron")[0]?.apiKeyHash === hash0 },
    r4.status === 409 && (await peerType("aaron")) === "human" && rowsOf("aaron")[0]?.apiKeyHash === hash0);
  const rot = await hubKey(["rotate", "--as", "aaron", "--hub", H.W], { hub: H.W });
  const ka2 = keyOf("aaron", H.W);
  check("H2.rotate", "rotate applies to aaron like any row: hub-key rotate exit 0; new key resolves to aaron, old key does not; output carries no key",
    { code: rot.code, newWho: (await hub(H.W, "GET", "/a2a/whoami", { key: ka2 })).json?.name, oldWho: (await hub(H.W, "GET", "/a2a/whoami", { key: ka })).json?.name ?? null, shaped: keyShaped(rot.stdout + rot.stderr) },
    rot.code === 0 && ka2 !== ka && (await hub(H.W, "GET", "/a2a/whoami", { key: ka2 })).json?.name === "aaron" && (await hub(H.W, "GET", "/a2a/whoami", { key: ka })).json?.name == null && !keyShaped(rot.stdout + rot.stderr));
  const live = name("liveagent"); const kl = newKey(); await register(H.W, live, kl);
  const lo = (await q(CVX.A, "agents:listOnline")).map((r) => r.name);
  const al = ((await hub(H.W, "GET", "/a2a/agents/live", { key: kl })).json?.agents ?? []).map((a) => a.name);
  check("H3.1", "listOnline and /a2a/agents/live leave out aaron; known positive: a qa- agent registered now is listed",
    { listOnline: { aaron: lo.includes("aaron"), live: lo.includes(live) }, agentsLive: { aaron: al.includes("aaron"), live: al.includes(live) } },
    !lo.includes("aaron") && lo.includes(live) && !al.includes("aaron") && al.includes(live));
  const old = ((await hub(H.OW, "GET", "/a2a/agents/live", { key: kl })).json?.agents ?? []).map((a) => a.name);
  check("H3.3", "the ea9d057 hub on candidate functions does not list aaron either (known positive: it lists the qa- agent)", { aaron: old.includes("aaron"), live: old.includes(live) }, !old.includes("aaron") && old.includes(live));
  writeFileSync(join(process.env.QA_TMP, "h-state.json"), JSON.stringify({ aaronHashPrefix: rowsOf("aaron")[0]?.apiKeyHash.slice(0, 8) }));
}

process.exit(finish("rows-b") ? 1 : 0);
