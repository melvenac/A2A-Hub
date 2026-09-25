// Loop 3 rows, part F (ruling 3, loop-3-ruling-3.md): F1 (no hash readable, takeover chain, getByName
// skew both directions), F2 (classify never promotes the retired key; keyStatus writers), DEMOTE.
// QA_TMP=<run dir> node rows-f.mjs
import { H, CVX, CAND, sha, DEV, DEV_HASH, newKey, name, register, whoami, hub, cq, cm, data, run, importRows, check, report, finish } from "./l3.mjs";
import { f1scan } from "./f1scan.mjs";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const rowsOf = (n) => data("agents").filter((r) => r.name === n);

// ================================================================ F1
{
  const r = await f1scan(CAND);
  check("F1.1", "class search (validated at 84694b9, where it flagged exactly getByName and listOnline): every public query called; none returns apiKeyHash",
    { queries: r.queries.length, uncalled: r.uncalled, flagged: r.flagged }, r.uncalled.length === 0 && r.flagged.length === 0);
  const v = name("f1victim"); const kv = newKey(); await register(H.W, v, kv);
  const byName = (await cq(CVX.A, "agents:getByName", { name: v })).value;
  const online = ((await cq(CVX.A, "agents:listOnline", {})).value ?? []).find((x) => x.name === v);
  const attacker = newKey();
  const rot = await cm(CVX.A, "agents:rotateKey", { name: v, currentHash: byName?.apiKeyHash ?? "unobtainable", newHash: sha(attacker) });
  const ob = { getByNameHash: byName && "apiKeyHash" in byName, listOnlineHash: !!online && "apiKeyHash" in online, publicRotate: rot.ok ? "SUCCEEDED" : "refused", attacker: await whoami(H.S, attacker), victim: await whoami(H.S, kv) };
  check("F1.2", "the takeover chain fails: no hash is obtainable from getByName or listOnline, a public rotateKey is refused, the attacker's key resolves to no one, the victim's key still resolves",
    ob, !ob.getByNameHash && !ob.listOnlineHash && !rot.ok && ob.attacker === 403 && ob.victim === v);
  // getByName skew, direction 1: the ea9d057 app on candidate functions (it reads existing?.apiKeyHash and askPolicy)
  const own = name("f1own"); const ko = newKey(); await register(H.W, own, ko);
  for (const [m, base] of [["warn", H.OW], ["strict", H.OS]]) {
    const rr = await register(base, own, newKey());
    check(`F1.3a.claim.${m}`, "old app on candidate functions: a register presenting a different key on an owned name is still refused (the mutation's C7), stored hash unchanged",
      { status: rr.status, same: rowsOf(own)[0]?.apiKeyHash === sha(ko) }, rr.status !== 200 && rowsOf(own)[0]?.apiKeyHash === sha(ko));
  }
  const askGate = async (label, base, cvx, reg) => {
    const [t, allowed, denied] = ["f1t", "f1allow", "f1deny"].map((x) => name(`${x}${label}`));
    const [kt, ka, kd] = [newKey(), newKey(), newKey()];
    await reg(allowed, ka); await reg(denied, kd);
    const mr = await cm(cvx, cvx === CVX.A ? "agents:registerAgent" : "agents:register", { name: t, apiKeyHash: sha(kt), agentCard: { name: t, kind: "ide-session" }, askPolicy: { allow: [allowed] } });
    await cm(cvx, "peers:register", { name: t, type: "agent" });
    const room = async (who, key) => (await hub(base, "POST", "/a2a/session", { key, body: { title: "qa-ask", participants: [who, t], maxTurns: 500 } })).json?.sessionId;
    const sA = await room(allowed, ka), sD = await room(denied, kd);
    const pa = await hub(base, "POST", `/a2a/session/${sA}/message`, { key: ka, body: { from: allowed, content: "allowed ask" } });
    const pd = await hub(base, "POST", `/a2a/session/${sD}/message`, { key: kd, body: { from: denied, content: "denied ask" } });
    return { seeded: mr.ok, allowed: pa.status, denied: pd.status, deniedErr: pd.json?.error };
  };
  const a1 = await askGate("o", H.OS, CVX.A, (n, k) => register(H.W, n, k));
  check("F1.3a.ask", "old app on candidate functions: the ask gate still reads askPolicy through getByName (allowed 200, denied 403 askPolicy denied)", a1,
    a1.seeded && a1.allowed === 200 && a1.denied === 403 && /askPolicy/.test(a1.deniedErr ?? ""));
  // direction 2: the candidate app on ea9d057 functions (getByName there still returns apiKeyHash; the new hub reads askPolicy)
  const a2 = await askGate("n", H.NEWOLD, CVX.B, (n, k) => register(H.BASE, n, k));
  check("F1.3b.ask", "candidate app on ea9d057 functions: the ask gate works on the old getByName shape (allowed 200, denied 403)", a2,
    a2.seeded && a2.allowed === 200 && a2.denied === 403);
}

// ================================================================ F2 and DEMOTE
{
  // F2.1: every keyStatus writer, listed statically, each mapped to the rows that cover it
  const COVER = {
    "registerCore:insert": "K1.1, K1.5, H2", "registerCore:migrate": "R1.1-4, MIG.2, K8", "rotateKey": "K2.1, K2.3, H2.rotate",
    "classifyAtDeploy": "R1.3, F2.2, DEMOTE", "stampCoHolders": "R1.2, REL.4, MIG.4",
  };
  const writers = [];
  for (const f of readdirSync(join(CAND, "convex")).filter((x) => x.endsWith(".ts") && !x.startsWith("_"))) {
    const src = readFileSync(join(CAND, "convex", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    const fns = [...src.matchAll(/(?:export const (\w+) = \w+\(|(?:async )?function (\w+)\s*\()/g)].map((m) => ({ fn: m[1] ?? m[2], at: m.index }));
    for (const m of src.matchAll(/keyStatus\s*:/g)) {
      const owner = fns.filter((x) => x.at < m.index).at(-1)?.fn ?? "(top level)";
      const line = src.slice(src.lastIndexOf("\n", m.index) + 1, src.indexOf("\n", m.index));
      if (/ctx\.db\.(insert|patch)|keyStatus:\s*(ownedStatusFor|classifyAtDeployStatus|"owned"|"legacy"|shared|legacy)/.test(line) || /insert|patch/.test(src.slice(Math.max(0, m.index - 400), m.index)))
        writers.push({ file: f, fn: owner, line: line.trim().slice(0, 80) });
    }
  }
  const uniq = [...new Set(writers.map((w) => w.fn))];
  const map = (fn) => Object.keys(COVER).find((k) => k.split(":")[0] === fn);
  const uncovered = uniq.filter((fn) => !map(fn) && !["classifyAtDeployStatus", "ownedStatusFor"].includes(fn));
  report("F2.1.writers", uniq.map((fn) => `${fn} -> ${COVER[map(fn)] ?? "(helper)"}`).join("; "));
  check("F2.1", "every keyStatus writer in convex/ is listed and covered by a row (known positives: registerCore, rotateKey, classifyAtDeploy, stampCoHolders)",
    { writers: uniq, uncovered }, ["registerCore", "rotateKey", "classifyAtDeploy", "stampCoHolders"].every((k) => uniq.includes(k)) && uncovered.length === 0);
  // F2.2: a lone unclassified dev-key row stays legacy; control: a lone fresh-key row IS promoted
  for (const r of data("agents").filter((x) => x.apiKeyHash === DEV_HASH)) run("agents:release", { name: r.name });
  const lone = name("f2devlone"), ctl = name("f2ctl"); const kc = newKey();
  importRows("agents", [
    { name: lone, apiKeyHash: DEV_HASH, agentCard: { name: lone, kind: "ide-session" }, lastSeen: Date.now(), status: "online" },
    { name: ctl, apiKeyHash: sha(kc), agentCard: { name: ctl, kind: "ide-session" }, lastSeen: Date.now(), status: "online" },
  ]);
  const cl = run("agents:classifyAtDeploy");
  check("F2.2", "classify: a lone unclassified dev-key row stays legacy and whoami(dev-key) is null; control: a lone fresh-key row is promoted to owned and resolves",
    { classify: cl.value, lone: rowsOf(lone)[0]?.keyStatus, dev: await whoami(H.W, DEV), ctl: rowsOf(ctl)[0]?.keyStatus, ctlWho: await whoami(H.W, kc) },
    cl.ok && rowsOf(lone)[0]?.keyStatus === "legacy" && (await whoami(H.W, DEV)) === null && rowsOf(ctl)[0]?.keyStatus === "owned" && (await whoami(H.W, kc)) === ctl);
  run("agents:release", { name: lone });
  // DEMOTE: a row that 84694b9 could have marked owned while holding the retired hash
  const dm = name("demote");
  importRows("agents", [{ name: dm, apiKeyHash: DEV_HASH, agentCard: { name: dm, kind: "ide-session" }, lastSeen: Date.now(), status: "online", keyStatus: "owned" }]);
  const pre = { status: rowsOf(dm)[0]?.keyStatus, getByKeyHash: (await cq(CVX.A, "agents:getByKeyHash", { apiKeyHash: DEV_HASH })).value, who: await whoami(H.W, DEV) };
  const cd = run("agents:classifyAtDeploy");
  const post = { classify: cd.value, status: rowsOf(dm)[0]?.keyStatus, who: await whoami(H.W, DEV) };
  check("DEMOTE", "an owned row holding the retired hash (as 84694b9 could leave it): getByKeyHash never resolves it even before classify; classify demotes it (demoted >= 1) to legacy",
    { pre, post }, pre.status === "owned" && pre.getByKeyHash === null && pre.who === null && cd.ok && (cd.value?.demoted ?? 0) >= 1 && post.status === "legacy" && post.who === null);
  run("agents:release", { name: dm });
}

process.exit(finish("rows-f") ? 1 : 0);
