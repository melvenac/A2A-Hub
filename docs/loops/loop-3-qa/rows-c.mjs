// Loop 3 rows, part C (loop-3-qa-criteria.md): B1, B2.2-B2.6, N.1-N.3, N.5a, K5 (dynamic + static),
// K2.4/5/7/8 (daemons and an interrupted --rotate-key). QA_TMP=<run dir> node rows-c.mjs
import {
  H, CVX, CAND, OLD, TMP, sha, P8, DEV, DEV_HASH, newKey, shortKey, name, register, rotate, whoami, hub, cq, q, data, run,
  seedLegacy, importRows, client, hubTalk, hubKey, keyOf, keyFile, logCount, keyShaped, check, report, finish, SECRETS,
} from "./l3.mjs";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const rowsOf = (n) => data("agents").filter((r) => r.name === n);
const peerOf = async (n) => (await cq(CVX.A, "peers:getByName", { name: n })).value ?? null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proxy = { reset: () => hub(H.PROXY, "POST", "/__qa/reset", { body: {} }), mode: (m) => hub(H.PROXY, "POST", "/__qa/mode", { body: m }), log: async () => (await hub(H.PROXY, "GET", "/__qa/log")).json ?? [] };
const oldTalk = (args, o = {}) => hubTalk(args, { ...o, tree: OLD });
const room = async (base, a, ka, b) => (await hub(base, "POST", "/a2a/session", { key: ka, body: { title: "qa-room", participants: [a, b], maxTurns: 500 } })).json?.sessionId;

// ================================================================ B1
{
  const [a, b] = ["b1a", "b1b"].map(name); const ka = newKey(), kb = newKey();
  await register(H.W, a, ka); await register(H.W, b, kb);
  const sid = await room(H.W, a, ka, b);
  for (const [sub, setup] of [["holders-present", true], ["no-holder", false]]) {
    for (const r of data("agents").filter((x) => x.apiKeyHash === DEV_HASH)) run("agents:release", { name: r.name });
    if (setup) seedLegacy([name("b1dev1"), name("b1dev2")].map((x) => x), DEV);
    const nn = name(`b1new${sub === "no-holder" ? "n" : "h"}`);
    await proxy.reset();
    const r1 = await oldTalk(["--as", nn, "--session", sid, "--say", "b1 hello"], { hub: H.PROXY });
    const regStatus = (await proxy.log()).find((e) => e.url.startsWith("/a2a/register"))?.status;
    const turn = data("messages").some((m) => m.sessionId === sid && m.content === "b1 hello");
    check(`B1.1.${sub}`, "old client, new name, dev-key: register refused; exit 1 with 'not registered on this hub' (not a bare Unknown peer); no agents or peers row; no turn",
      { register: regStatus, code: r1.code, cause: /not registered on this hub/.test(r1.stderr), agents: rowsOf(nn).length, peer: !!(await peerOf(nn)), turn },
      regStatus !== 200 && r1.code === 1 && /not registered on this hub/.test(r1.stderr) && rowsOf(nn).length === 0 && !(await peerOf(nn)) && !turn);
    if (sub === "holders-present") {
      const s0 = data("sessions").length;
      const r2 = await oldTalk(["--as", nn, "--peer", b, "--say", "b1 peer"], { hub: H.W });
      check("B1.2.peer", "--peer <registered> --say: exit 1 with 'not registered on this hub'; no session created", { code: r2.code, cause: /not registered on this hub/.test(r2.stderr), sessions: data("sessions").length - s0 },
        r2.code === 1 && /not registered on this hub/.test(r2.stderr) && data("sessions").length === s0);
      const w = await oldTalk(["--as", nn, "--session", sid, "--wait", "--wait-timeout", "3"], { hub: H.W });
      const ib = await oldTalk(["--as", nn, "--session", sid, "--inbox"], { hub: H.W });
      const marks = (await hub(H.W, "GET", `/a2a/session/${sid}/reads`, { key: ka })).json?.participants?.map((p) => p.name) ?? [];
      report("B1.2.read-paths", `--wait exit ${w.code}, --inbox exit ${ib.code}; receipt failure on stderr: wait ${/receipt|not a participant|not recorded/i.test(w.stderr)}, inbox ${/receipt|not a participant|not recorded/i.test(ib.stderr)}; the name in /reads participants: ${marks.includes(nn)}. Design §11 table: they read the room, the receipt post fails on stderr.`);
      check("B1.2.read-paths", "--wait/--inbox: the name gets no mark in /reads", { inReads: marks.includes(nn) }, !marks.includes(nn));
      const lob = await oldTalk(["--as", nn, "--wait", "--join-timeout", "5"], { hub: H.W, timeoutMs: 60_000 });
      check("B1.2.lobby", "no-arg lobby wait with no peer: exit 1 'no live IDE peer' (the silent path; closed by rule)", { code: lob.code, msg: /no live IDE peer/i.test(lob.stderr) }, lob.code === 1 && /no live IDE peer/i.test(lob.stderr));
    }
  }
  const doc = readFileSync(join(CAND, "docs", "joining-the-hub.md"), "utf8");
  const ruleInDoc = /(new seat name|new name)[^.]*only[^.]*--init-key/i.test(doc.replace(/\s+/g, " ")) && /released/i.test(doc);
  check("B1.2.rule-text", "the rule 'a new seat name, or a released one, is created only by --init-key from the new-client worktree' is in joining-the-hub.md (and in the Q1 text in the record)",
    { inJoiningTheHub: ruleInDoc, inRecordQ1: "master state.json: 'new names during the window only via --init-key' (new names only; released names not stated)" }, ruleInDoc);
  const nn = name("b1new"); const ik = await hubTalk(["--as", nn, "--init-key"], { hub: H.W });
  const pre = rowsOf(nn)[0]?.apiKeyHash.slice(0, 8);
  const s2 = await room(H.W, a, ka, nn);
  const again = await oldTalk(["--as", nn, "--session", s2, "--say", "b1 after init"], { hub: H.W });
  check("B1.3", "remedy: --init-key, then the same old-client --say: exit 0, a turn from the name, stored prefix unchanged by the old client's refused dev-key register",
    { init: ik.code, code: again.code, turn: data("messages").some((m) => m.sessionId === s2 && m.content === "b1 after init" && m.from === nn), same: rowsOf(nn)[0]?.apiKeyHash.slice(0, 8) === pre },
    ik.code === 0 && again.code === 0 && data("messages").some((m) => m.sessionId === s2 && m.content === "b1 after init") && rowsOf(nn)[0]?.apiKeyHash.slice(0, 8) === pre);
}

// ================================================================ B2.2 - B2.6
{
  const own = name("b2own"); const ko = newKey(); await register(H.W, own, ko);
  const lg = name("b2leg"); const sl = shortKey("b2l"); seedLegacy([lg], sl);
  const sh = shortKey("b2s"); seedLegacy([name("b2s1"), name("b2s2")], sh);
  const keys = { legacy: sl, shared: sh, unknown: newKey(), owned: ko };
  const res = {};
  for (const [k, v] of Object.entries(keys)) {
    const l0 = logCount("oldW", /WOULD REJECT unknown X-Agent-Key/);
    const w = await hub(H.OW, "GET", "/a2a/sessions", { key: v });
    const s = await hub(H.OS, "GET", "/a2a/sessions", { key: v });
    res[k] = { warn: w.status, line: logCount("oldW", /WOULD REJECT unknown X-Agent-Key/) - l0, strict: s.status };
  }
  check("B2.2", "old app on candidate functions: strict 403 for legacy/shared/unknown, 200 owned; warn 200 all, a WOULD REJECT line for the three and none for owned", res,
    ["legacy", "shared", "unknown"].every((k) => res[k].strict === 403 && res[k].warn === 200 && res[k].line > 0) && res.owned.strict === 200 && res.owned.warn === 200 && res.owned.line === 0);
  const nn = name("b2u1"); const before = data("agents").map((r) => r.apiKeyHash.slice(0, 8)).join();
  const u1 = await register(H.OW, nn, ko); const c7 = await register(H.OW, own, newKey());
  check("B2.3", "refused registers through the old app (U1: new name + owned key; C7: owned name + fresh key): non-200, no peers row for the new name, every stored prefix unchanged",
    { u1: u1.status, c7: c7.status, peer: !!(await peerOf(nn)), prefixesSame: before === data("agents").filter((r) => r.name !== nn).map((r) => r.apiKeyHash.slice(0, 8)).join() },
    u1.status !== 200 && c7.status !== 200 && !(await peerOf(nn)) && rowsOf(nn).length === 0);
  // B2.4: static, every function the old hub calls vs its candidate form
  const calls = new Set();
  for (const f of spawnSync("git", ["-C", OLD, "ls-files", "src"], { encoding: "utf8" }).stdout.split("\n").filter((x) => x.endsWith(".ts")))
    for (const m of readFileSync(join(OLD, f), "utf8").matchAll(/api\.(\w+)\.(\w+)/g)) calls.add(`${m[1]}.${m[2]}`);
  const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const block = (tree, mod, fn) => { const p = join(tree, "convex", `${mod}.ts`); if (!existsSync(p)) return null; const s = stripComments(readFileSync(p, "utf8")); const i = s.indexOf(`export const ${fn} =`); if (i < 0) return null; const j = s.indexOf("\nexport ", i + 1); return s.slice(i, j < 0 ? s.length : j); };
  const argsOf = (b) => (b?.match(/args:\s*(\{[\s\S]*?\}|\w+),\s*\n\s*handler/) || [])[1]?.replace(/\s+/g, " ") ?? null;
  const TABLE = ["agents.getByKeyHash", "agents.register", "agents.getByName", "agents.heartbeat", "agents.listOnline", "sessions.create", "messages.send", "messages.markRead"];
  const changed = [];
  for (const c of [...calls].sort()) {
    const [mod, fn] = c.split(".");
    const o = block(OLD, mod, fn), n = block(CAND, mod, fn);
    if (!n) { changed.push(`${c}: MISSING in candidate`); continue; }
    if ((o ?? "").replace(/\s+/g, " ") !== n.replace(/\s+/g, " ")) changed.push(`${c}${argsOf(o) === argsOf(n) ? "" : " (args differ)"}`);
  }
  const outside = changed.filter((c) => !TABLE.includes(c.split(" ")[0]));
  check("B2.4", "every function the ea9d057 hub calls: unchanged, or in §11's table; known positives getByKeyHash and register are among the calls",
    { oldHubCalls: calls.size, changed, outsideTable: outside }, calls.has("agents.getByKeyHash") && calls.has("agents.register") && outside.length === 0);
  const l0 = logCount("newOld", /WOULD REJECT/);
  const r5 = await hub(H.NEWOLD, "GET", "/a2a/sessions", { key: newKey() });
  const lines = readFileSync(join(TMP, "logs", "newOld.out.log"), "utf8").split(/\r?\n/).concat(readFileSync(join(TMP, "logs", "newOld.err.log"), "utf8").split(/\r?\n/)).filter((x) => /WOULD REJECT/.test(x));
  check("B2.5", "candidate app on ea9d057 functions (keyHashStatus absent): unknown key -> 200 in warn, never 500; the log line says unknown", { status: r5.status, newLines: logCount("newOld", /WOULD REJECT/) - l0, last: lines.at(-1)?.replace(/[0-9a-f]{8,}/g, "<hex>").slice(0, 120) },
    r5.status === 200 && logCount("newOld", /WOULD REJECT/) > l0 && /unknown/.test(lines.at(-1) ?? ""));
}

// ---------------------------------------------------------------- skew scenario (Loop 1 skew.mjs shape), old client
async function scenario(base, label, keyFor, preRegister) {
  const a = name(`sk${label}a`), b = name(`sk${label}b`);
  const ka = keyFor(a), kb = keyFor(b);
  if (preRegister) { await preRegister(a); await preRegister(b); }
  const env = (k) => (k === DEV ? {} : { AGENT_KEY: k });
  const sid = (await hub(base, "POST", "/a2a/session", { key: ka, body: { title: "qa-skew", participants: [a, b], maxTurns: 500 } })).json?.sessionId;
  const run1 = (n, k, args) => oldTalk(["--as", n, ...args], { hub: base, env: env(k), timeoutMs: 90_000 });
  const steps = [
    ["say", await run1(a, ka, ["--session", sid, "--say", "skew one"])],
    ["wait", await run1(b, kb, ["--session", sid, "--wait", "--wait-timeout", "15"])],
    ["inbox-b", await run1(b, kb, ["--session", sid, "--inbox"])],
    ["wait-timeout", await run1(b, kb, ["--session", sid, "--wait", "--wait-timeout", "3"])],
    ["peer-say", await run1(a, ka, ["--peer", b, "--say", "skew two"])],
    ["peer-wait", await run1(b, kb, ["--peer", a, "--wait", "--wait-timeout", "15"])],
  ];
  const norm = (s) => s.split(a).join("<A>").split(b).join("<B>").replace(/session [a-z0-9]{20,}/g, "session <SID>").replace(/\r/g, "");
  return steps.map(([k, r]) => ({ k, code: r.code, out: norm(r.stdout) }));
}
const sameScenario = (x, y) => x.every((s, i) => s.k === y[i].k && s.code === y[i].code && s.out === y[i].out);
const codes = (x) => x.map((s) => `${s.k}=${s.code}`).join(" ");

// ================================================================ N.1, N.2, B2.6
{
  // pre-register names on each side so the old client's register is a re-register, as for an existing seat
  const legacyOn = (label) => (n) => { seedLegacy([n, `${n}-co`], DEV); return DEV; };
  const preBase = [];
  const baseline = await scenario(H.BASE, "nb", (n) => { preBase.push(n); return DEV; }, async (n) => register(H.BASE, n, DEV));
  const l0 = logCount("hubW", /WOULD REJECT legacy key on register/);
  const n1 = await scenario(H.W, "n1", legacyOn("n1"));
  check("N.1", "old client, legacy name (dev-key), candidate warn hub: exit codes and stdout equal the same client on the ea9d057 hub; WOULD REJECT legacy logged; dev-key resolves to no name",
    { codes: codes(n1), baseline: codes(baseline), equal: sameScenario(n1, baseline), legacyLines: logCount("hubW", /WOULD REJECT legacy key on register/) - l0, dev: await whoami(H.W, DEV) },
    sameScenario(n1, baseline) && logCount("hubW", /WOULD REJECT legacy key on register/) > l0 && (await whoami(H.W, DEV)) === null);
  const n2 = await scenario(H.W, "n2", (n) => { seedLegacy([n, `${n}-co`], DEV); spawnSync(process.execPath, [join(CAND, "scripts", "hub-talk.mjs"), "--as", n, "--init-key"], { cwd: CAND, env: { ...process.env, HUB_URL: H.W, AGENT_KEY: undefined, A2A_KEY_DIR: join(TMP, "keys") } }); return DEV; });
  check("N.2", "old client, migrated name (dev-key), candidate warn hub: same equality; it cannot undo the migration", { codes: codes(n2), equal: sameScenario(n2, baseline) }, sameScenario(n2, baseline));
  const ownedKeys = {};
  const ownedBase = await scenario(H.BASE, "ob", (n) => (ownedKeys[n] = newKey()), async (n) => register(H.BASE, n, ownedKeys[n]));
  const ownedOld = await scenario(H.OW, "oo", (n) => (ownedKeys[n] = newKey()), async (n) => register(H.OW, n, ownedKeys[n]));
  check("B2.6", "old client with an owned key: the ea9d057 app on candidate functions gives the same exit codes and stdout as on ea9d057 functions",
    { codes: codes(ownedOld), baseline: codes(ownedBase), equal: sameScenario(ownedOld, ownedBase) }, sameScenario(ownedOld, ownedBase));
}

// ================================================================ N.3 hub-key check
{
  const [g, missing, dead] = ["chkgood", "chkmissing", "chkdead"].map(name);
  await hubTalk(["--as", g, "--init-key"], { hub: H.W });
  const deadFile = keyFile(dead, H.W); mkdirSync(join(deadFile, ".."), { recursive: true }); const dk = newKey(); writeFileSync(deadFile, dk + "\n");
  const c1 = await hubKey(["check", "--names", `${g},${missing}`, "--hub", H.W], { hub: H.W });
  const c2 = await hubKey(["check", "--names", `${g},${dead}`, "--hub", H.W], { hub: H.W });
  const c3 = await hubKey(["check", "--names", g, "--hub", H.W], { hub: H.W });
  const out = (r) => r.stdout + r.stderr;
  check("N.3", "hub-key check: a missing file -> non-zero + 'key file: no'; a dead key -> non-zero + whoami null; all good -> 0; prints no key or hash",
    { missing: c1.code, missingSays: /key file:? no/i.test(out(c1)), dead: c2.code, deadSays: /null/i.test(out(c2)), good: c3.code, shaped: keyShaped(out(c1) + out(c2) + out(c3)) },
    c1.code !== 0 && /key file:? no/i.test(out(c1)) && c2.code !== 0 && /null/i.test(out(c2)) && c3.code === 0 && !keyShaped(out(c1) + out(c2) + out(c3)));
}

// ================================================================ N.5a: key generation into a scratch A2A_KEY_DIR (start-stack's code path)
{
  const scratch = join(TMP, "n5-keys"); const realDir = join(homedir(), ".a2a-hub", "keys");
  const realBefore = existsSync(realDir) ? readdirSync(realDir, { recursive: true }).join("|") : "(absent)";
  await proxy.reset();
  const files = {};
  for (const n of ["alice", "bob"]) {
    const before = existsSync(join(scratch, "127.0.0.1-4550", `${n}.key`));
    const r = await client(CAND, "scripts/hub-key.mjs", ["init", "--as", n, "--hub", H.PROXY], { hub: H.PROXY, keyDir: scratch });
    const f = join(scratch, "127.0.0.1-4550", `${n}.key`);
    const k = existsSync(f) ? readFileSync(f, "utf8").trim() : ""; if (k) SECRETS.push(k);
    files[n] = { before, code: r.code, exists: existsSync(f), len: k.length, k };
  }
  const realAfter = existsSync(realDir) ? readdirSync(realDir, { recursive: true }).join("|") : "(absent)";
  const requests = (await proxy.log()).length;
  check("N.5a", "hub-key init (start-stack's path) for alice and bob into scratch: files absent before, present after, differ, >= 32 chars; real key dir listing unchanged; zero network requests",
    { alice: { before: files.alice.before, code: files.alice.code, exists: files.alice.exists, len: files.alice.len }, bob: { before: files.bob.before, code: files.bob.code, exists: files.bob.exists, len: files.bob.len }, differ: files.alice.k !== files.bob.k, realUnchanged: realBefore === realAfter, requests },
    !files.alice.before && !files.bob.before && files.alice.exists && files.bob.exists && files.alice.k !== files.bob.k && files.alice.len >= 32 && files.bob.len >= 32 && realBefore === realAfter && requests === 0);
  const ps = readFileSync(join(CAND, "start-stack.ps1"), "utf8").split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).join("\n");
  check("N.5a.static", "start-stack.ps1 code lines (comments excluded) hard-code no path under ~/.a2a-hub; the key dir comes from A2A_KEY_DIR or hub-key's default", { hardcodedInCode: /\.a2a-hub/.test(ps) }, !/\.a2a-hub/.test(ps));
}

// ================================================================ K5
{
  const empty = join(TMP, `k5-empty-${Date.now()}`); mkdirSync(empty, { recursive: true });
  const tsx = (args, o) => new Promise((resolve) => {
    const c = spawn(process.execPath, ["--import", "tsx", ...args], { cwd: CAND, env: { ...process.env, AGENT_KEY: undefined, A2A_KEY_DIR: empty, CONVEX_URL: CVX.A, POLL_MS: "1000", ...o.env }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = ""; c.stdout.on("data", (d) => (out += d)); c.stderr.on("data", (d) => (err += d));
    const t = setTimeout(() => c.kill(), o.timeoutMs ?? 30_000); c.on("close", (code) => { clearTimeout(t); resolve({ code, stdout: out, stderr: err }); });
  });
  const cases = {};
  await proxy.reset(); const ht = await client(CAND, "scripts/hub-talk.mjs", ["--as", name("k5"), "--say", "x"], { hub: H.PROXY, keyDir: empty }); cases.hubTalk = { code: ht.code, initKeyHint: /--init-key/.test(ht.stderr), requests: (await proxy.log()).length };
  await proxy.reset(); const dm = await tsx(["src/wrapper/daemon.ts", "--name", name("k5d"), "--persona", "qa"], { env: { HUB_URL: H.PROXY } }); cases.daemon = { code: dm.code, requests: (await proxy.log()).length };
  await proxy.reset(); const cp = await client(CAND, "scripts/a2a-compliance-probe.mjs", ["--base", H.PROXY], { hub: H.PROXY, keyDir: empty }); cases.probe = { code: cp.code, requests: (await proxy.log()).length };
  check("K5.2.no-key", "no AGENT_KEY and an empty key dir: hub-talk exit 1 naming --init-key; daemon and compliance probe non-zero; ZERO requests reach the proxy from any", cases,
    cases.hubTalk.code === 1 && cases.hubTalk.initKeyHint && cases.hubTalk.requests === 0 && cases.daemon.code !== 0 && cases.daemon.requests === 0 && cases.probe.code !== 0 && cases.probe.requests === 0);
  const peer = name("k5peer"); await register(H.W, peer, newKey());
  await proxy.reset();
  const asks = data("agents").filter((r) => r.name.startsWith("ask-")).map((r) => r._id);
  const aa = await client(CAND, "scripts/ask-agent.mjs", [peer, "qa question", "--timeout", "3"], { hub: H.PROXY, keyDir: empty, timeoutMs: 60_000 });
  const log = await proxy.log();
  const newAsk = data("agents").filter((r) => r.name.startsWith("ask-") && !asks.includes(r._id));
  check("K5.2.ask-agent", "ask-agent (ephemeral key): no request carries dev-key; its registered ask-<pid> row is owned; output carries no key-shaped run",
    { code: aa.code, requests: log.length, devKeyRequests: log.filter((e) => e.key?.devKey).length, askRows: newAsk.map((r) => r.keyStatus), shaped: keyShaped(aa.stdout + aa.stderr) },
    log.length > 0 && log.every((e) => !e.key?.devKey) && newAsk.length === 1 && newAsk[0].keyStatus === "owned" && !keyShaped(aa.stdout + aa.stderr));
  report("K5.2.not-run", "demo-loop.mjs needs two live daemons, and verify-client-stack.mjs hardcodes http://127.0.0.1:4000 (the main stack), so neither was run; both are checked statically (K5.1: no dev-key literal or fallback).");
  // 3. a different spelling of the same hub
  const sp = name("k5spell"); await hubTalk(["--as", sp, "--init-key"], { hub: H.W });
  const r3 = await hubTalk(["--as", sp, "--say", "x"], { hub: H.W.replace("127.0.0.1", "localhost") });
  check("K5.3", "key under 127.0.0.1-4510, HUB_URL spelled localhost:4510: exit 1, stderr names the other directory, no key contents", { code: r3.code, namesDir: /127\.0\.0\.1-4510/.test(r3.stderr), shaped: keyShaped(r3.stdout + r3.stderr) },
    r3.code === 1 && /127\.0\.0\.1-4510/.test(r3.stderr) && !keyShaped(r3.stdout + r3.stderr));
  // 1. static
  const ks = spawnSync(process.execPath, [join(process.cwd(), "keyscan.mjs"), CAND, "src", "scripts", "client", "--expect", "dev-key=0", "--expect", "fallback=0"], { encoding: "utf8" });
  check("K5.1", "static (S) over src/ scripts/ client/ at the candidate: dev-key 0 and fallback 0 on code lines (S validated at ea9d057: 7 and 4)",
    ks.stdout.split("\n").filter((l) => /known positive|by rule/.test(l)).join(" | "), ks.status === 0);
  const app = readFileSync(join(CAND, "client", "src", "App.svelte"), "utf8");
  const lsUses = [...app.matchAll(/localStorage\s*\./g)].map((m) => { const before = app.slice(Math.max(0, m.index - 200), m.index); const t = before.lastIndexOf("try"); return t >= 0 && !/\}\s*catch/.test(before.slice(t)); });
  check("K5.5/H4.1", "App.svelte: key field starts empty, input type=password, every localStorage access inside try; no key literal",
    { initialEmpty: /let agentKey\s*=\s*(""|'')/.test(app), password: /type="password"/.test(app), localStorage: lsUses.length, allInTry: lsUses.every(Boolean) },
    /let agentKey\s*=\s*(""|'')/.test(app) && /type="password"/.test(app) && lsUses.length > 0 && lsUses.every(Boolean));
}

// ================================================================ K2.4 / K2.5 / K2.7 (daemons) and K2.8 (interrupted --rotate-key)
{
  const daemon = (n, key, base, extra = {}) => {
    const c = spawn(process.execPath, ["--import", "tsx", "src/wrapper/daemon.ts", "--name", n, "--persona", "QA daemon. Reply: ack."], {
      cwd: CAND, env: { ...process.env, HUB_URL: base, AGENT_KEY: key, A2A_KEY_DIR: join(TMP, "keys"), CONVEX_URL: CVX.A, POLL_MS: "1000", ...extra }, stdio: ["ignore", "pipe", "pipe"],
    });
    appendFileSync(join(TMP, "pids.txt"), `${c.pid}\n`);
    let err = ""; c.stderr.on("data", (d) => (err += d)); c.stdout.on("data", (d) => (err += d));
    const exited = new Promise((r) => c.on("close", (code) => r({ code, at: Date.now() })));
    return { child: c, exited, log: () => err };
  };
  const hbOf = (n) => rowsOf(n)[0]?.lastHeartbeatAt ?? 0;
  for (const [row, base, want] of [["K2.4", H.S, { code: 1, re: /key rejected for/ }], ["K2.5", H.W, { code: 0, re: /superseded/ }]]) {
    const n = name(row === "K2.4" ? "k2ds" : "k2dw"); const k0 = newKey(), k1 = newKey();
    await register(H.W, n, k0);
    const d = daemon(n, k0, base);
    await sleep(6000); const hb1 = hbOf(n); await sleep(3000); const hb2 = hbOf(n);
    const alive = hb2 > hb1;
    const t0 = Date.now(); const rr = await rotate(base, k0, k1);
    const ex = await Promise.race([d.exited, sleep(30_000).then(() => null)]);
    if (!ex) d.child.kill();
    check(row, `${row === "K2.4" ? "strict" : "warn"}: a daemon shown heartbeating first; after a rotation from another process it exits ${want.code} (${want.re.source}) within two intervals, no retry loop, no key in its output`,
      { heartbeating: alive, rotate: rr.status, exit: ex?.code ?? "did not exit in 30 s", secs: ex ? Math.round((ex.at - t0) / 1000) : null, message: want.re.test(d.log()), shaped: keyShaped(d.log()) },
      alive && rr.status === 200 && ex && ex.code === want.code && want.re.test(d.log()) && (ex.at - t0) <= 15_000 && !keyShaped(d.log()));
    if (row === "K2.4") {
      const d2 = daemon(n, k1, H.S);
      await sleep(50_000);
      const r = rowsOf(n)[0]; const ok = Date.now() - (r?.lastHeartbeatAt ?? 0) < 5000;
      d2.child.kill(); await d2.exited;
      check("K2.7", "a new daemon started with k1 after the rotation registers and heartbeats (lease taken) within 60 s", { recentHeartbeat: ok, alive: !/key rejected/.test(d2.log()) }, ok && !/key rejected/.test(d2.log()));
    }
  }
  // K2.8: interrupted --rotate-key through X (forward-then-drop)
  const n = name("k2int");
  const ik = await hubTalk(["--as", n, "--init-key"], { hub: H.PROXY });
  const k0 = keyOf(n, H.PROXY);
  await proxy.reset(); await proxy.mode({ rotate: "forward-then-drop" });
  const rk = await hubTalk(["--as", n, "--rotate-key"], { hub: H.PROXY });
  await proxy.reset();
  const nextF = keyFile(n, H.PROXY) + ".next";
  const nextK = existsSync(nextF) ? readFileSync(nextF, "utf8").trim() : null; if (nextK) SECRETS.push(nextK);
  const mid = { rotateExit: rk.code, nextExists: !!nextK, nextResolves: nextK ? await whoami(H.W, nextK) : null, oldResolves: await whoami(H.W, k0) };
  const rec = await hubTalk(["--as", n, "--session", "no-such-session", "--inbox"], { hub: H.PROXY });
  const k2 = keyOf(n, H.PROXY);
  const after = { note: /promot|recover|\.next/i.test(rec.stderr), keyResolves: await whoami(H.W, k2), nextLeft: existsSync(nextF), shaped: keyShaped(ik.stderr + rk.stdout + rk.stderr + rec.stdout + rec.stderr) };
  check("K2.8", "interrupted --rotate-key: the hub commits, the client sees a socket error, .next resolves to the name; the next command promotes it with a stderr note; .key resolves; no .next left; no key printed",
    { ...mid, ...after }, ik.code === 0 && rk.code !== 0 && mid.nextExists && mid.nextResolves === n && after.note && after.keyResolves === n && !after.nextLeft && !after.shaped);
}

process.exit(finish("rows-c") ? 1 : 0);
