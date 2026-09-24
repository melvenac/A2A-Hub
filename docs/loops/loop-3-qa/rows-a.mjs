// Loop 3 rows, part A (loop-3-qa-criteria.md): R1, K1, K2 (HTTP), K4, K8, B2.1/U3, DK, and two
// probes outside the rows (direct-caller rotate; classify on a lone dev-key holder), reported only.
// QA_TMP=<run dir> node rows-a.mjs     (stack from start-stack.ps1 must be up)
import {
  H, CVX, CAND, OLD, sha, P8, DEV, DEV_HASH, newKey, shortKey, name, register, rotate, whoami, hub, cq, cm, q, data, run,
  seedLegacy, importRows, hubTalk, keyOf, logCount, keyShaped, check, report, finish, SECRETS,
} from "./l3.mjs";
import { randomBytes } from "node:crypto";

const rowsOf = (n) => data("agents").filter((r) => r.name === n);
const prefixOf = (n) => { const r = rowsOf(n); return r.length === 1 ? r[0].apiKeyHash.slice(0, 8) : `${r.length} rows`; };
const both = async (key) => ({ W: await whoami(H.W, key), S: await whoami(H.S, key) });
const noHashIn = (text, ...keys) => !keys.some((k) => text.includes(sha(k).slice(0, 8)) || text.includes(k));

// ================================================================ R1 (first: it runs classifyAtDeploy)
{
  const [a, b, c, u] = ["r1a", "r1b", "r1c", "r1u"].map(name);
  const s = shortKey("r1"), ku = newKey();
  seedLegacy([a, b, c], s);
  importRows("agents", [{ name: u, apiKeyHash: sha(ku), agentCard: { name: u, kind: "ide-session" }, lastSeen: Date.now(), status: "online" }]);
  importRows("peers", [{ name: u, type: "agent", isActive: true }]);
  const seeded = [a, b, c, u].map((n) => ({ n, rows: rowsOf(n) }));
  check("R1.P8", "seed read back: 3 rows share s's prefix, u has its own, none has keyStatus",
    seeded.map(({ n, rows }) => `${n.split("-")[1]}:${rows.length}:${rows[0]?.apiKeyHash.slice(0, 8)}:${rows[0]?.keyStatus ?? "none"}`),
    seeded.every(({ rows }) => rows.length === 1 && rows[0].keyStatus === undefined) && [a, b, c].every((n) => rowsOf(n)[0].apiKeyHash === sha(s)));
  const sNobody = async (step) => { const w = await both(s); check(`R1.${step}.s`, "shared key s resolves to no name (warn null, strict 403)", w, w.W === null && w.S === 403); };
  await sNobody("0");
  const ids = Object.fromEntries([a, b, c].map((n) => [n, rowsOf(n)[0]._id]));
  const initKey = async (n, step) => {
    const r = await hubTalk(["--as", n, "--init-key"], { hub: H.W });
    const k = keyOf(n, H.W);
    const rows = rowsOf(n);
    const printed = (r.stderr.match(/prefix ([0-9a-f]{8})/) || [])[1];
    check(`R1.${step}.${n.split("-")[1]}`, "--init-key exit 0; one owned row, new _id, prefix = printed; its key resolves to it on both hubs; output carries no key",
      { code: r.code, rows: rows.length, status: rows[0]?.keyStatus, newId: rows[0]?._id !== ids[n], printed, stored: rows[0]?.apiKeyHash.slice(0, 8), who: k ? await both(k) : "no key file", shaped: keyShaped(r.stdout + r.stderr) },
      r.code === 0 && rows.length === 1 && rows[0].keyStatus === "owned" && rows[0]._id !== ids[n] && k && printed === P8(k) && (await whoami(H.W, k)) === n && (await whoami(H.S, k)) === n && !keyShaped(r.stdout + r.stderr));
    return k;
  };
  const ka = await initKey(a, "1"); await sNobody("1");
  const kb = await initKey(b, "2"); await sNobody("2");
  check("R1.2.c", "c, now the only holder of s, reads legacy (not promoted by attrition)", rowsOf(c)[0]?.keyStatus, rowsOf(c)[0]?.keyStatus === "legacy");
  check("R1.3.u-before", "control u (own key, no status) does not resolve before classify", await both(ku), (await whoami(H.W, ku)) === null);
  const cl = run("agents:classifyAtDeploy");
  const outText = JSON.stringify(cl.value ?? cl.error);
  check("R1.3.classify", "classifyAtDeploy ok; output is counts only (no name, no hash)", outText, cl.ok && !/[0-9a-f]{8}/.test(outText) && !outText.includes("qa-"));
  check("R1.3.c", "c stays legacy after classify (the stamping layer)", rowsOf(c)[0]?.keyStatus, rowsOf(c)[0]?.keyStatus === "legacy");
  await sNobody("3");
  check("R1.3.u", "control u becomes owned and resolves (classify promotes when it should)", { status: rowsOf(u)[0]?.keyStatus, who: await both(ku) }, rowsOf(u)[0]?.keyStatus === "owned" && (await whoami(H.W, ku)) === u);
  const snap = JSON.stringify(data("agents").map(({ _id, keyStatus }) => [_id, keyStatus]));
  run("agents:classifyAtDeploy");
  check("R1.3.idem", "a second classify changes nothing (data diff empty)", "compared keyStatus of every row", snap === JSON.stringify(data("agents").map(({ _id, keyStatus }) => [_id, keyStatus])));
  const kc = await initKey(c, "4"); await sNobody("4");
  check("R1.4.nohold", "no row holds s", data("agents").filter((r) => r.apiKeyHash === sha(s)).length, data("agents").every((r) => r.apiKeyHash !== sha(s)));
  const dirs = { a: await both(ka), b: await both(kb), c: await both(kc) };
  check("R1.dirs", "both directions: ka, kb, kc each resolve only to their own name", dirs, dirs.a.W === a && dirs.b.W === b && dirs.c.W === c && dirs.a.S === a && dirs.b.S === b && dirs.c.S === c);
}

// ================================================================ K1
{
  const [a, b, c] = ["k1a", "k1b", "k1c"].map(name);
  const ka = newKey(), kb = newKey();
  const ra = await register(H.W, a, ka), rb = await register(H.W, b, kb);
  const w1 = { a: await both(ka), b: await both(kb) };
  check("K1.1", "distinct keys: each resolves only to its own name, from both hubs", { reg: [ra.status, rb.status], ...w1 },
    ra.status === 200 && rb.status === 200 && w1.a.W === a && w1.a.S === a && w1.b.W === b && w1.b.S === b);
  for (const [m, base] of [["warn", H.W], ["strict", H.S]]) {
    const r = await register(base, c, ka);
    const agentRow = await q(CVX.A, "agents:getByName", { name: c }), peerRow = (await cq(CVX.A, "peers:getByName", { name: c })).value ?? null;
    check(`K1.2.${m}`, "new name with a held key: 409; body names neither the holder nor any hash run; no agents or peers row; ka still a",
      { status: r.status, err: r.json?.error, agentRow: !!agentRow, peerRow: !!peerRow, who: await whoami(base, ka) },
      r.status === 409 && !r.text.includes(a) && noHashIn(r.text, ka) && !agentRow && !peerRow && (await whoami(base, ka)) === a);
    const r3 = await register(base, b, ka);
    check(`K1.3.${m}`, "owned name presenting another's key: 409; kb still resolves to b", { status: r3.status, who: await whoami(base, kb) }, r3.status === 409 && (await whoami(base, kb)) === b);
  }
  const [l1, l2] = ["k1l1", "k1l2"].map(name); const s = shortKey("k1");
  seedLegacy([l1, l2], s);
  const pBefore = prefixOf(l1);
  for (const [m, base] of [["warn", H.W], ["strict", H.S]]) {
    const r = await register(base, l1, ka);
    check(`K1.4.${m}`, "legacy name moving onto a held hash: 409, stored prefix unchanged", { status: r.status, same: prefixOf(l1) === pBefore }, r.status === 409 && prefixOf(l1) === pBefore);
  }
  for (const [m, base] of [["warn", H.W], ["strict", H.S]]) {
    const k31 = randomBytes(32).toString("base64url").slice(0, 31), k32 = randomBytes(32).toString("base64url").slice(0, 32);
    SECRETS.push(k31, k32);
    const n31 = name(`k1f31${m[0]}`), n32 = name(`k1f32${m[0]}`);
    const r31 = await register(base, n31, k31), r32 = await register(base, n32, k32);
    check(`K1.5.${m}`, "floor through the candidate hub: 31 chars -> 400 and no row; 32 chars -> 200, owned, resolves",
      { s31: r31.status, e31: r31.json?.error, row31: rowsOf(n31).length, s32: r32.status, status32: rowsOf(n32)[0]?.keyStatus, who32: await whoami(base, k32) },
      r31.status === 400 && rowsOf(n31).length === 0 && r32.status === 200 && rowsOf(n32)[0]?.keyStatus === "owned" && (await whoami(base, k32)) === n32);
  }
}

// ================================================================ K2 (HTTP parts: 1, 2, 3, 6)
{
  const a = name("k2a"); const k0 = newKey(), k1 = newKey();
  await register(H.W, a, k0);
  const before = { k0: await both(k0), k1: await both(k1) };
  const wouldBefore = logCount("hubW", /WOULD REJECT unknown X-Agent-Key/);
  const r = await rotate(H.S, k0, k1);
  const after = { k1: await both(k1), k0: await both(k0) };
  const wouldAfter = logCount("hubW", /WOULD REJECT unknown X-Agent-Key/);
  check("K2.1", "rotate on strict: 200 {ok,name}, body carries no key or hash; after: k1 -> a both hubs, k0 -> strict 403 / warn null + a WOULD REJECT line; no row holds k0",
    { before, status: r.status, body: r.json, after, wouldLines: wouldAfter - wouldBefore, rowsWithK0: data("agents").filter((x) => x.apiKeyHash === sha(k0)).length },
    before.k0.W === a && before.k1.W === null && r.status === 200 && r.json?.ok === true && r.json?.name === a && noHashIn(r.text, k0, k1)
    && after.k1.W === a && after.k1.S === a && after.k0.S === 403 && after.k0.W === null && wouldAfter > wouldBefore && data("agents").every((x) => x.apiKeyHash !== sha(k0)));
  const [lg] = [name("k2leg")]; const sl = shortKey("k2"); seedLegacy([lg, name("k2leg2")], sl);
  const other = name("k2oth"); const ko = newKey(); await register(H.W, other, ko);
  for (const [m, base] of [["warn", H.W], ["strict", H.S]]) {
    const cases = [
      ["wrong-key", await rotate(base, newKey(), newKey()), (s) => s === 403],
      ["no-header", await hub(base, "POST", "/a2a/rotate", { body: { newApiKey: newKey() } }), (s) => s === 401],
      ["legacy-key", await rotate(base, sl, newKey()), (s) => s === 403],
      ["held-by-other", await rotate(base, k1, ko), (s) => s === 409],
      ["short", await rotate(base, k1, shortKey("rot")), (s) => s === 400],
      ["same-as-current", await rotate(base, k1, k1), (s) => s === 400],
    ];
    for (const [label, res, ok] of cases) {
      const still = await whoami(base, k1);
      check(`K2.2.${m}.${label}`, "negative: expected status, nothing rotated (k1 still -> a)", { status: res.status, err: res.json?.error, still }, ok(res.status) && still === a);
    }
  }
  const nb = name("k2body"); const kb0 = newKey(), kb1 = newKey(); await register(H.W, nb, kb0);
  const rb = await hub(H.S, "POST", "/a2a/rotate", { key: kb0, body: { name: other, newApiKey: kb1 } });
  const ob = { status: rb.status, caller: await whoami(H.S, kb1), otherStill: await whoami(H.S, ko) };
  check("K2.2.body-names-other", "a body naming another agent rotates only the caller (or is refused); the other is untouched", ob,
    ob.otherStill === other && ((rb.status === 200 && ob.caller === nb) || rb.status >= 400));
  const racer = name("k2race"); const c0 = newKey(), n1 = newKey(), n2 = newKey(); await register(H.W, racer, c0);
  const [x, y] = await Promise.all([rotate(H.S, c0, n1), rotate(H.S, c0, n2)]);
  const winners = [x, y].filter((z) => z.status === 200).length;
  const res = { statuses: [x.status, y.status], n1: await whoami(H.W, n1), n2: await whoami(H.W, n2) };
  check("K2.3", "two rotations race with the same current key: exactly one 200; the winner's key resolves, the loser's resolves to no name", res,
    winners === 1 && ((x.status === 200 && res.n1 === racer && res.n2 === null) || (y.status === 200 && res.n2 === racer && res.n1 === null)));
  for (const [m, base] of [["warn", H.W], ["strict", H.S]]) {
    const rr = await register(base, a, k0), rbk = await rotate(base, k0, newKey());
    check(`K2.6.${m}`, "old key cannot restore: register with k0 -> 409 (C7); rotate back with k0 -> 403; k1 still -> a", { reg: rr.status, rot: rbk.status, still: await whoami(base, k1) },
      rr.status === 409 && rbk.status === 403 && (await whoami(base, k1)) === a);
  }
}

// ================================================================ K4
{
  const [a, b] = ["k4a", "k4b"].map(name); const ka = newKey(), kb = newKey();
  await register(H.W, a, ka); await register(H.W, b, kb);
  const room = async () => (await hub(H.W, "POST", "/a2a/session", { key: ka, body: { title: "qa-K4", participants: [a, b], maxTurns: 500 } })).json.sessionId;
  const say = (sid, t) => hub(H.W, "POST", `/a2a/session/${sid}/message`, { key: ka, body: { from: a, content: t } });
  const markB = async (sid) => (await hub(H.W, "GET", `/a2a/session/${sid}/reads`, { key: kb })).json?.participants?.find((p) => p.name === b)?.lastRead ?? null;
  const post = (base, sid, key, turn = 1) => hub(base, "POST", `/a2a/session/${sid}/read`, { key, body: { reader: b, throughTurn: turn, via: "wait" } });
  let sid = await room(); await say(sid, "k4 t1");
  let r = await post(H.S, sid, ka);
  check("K4.1", "strict mismatch: 403 'reader is not the caller', B unmarked", { status: r.status, err: r.json?.error, mark: await markB(sid) }, r.status === 403 && /reader is not the caller/.test(r.json?.error ?? "") && (await markB(sid)) === null);
  r = await post(H.S, sid, kb);
  check("K4.2", "strict match: 200, the mark moves", { status: r.status, mark: (await markB(sid))?.turn }, r.status === 200 && (await markB(sid))?.turn === 1);
  sid = await room(); await say(sid, "k4 t1");
  const l0 = logCount("hubW", new RegExp(`WOULD REJECT reader ${b} for caller ${a} on POST /read`));
  r = await post(H.W, sid, ka);
  check("K4.3", "warn mismatch: 200, mark moves, log names reader and caller", { status: r.status, mark: (await markB(sid))?.turn, logLines: logCount("hubW", new RegExp(`WOULD REJECT reader ${b} for caller ${a} on POST /read`)) - l0 },
    r.status === 200 && (await markB(sid))?.turn === 1 && logCount("hubW", new RegExp(`WOULD REJECT reader ${b} for caller ${a} on POST /read`)) > l0);
  const sl = shortKey("k4"); seedLegacy([name("k4l1"), name("k4l2")], sl);
  for (const [label, key] of [["unknown", newKey()], ["legacy", sl]]) {
    sid = await room(); await say(sid, `k4 ${label}`);
    const u0 = logCount("hubW", new RegExp(`WOULD REJECT reader ${b} for caller unknown on POST /read`));
    r = await post(H.W, sid, key);
    check(`K4.4.${label}`, `warn, ${label} key: 200, mark moves, log says caller unknown`, { status: r.status, mark: (await markB(sid))?.turn, logLines: logCount("hubW", new RegExp(`WOULD REJECT reader ${b} for caller unknown`)) - u0 },
      r.status === 200 && (await markB(sid))?.turn === 1 && logCount("hubW", new RegExp(`WOULD REJECT reader ${b} for caller unknown`)) > u0);
  }
}

// ================================================================ K8
{
  const [k8, k8b] = ["k8", "k8b"].map(name); const s8 = shortKey("k8"); seedLegacy([k8, k8b], s8);
  const m = newKey(); const mig0 = logCount("hubW", new RegExp(`MIGRATE ${k8}`));
  const r0 = await register(H.W, k8, m);
  check("K8.known-positive", "migration changes the stored hash (register can move it): 200, MIGRATE logged, row owned with m's prefix",
    { status: r0.status, migrateLines: logCount("hubW", new RegExp(`MIGRATE ${k8}`)) - mig0, stored: prefixOf(k8) === P8(m), status2: rowsOf(k8)[0]?.keyStatus },
    r0.status === 200 && logCount("hubW", new RegExp(`MIGRATE ${k8}`)) > mig0 && prefixOf(k8) === P8(m) && rowsOf(k8)[0]?.keyStatus === "owned");
  for (const [md, base] of [["warn", H.W], ["strict", H.S]]) {
    const fresh = newKey();
    const tries = { old: (await register(base, k8, s8)).status, fresh: await register(base, k8, fresh), same: (await register(base, k8, m)).status };
    const ob = { old: tries.old, fresh: tries.fresh.status, freshErr: tries.fresh.json?.error, same: tries.same, stored: prefixOf(k8) === P8(m), whoM: await whoami(base, m), whoFresh: await whoami(base, fresh) };
    check(`K8.${md}`, "owned name: old key 409 (U1, co-holder remains), fresh key 409 'name holds its own key', own key 200; stored hash unchanged; m -> k8; fresh -> no name",
      ob, ob.old === 409 && ob.fresh === 409 && /name holds its own key/.test(ob.freshErr ?? "") && ob.same === 200 && ob.stored && ob.whoM === k8 && (md === "warn" ? ob.whoFresh === null : ob.whoFresh === 403));
  }
  run("agents:release", { name: k8b });
  const r400 = await register(H.W, k8, s8);
  check("K8.floor", "once no other name holds s8, the old short key is refused by the floor (400); stored hash unchanged", { status: r400.status, stored: prefixOf(k8) === P8(m) }, r400.status === 400 && prefixOf(k8) === P8(m));
}

// ================================================================ B2.1 and U3 (function level)
{
  const own = name("b2own"); const ko = newKey(); await register(H.W, own, ko);
  const lone = name("b2leg"); const sLone = shortKey("b2lone"); seedLegacy([lone], sLone);
  const sh = shortKey("b2sh"); seedLegacy([name("b2sh1"), name("b2sh2")], sh);
  const unk = newKey();
  const g = async (k) => (await cq(CVX.A, "agents:getByKeyHash", { apiKeyHash: sha(k) })).value;
  const st = async (k) => (await cq(CVX.A, "agents:keyHashStatus", { apiKeyHash: sha(k) })).value;
  const res = { owned: await g(ko), legacy: await g(sLone), shared: await g(sh), unknown: await g(unk) };
  check("B2.1.getByKeyHash", "exactly null (not an object) for legacy, shared, unknown; {name} for owned (known positive)",
    { owned: res.owned?.name, legacy: res.legacy, shared: res.shared, unknown: res.unknown }, res.owned?.name === own && res.legacy === null && res.shared === null && res.unknown === null);
  const sts = { owned: await st(ko), legacy: await st(sLone), shared: await st(sh), unknown: await st(unk) };
  check("B2.1.keyHashStatus", "exactly one of the four strings each, matching, nothing else", sts,
    sts.owned === "owned" && sts.legacy === "legacy" && sts.shared === "shared" && sts.unknown === "unknown");
  const pairKey = newKey(), mixKey = newKey(), twoKey = newKey();
  const pn = name("u3pair"), mn = name("u3mix"), [t1, t2] = ["u3two1", "u3two2"].map(name);
  const now = Date.now(); const row = (n, k, ks, d) => ({ name: n, apiKeyHash: sha(k), agentCard: { name: n, kind: "ide-session" }, lastSeen: now - d, status: "online", keyStatus: ks });
  importRows("agents", [row(pn, pairKey, "owned", 0), row(pn, pairKey, "owned", 1), row(mn, mixKey, "owned", 0), row(mn, mixKey, "legacy", 1), row(t1, twoKey, "owned", 0), row(t2, twoKey, "owned", 1)]);
  const u3 = { pair: (await g(pairKey))?.name ?? null, mixed: await g(mixKey), twoNames: await g(twoKey) };
  check("B2.1.U3", "U3 as accepted: same-name owned pair resolves; pair with a legacy row -> null; two names -> null", u3, u3.pair === pn && u3.mixed === null && u3.twoNames === null);
}

// ================================================================ DK
{
  // 1. static search, validated on the known positives
  const { readdirSync, readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const files = readdirSync(join(CAND, "convex")).filter((f) => f.endsWith(".ts") && !f.startsWith("_"));
  const writers = [], helpers = new Set();
  for (const f of files) {
    const src = readFileSync(join(CAND, "convex", f), "utf8");
    for (const m of src.matchAll(/(?:async\s+)?function\s+(\w+)\s*\([^)]*\)[^{]*\{/g)) {
      const body = src.slice(m.index, src.indexOf("\n}", m.index));
      if (/ctx\.db\.(insert\("agents"|patch)[\s\S]*apiKeyHash/.test(body)) helpers.add(m[1]);
    }
  }
  for (const f of files) {
    const src = readFileSync(join(CAND, "convex", f), "utf8");
    // Each export's body ends at the NEXT export of any kind (a query included), never later.
    const exportsAll = [...src.matchAll(/export (?:const|function|async function) (\w+)/g)].map((m) => m.index);
    const blocks = [...src.matchAll(/export const (\w+) = (mutation|internalMutation)\(/g)];
    blocks.forEach((b) => {
      const body = src.slice(b.index, exportsAll.find((i) => i > b.index) ?? src.length);
      const direct = /ctx\.db\.(insert|patch)\([\s\S]*?apiKeyHash/.test(body);
      const via = [...helpers].filter((h) => new RegExp(`\\b${h}\\(`).test(body));
      if (direct || via.length) writers.push({ fn: `${f.replace(".ts", "")}.${b[1]}`, kind: b[2], via });
    });
  }
  const pub = writers.filter((w) => w.kind === "mutation").map((w) => w.fn);
  check("DK.1", "static search lists every public mutation that can write apiKeyHash; known positives register, registerAgent, rotateKey all found",
    { public: pub, internal: writers.filter((w) => w.kind !== "mutation").map((w) => w.fn), helpers: [...helpers] },
    ["agents.register", "agents.registerAgent", "agents.rotateKey"].every((k) => pub.includes(k)));
  const tested = new Set();
  const direct = async (label) => {
    const holder = name(`dkown${label}`); const kh = newKey(); await register(H.W, holder, kh);
    for (const fn of pub) {
      const path = fn.replace(".", ":");
      const nn = name(`dk${label}${fn.split(".")[1].toLowerCase()}`); // the full function name: no two collide
      let okArgs, devArgs;
      if (fn.endsWith("rotateKey")) {
        const kNew = newKey();
        okArgs = { name: holder, currentHash: sha(kh), newHash: sha(kNew) };
        const cur = kNew;
        devArgs = () => ({ name: holder, currentHash: sha(cur), newHash: DEV_HASH });
      } else {
        okArgs = { name: `${nn}-ok`, apiKeyHash: sha(newKey()), agentCard: { name: nn, kind: "ide-session" } };
        devArgs = () => ({ name: nn, apiKeyHash: DEV_HASH, agentCard: { name: nn, kind: "ide-session" } });
      }
      const pos = await cm(CVX.A, path, okArgs);
      const before = JSON.stringify(data("agents").map((r) => [r._id, r.apiKeyHash.slice(0, 8)]));
      const neg = await cm(CVX.A, path, devArgs());
      const after = JSON.stringify(data("agents").map((r) => [r._id, r.apiKeyHash.slice(0, 8)]));
      const dev = (await cq(CVX.A, "agents:getByKeyHash", { apiKeyHash: DEV_HASH })).value;
      tested.add(fn);
      check(`DK.2.${label}.${fn.split(".")[1]}`, "direct call, no hub, no keyTooShort: fresh key succeeds (known positive); dev-key hash refused (ConvexError with status), no row change, getByKeyHash(dev) null",
        { positive: pos.ok, refused: !neg.ok, status: neg.data?.status, reason: neg.data?.reason, unchanged: before === after, dev },
        pos.ok && !neg.ok && neg.data?.status === 400 && before === after && dev === null);
    }
  };
  await direct("nolegacy");
  const dleg = name("dkleg"); importRows("agents", [{ name: dleg, apiKeyHash: DEV_HASH, agentCard: { name: dleg, kind: "ide-session" }, lastSeen: Date.now(), status: "online", keyStatus: "legacy" }]);
  importRows("peers", [{ name: dleg, type: "agent", isActive: true }]);
  await direct("withlegacy");
  check("DK.2.all-tested", "every public mutation the search listed was tested", { listed: pub, tested: [...tested] }, pub.every((p) => tested.has(p)));
  const u0 = logCount("hubW", new RegExp(`WOULD REJECT legacy key on register ${dleg}`));
  const r = await register(H.W, dleg, DEV);
  check("DK.3", "U2 exemption: a legacy holder re-registering its dev-key through the warn hub: 200 + WOULD REJECT legacy; row stays legacy; dev-key resolves to no name",
    { status: r.status, logLines: logCount("hubW", new RegExp(`WOULD REJECT legacy key on register ${dleg}`)) - u0, keyStatus: rowsOf(dleg)[0]?.keyStatus, who: await whoami(H.W, DEV) },
    r.status === 200 && logCount("hubW", new RegExp(`WOULD REJECT legacy key on register ${dleg}`)) > u0 && rowsOf(dleg)[0]?.keyStatus === "legacy" && (await whoami(H.W, DEV)) === null);
  for (const [m, base] of [["warn", H.OW], ["strict", H.OS]]) {
    const nn = name(`dkskew${m[0]}`);
    const rr = await register(base, nn, DEV);
    const ob = { status: rr.status, row: rowsOf(nn).length, peer: !!(await cq(CVX.A, "peers:getByName", { name: nn })).value, dev: (await cq(CVX.A, "agents:getByKeyHash", { apiKeyHash: DEV_HASH })).value };
    check(`DK.4.${m}`, "skew: ea9d057 hub on candidate functions registering a new name with dev-key: non-200, no row, no peer, getByKeyHash(dev) null", ob,
      rr.status !== 200 && ob.row === 0 && !ob.peer && ob.dev === null);
  }
}

// ================================================================ probes outside the rows (reported, not judged)
{
  const v = name("hijackvictim"); const kv = newKey(); await register(H.W, v, kv);
  const exposed = (await cq(CVX.A, "agents:getByName", { name: v })).value?.apiKeyHash;
  const attacker = newKey();
  const rr = exposed ? await cm(CVX.A, "agents:rotateKey", { name: v, currentHash: exposed, newHash: sha(attacker) }) : { ok: false };
  const after = { attacker: await whoami(H.S, attacker), victimOwnKey: await whoami(H.S, kv) };
  report("PROBE.direct-rotate", `public agents:getByName returns the full apiKeyHash (${exposed && exposed.length === 64 ? "yes, 64 hex" : "no"}); a direct agents:rotateKey with that hash as currentHash ${rr.ok ? "SUCCEEDED" : "was refused"}; afterwards the attacker's key resolves to ${after.attacker === v ? "THE VICTIM (takeover)" : JSON.stringify(after.attacker)} and the victim's own key to ${JSON.stringify(after.victimOwnKey)}`);
  // A LONE unclassified dev-key holder: release every other holder first.
  for (const r of data("agents").filter((x) => x.apiKeyHash === DEV_HASH)) run("agents:release", { name: r.name });
  const lone = name("devlone");
  importRows("agents", [{ name: lone, apiKeyHash: DEV_HASH, agentCard: { name: lone, kind: "ide-session" }, lastSeen: Date.now(), status: "online" }]);
  const devHolders = data("agents").filter((r) => r.apiKeyHash === DEV_HASH).map((r) => `${r.name.split("-")[1]}:${r.keyStatus ?? "none"}`);
  run("agents:classifyAtDeploy");
  const after2 = { lone: rowsOf(lone)[0]?.keyStatus, devResolves: await whoami(H.W, DEV) };
  report("PROBE.classify-dev", `dev-key holders before classify: ${devHolders.join(", ")}; after classifyAtDeploy the unclassified dev-key row reads ${after2.lone} and the dev-key resolves to ${JSON.stringify(after2.devResolves)} (lone holder: if it reads owned and resolves, classify can promote the retired key)`);
  run("agents:release", { name: lone });
}

process.exit(finish("rows-a") ? 1 : 0);
