// Loop 1 acceptance rows A1, A2, A3 (dynamic part), A5, A7 against the running candidate.
// QA_HUB=<proxy :4420> QA_HUB_DIRECT=<hub :4410> QA_CONVEX=<:3410> QA_TMP=... QA_TREE=<candidate tree>
//   node rows.mjs [A1 A2 A3 A5 A7]      (default: all)
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { talk, hub, reads, messages, cq, cursorFile, sha256OrAbsent, check, results, HUB, DIRECT } from "./harness.mjs";

const TREE = process.env.QA_TREE;
if (!TREE) throw new Error("QA_TREE must be set");
const HT = join(TREE, "scripts", "hub-talk.mjs");
const HT_OVERRIDE = process.env.QA_HUBTALK || HT; // M5 swaps in a mutant hub-talk
const want = new Set(process.argv.slice(2).length ? process.argv.slice(2) : ["A1", "A2", "A3", "A5", "A7"]);
const tag = Date.now().toString(36);
const key = (n) => `${n}-key`;
const asSeat = (n) => ({ "X-Agent-Key": key(n) });
const reg = (n, card) => hub("POST", "/a2a/register", { name: n, apiKey: key(n), agentCard: card ?? { name: n, description: `QA ${n}`, kind: "ide-session" } });
const newRoom = async (ps, title = "qa-room") => {
  const r = await hub("POST", "/a2a/session", { title, participants: ps, maxTurns: 500 }, { headers: asSeat(ps[0]) });
  if (r.status !== 200) throw new Error(`room ${r.status} ${r.text}`);
  return r.json.sessionId;
};
const say = (n, sid, text, opts = {}) => talk(HT_OVERRIDE, ["--as", n, "--session", sid, "--say", text], { env: { AGENT_KEY: key(n) }, hub: DIRECT, ...opts });
const wait = (n, sid, secs = 15, opts = {}) => talk(HT_OVERRIDE, ["--as", n, "--session", sid, "--wait", "--wait-timeout", String(secs)], { env: { AGENT_KEY: key(n) }, hub: DIRECT, ...opts });
const inbox = (n, sid, opts = {}) => talk(HT_OVERRIDE, ["--as", n, "--session", sid, "--inbox"], { env: { AGENT_KEY: key(n) }, hub: DIRECT, ...opts });
const P = (r, n) => r.participant(n);
const turns = (p) => (p?.unread ?? []).map((u) => u.turn);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const marks = (r) => Object.fromEntries((r.json?.participants ?? []).map((p) => [p.name, p.lastRead]));
const proxyMode = (m) => hub("POST", "/__qa/mode", m, { base: HUB });
const proxyReset = () => hub("POST", "/__qa/reset", {}, { base: HUB });

function convexData(table) {
  const r = spawnSync(process.execPath, [join(TREE, "node_modules", "convex", "bin", "main.js"), "data", table, "--format", "jsonLines", "--limit", "10000"], { cwd: TREE, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`convex data ${table}: ${r.stderr}`);
  return r.stdout.split(/\r?\n/).filter((l) => l.trim().startsWith("{")).map((l) => JSON.parse(l));
}

// ---------------------------------------------------------------- A1
if (want.has("A1")) {
  const [a, b, c] = ["a", "b", "c"].map((x) => `qa-a1${x}-${tag}`);
  for (const n of [a, b, c]) await reg(n);
  const sid = await newRoom([a, b, c], "qa-A1");
  const s1 = await say(a, sid, "A1 turn one");
  const m1 = (await messages(sid)).find((m) => m.turn === 1);
  let r = await reads(sid);
  check("A1.1a", "sender's --say exits 0 and reports turn 1", { code: s1.code, err: s1.stderr.trim().split("\n").pop() }, s1.code === 0 && /sent turn 1/.test(s1.stderr));
  check("A1.1b", "B never read: lastRead is null (not turn 0)", P(r, b)?.lastRead, P(r, b)?.lastRead === null);
  check("A1.1c", "B.unread has turn 1 with sentAt == createdAt from /messages", { unread: P(r, b)?.unread, createdAt: m1.createdAt }, P(r, b)?.unread?.some((u) => u.turn === 1 && u.sentAt === m1.createdAt && u.from === a));
  check("A1.1d", "C likewise: null, turn 1 unread since createdAt", P(r, c), P(r, c)?.lastRead === null && P(r, c)?.unread?.some((u) => u.turn === 1 && u.sentAt === m1.createdAt));
  check("A1.1e", "sender A: own turn not unread; A's mark still null after --say", P(r, a), P(r, a)?.lastRead === null && !turns(P(r, a)).includes(1));
  const cBefore = P(r, c);
  const w = await wait(b, sid);
  check("A1.2", "B --wait exits 0 and prints turn 1", { code: w.code, out: w.stdout.trim() }, w.code === 0 && w.stdout.includes("A1 turn one"));
  r = await reads(sid);
  check("A1.3a", "after B --wait: B.lastRead = {turn 1, via wait, at >= createdAt}", P(r, b)?.lastRead, P(r, b)?.lastRead?.turn === 1 && P(r, b)?.lastRead?.via === "wait" && P(r, b)?.lastRead?.at >= m1.createdAt);
  check("A1.3b", "turn 1 gone from B.unread (was present before)", turns(P(r, b)), !turns(P(r, b)).includes(1));
  check("A1.3c", "C unchanged by B's mark", P(r, c), eq(P(r, c), cBefore));
  await say(a, sid, "A1 turn two");
  r = await reads(sid);
  check("A1.4", "read-through-1 vs never-read distinguishable by value", { b: [P(r, b)?.lastRead?.turn, turns(P(r, b))], c: [P(r, c)?.lastRead, turns(P(r, c))] },
    P(r, b)?.lastRead?.turn === 1 && eq(turns(P(r, b)), [2]) && P(r, c)?.lastRead === null && eq(turns(P(r, c)), [1, 2]));
  await say(c, sid, "A1 turn three from C");
  await say(b, sid, "A1 turn four from B");
  r = await reads(sid);
  const msgs = await messages(sid);
  const byTurn = new Map(msgs.map((m) => [m.turn, m]));
  const all = (r.json?.participants ?? []).flatMap((p) => p.unread.map((u) => ({ ...u, who: p.name })));
  const mismatches = all.filter((u) => byTurn.get(u.turn)?.from !== u.from || byTurn.get(u.turn)?.createdAt !== u.sentAt);
  check("A1.5a", "every unread {turn, from, sentAt} matches /messages", { checked: all.length, mismatches }, all.length > 0 && mismatches.length === 0);
  check("A1.5b", "no participant has its own turn unread", all.filter((u) => u.from === u.who), all.every((u) => u.from !== u.who));
  check("A1.5c", "turnCount equals number of messages", { turnCount: r.json?.turnCount, messages: msgs.length }, r.json?.turnCount === msgs.length);
}

// ---------------------------------------------------------------- A2
if (want.has("A2")) {
  const [a, b] = ["a", "b"].map((x) => `qa-a2${x}-${tag}`);
  for (const n of [a, b]) await reg(n);
  const sid = await newRoom([a, b], "qa-A2");
  await say(a, sid, "A2 t1");
  await wait(b, sid); // cursor K = 1, mark 1 via wait
  await say(a, sid, "A2 t2");
  await say(a, sid, "A2 t3");
  const cf = cursorFile(b, sid);
  const shaBefore = sha256OrAbsent(cf);
  const cursorBefore = shaBefore === "absent" ? null : readFileSync(cf, "utf8").trim();
  const ib = await inbox(b, sid);
  let r = await reads(sid);
  check("A2.1", "--inbox exits 0, prints whole room, stderr 'unread after turn 1 (cursor unchanged)'", { code: ib.code, cursor: cursorBefore, err: ib.stderr.split("\n").filter((l) => /unread after/.test(l)) },
    ib.code === 0 && ["A2 t1", "A2 t2", "A2 t3"].every((t) => ib.stdout.includes(t)) && /unread after turn 1 \(cursor unchanged\)/.test(ib.stderr));
  check("A2.2", "B.lastRead = {turn 3, via inbox}", P(r, b)?.lastRead, P(r, b)?.lastRead?.turn === 3 && P(r, b)?.lastRead?.via === "inbox");
  check("A2.3a", "cursor file byte-identical across --inbox", { before: shaBefore, after: sha256OrAbsent(cf) }, shaBefore !== "absent" && shaBefore === sha256OrAbsent(cf));
  const markAfterInbox = P(r, b)?.lastRead;
  const rw = await wait(b, sid);
  r = await reads(sid);
  check("A2.4a", "next --wait replays turns 2-3", { code: rw.code, out: rw.stdout.trim() }, rw.code === 0 && rw.stdout.includes("A2 t2") && rw.stdout.includes("A2 t3"));
  check("A2.4b", "mark unchanged by the replay (monotonic; still inbox, same at)", { before: markAfterInbox, after: P(r, b)?.lastRead }, eq(markAfterInbox, P(r, b)?.lastRead));

  // absent cursor stays absent
  const [c, d] = ["c", "d"].map((x) => `qa-a2${x}-${tag}`);
  for (const n of [c, d]) await reg(n);
  const sid2 = await newRoom([c, d], "qa-A2-absent");
  await say(c, sid2, "A2 absent t1");
  const before2 = sha256OrAbsent(cursorFile(d, sid2));
  await inbox(d, sid2);
  const r2 = await reads(sid2);
  check("A2.3b", "absent cursor stays absent across --inbox, mark still recorded", { before: before2, after: sha256OrAbsent(cursorFile(d, sid2)), mark: P(r2, d)?.lastRead }, before2 === "absent" && sha256OrAbsent(cursorFile(d, sid2)) === "absent" && P(r2, d)?.lastRead?.turn === 1);

  // A2.5 mark covers what was printed, not what the room holds (inject between print and mark)
  for (const mode of ["inbox", "wait"]) {
    const [e, f] = ["e", "f"].map((x) => `qa-a2${x}${mode}-${tag}`);
    for (const n of [e, f]) await reg(n);
    const sid3 = await newRoom([e, f], `qa-A2-inject-${mode}`);
    await say(e, sid3, `A2 ${mode} printed`);
    await proxyMode({ read: "inject", inject: { from: e, content: `A2 ${mode} INJECTED` } });
    const run = mode === "inbox" ? await inbox(f, sid3, { hub: HUB }) : await wait(f, sid3, 15, { hub: HUB });
    await proxyReset();
    const r3 = await reads(sid3);
    const msgs3 = await messages(sid3);
    check(`A2.5-${mode}`, `${mode}: injected turn 2 landed after print; mark = 1, turn 2 unread`, { code: run.code, printedInjected: run.stdout.includes("INJECTED"), turns: msgs3.length, mark: P(r3, f)?.lastRead, unread: turns(P(r3, f)) },
      run.code === 0 && !run.stdout.includes("INJECTED") && msgs3.length === 2 && P(r3, f)?.lastRead?.turn === 1 && eq(turns(P(r3, f)), [2]));
  }

  // A2.6 direct POST guards, each checked in /reads
  const [g, h, x] = ["g", "h", "x"].map((y) => `qa-a2${y}-${tag}`);
  for (const n of [g, h, x]) await reg(n);
  const sid4 = await newRoom([g, h], "qa-A2-guards");
  for (const t of [1, 2, 3]) await say(g, sid4, `A2 guard t${t}`);
  const post = (body, sidX = sid4, headers = asSeat(h)) => hub("POST", `/a2a/session/${sidX}/read`, body, { headers });
  const markOf = async () => P(await reads(sid4), h)?.lastRead ?? null;
  let p = await post({ reader: h, throughTurn: 2, via: "wait" });
  let m = await markOf();
  check("A2.6a", "valid forward mark: 200 and the mark moves to 2", { status: p.status, body: p.json, mark: m }, p.status === 200 && m?.turn === 2);
  const cases = [
    ["lower", { reader: h, throughTurn: 1, via: "wait" }, (s, j) => s === 200 && j?.readThroughTurn === 2 && j?.advanced === false],
    ["past-end", { reader: h, throughTurn: 4, via: "wait" }, (s) => s === 400],
    ["zero", { reader: h, throughTurn: 0, via: "wait" }, (s) => s === 400],
    ["negative", { reader: h, throughTurn: -1, via: "wait" }, (s) => s === 400],
    ["non-integer", { reader: h, throughTurn: 2.5, via: "wait" }, (s) => s === 400],
    ["string-num", { reader: h, throughTurn: "3x", via: "wait" }, (s) => s === 400],
    ["bad-via", { reader: h, throughTurn: 3, via: "daemon" }, (s) => s === 400],
    ["no-reader", { throughTurn: 3, via: "wait" }, (s) => s === 400],
    ["non-member", { reader: x, throughTurn: 3, via: "wait" }, (s) => s === 404],
    ["unregistered", { reader: `qa-nobody-${tag}`, throughTurn: 3, via: "wait" }, (s) => s === 404],
  ];
  for (const [name, body, ok] of cases) {
    const before = await markOf();
    p = await post(body);
    const after = await markOf();
    check(`A2.6-${name}`, `${name}: expected status, mark unchanged`, { status: p.status, body: p.json, mark: after?.turn }, ok(p.status, p.json) && eq(before, after));
  }
  // unknown session: a well-formed id from another table, and a malformed string
  const otherTableId = convexData("peers").find((row) => row.name === h)?._id;
  for (const [name, sidX] of [["unknown-session-other-table-id", otherTableId], ["unknown-session-garbage", "not-a-session-id"]]) {
    const before = await markOf();
    p = await post({ reader: h, throughTurn: 1, via: "wait" }, sidX);
    const rr = await hub("GET", `/a2a/session/${sidX}/reads`);
    check(`A2.6-${name}`, `${name}: POST /read 4xx (criterion), mark unchanged`, { post: p.status, postErr: String(p.json?.error ?? p.text).split("\n")[0].slice(0, 120), reads: rr.status }, p.status >= 400 && p.status < 500 && eq(before, await markOf()));
  }
}

// ---------------------------------------------------------------- A3 (dynamic, unmutated candidate; per-seat keys and dev-key)
if (want.has("A3")) {
  const [a, b, d] = ["a", "b", "d"].map((x) => `qa-a3${x}-${tag}`);
  for (const n of [a, b]) await reg(n);
  await reg(d, { name: d, description: "QA daemon member", kind: "repo-daemon" });
  const sid = await newRoom([a, b, d], "qa-A3");
  await say(a, sid, `A3 unread by b. @${d} reply ack`);
  const snapRaw = (await reads(sid)).text;
  const snapMarks = marks(await reads(sid));
  const gets = [`/a2a/session/${sid}/messages`, `/a2a/session/${sid}/messages?after=0`, `/a2a/session/${sid}/messages?since=0`, "/a2a/sessions", `/a2a/peer/${b}/sessions`, "/a2a/agents/live", "/a2a/agents/live?kind=ide-session", "/health", `/a2a/queue/${b}`, "/.well-known/agent-card.json", `/a2a/session/${sid}/reads`];
  const seen = [];
  for (const headers of [asSeat(b), { "X-Agent-Key": "dev-key" }, {}]) {
    for (const g of gets) seen.push(`${(await hub("GET", g, undefined, { headers })).status} ${headers["X-Agent-Key"] ?? "no-key"} ${g.replace(sid, ":sid")}`);
  }
  await cq("messages:list", { sessionId: sid }); // the web client's path: a Convex query
  let r = await reads(sid);
  check("A3.1", "every GET route (B's key, dev-key, no key) + messages:list query: /reads byte-identical", { requests: seen.length, identical: r.text === snapRaw, sample: seen.slice(0, 3) }, r.text === snapRaw && P(r, b)?.lastRead === null);
  writeFileSync(join(process.env.QA_TMP, `A3-gets-${tag}.txt`), seen.join("\n"));

  // daemon as a room member, >= 3 poll intervals
  const dlog = [];
  const daemon = spawn(process.execPath, ["--import", "tsx", "src/wrapper/daemon.ts", "--name", d, "--persona", "You are a QA test daemon. Reply with the single word: ack."], {
    cwd: TREE, env: { ...process.env, HUB_URL: DIRECT, AGENT_KEY: key(d), POLL_MS: "1000", CONVEX_URL: process.env.QA_CONVEX }, stdio: ["ignore", "pipe", "pipe"],
  });
  daemon.stdout.on("data", (x) => dlog.push(String(x))); daemon.stderr.on("data", (x) => dlog.push(String(x)));
  await new Promise((res) => setTimeout(res, 12_000));
  spawnSync("taskkill", ["/F", "/T", "/PID", String(daemon.pid)]);
  r = await reads(sid);
  const msgsAfter = await messages(sid);
  const daemonSpoke = msgsAfter.some((m2) => m2.from === d);
  check("A3.2", "daemon member polled >= 3 intervals: no participant's mark moved", { before: snapMarks, after: marks(r), daemonReplied: daemonSpoke, turns: msgsAfter.length, daemonLog: dlog.join("").split("\n").filter(Boolean).slice(0, 4) },
    eq(snapMarks, marks(r)));
  check("A3.2b", "daemon actually read the room (known positive: it replied, or its log shows the poll)", { daemonReplied: daemonSpoke }, daemonSpoke);
}

// ---------------------------------------------------------------- A5
if (want.has("A5")) {
  const [a, b] = ["a", "b"].map((x) => `qa-a5${x}-${tag}`);
  const card = { name: b, description: "QA distinctive card for A5", kind: "qa-distinct" };
  await reg(b, card);
  const one = (rows, n) => { const f = rows.filter((row) => row.name === n); if (f.length !== 1) throw new Error(`${n}: ${f.length} rows`); return f[0]; };
  const snap = () => {
    const ag = one(convexData("agents"), b), pe = one(convexData("peers"), b);
    const online = convexData("messages").filter((m) => String(m.content).includes(`Agent ${b} is now online`)).length;
    return { agent: { agentCard: ag.agentCard, apiKeyHash: ag.apiKeyHash, lastSeen: ag.lastSeen, status: ag.status, activeInstanceId: ag.activeInstanceId ?? null }, peer: { metadata: pe.metadata ?? null, type: pe.type, isActive: pe.isActive }, online };
  };
  const s0 = snap();
  check("A5.0", "distinctive card present BEFORE the --peer call (known positive)", s0.agent.agentCard, s0.agent.agentCard?.kind === "qa-distinct");
  const run1 = await talk(HT_OVERRIDE, ["--as", a, "--peer", b, "--say", "A5 hello"], { env: { AGENT_KEY: key(a) }, hub: DIRECT });
  const s1 = snap();
  check("A5.2", "--peer (no room yet): exit 0, B's whole row + peer row + online count unchanged", { code: run1.code, changed: Object.keys(s0).filter((k) => !eq(s0[k], s1[k])), after: s1.agent.agentCard },
    run1.code === 0 && eq(s0, s1));
  const run2 = await talk(HT_OVERRIDE, ["--as", a, "--peer", b, "--say", "A5 again"], { env: { AGENT_KEY: key(a) }, hub: DIRECT });
  const s2 = snap();
  const sidOf = (t) => (t.stderr.match(/session (\S+)/) || [])[1];
  const rooms = convexData("sessions").filter((s) => s.title === "cursor-to-cursor");
  const abRooms = rooms.filter((s) => { const members = convexData("sessionPeers").filter((sp) => sp.sessionId === s._id).length; return [sidOf(run1), sidOf(run2)].includes(s._id) && members === 2; });
  check("A5.3", "--peer with the room existing: same room reused, B unchanged", { code: run2.code, room1: sidOf(run1), room2: sidOf(run2), abRooms: abRooms.length }, run2.code === 0 && sidOf(run1) && sidOf(run1) === sidOf(run2) && eq(s0, s2));
  const ghost = `qa-never-registered-${tag}`;
  const counts = () => ({ agents: convexData("agents").filter((x) => x.name === ghost).length, peers: convexData("peers").filter((x) => x.name === ghost).length, sessions: convexData("sessions").length, sessionPeers: convexData("sessionPeers").length });
  const c0 = counts();
  const run3 = await talk(HT_OVERRIDE, ["--as", a, "--peer", ghost, "--say", "A5 to nobody"], { env: { AGENT_KEY: key(a) }, hub: DIRECT });
  const c1 = counts();
  check("A5.4", "--peer <unregistered>: exit 1, stderr names --as and --session, nothing created", { code: run3.code, err: run3.stderr.trim().split("\n").pop(), before: c0, after: c1 },
    run3.code === 1 && /--as/.test(run3.stderr) && /--session/.test(run3.stderr) && eq(c0, c1) && c1.agents === 0 && c1.peers === 0);
}

// ---------------------------------------------------------------- A7 (text)
if (want.has("A7")) {
  const collapse = (s) => s.replace(/\s+/g, " ");
  const doc = collapse(readFileSync(join(TREE, "docs", "joining-the-hub.md"), "utf8"));
  const headerRaw = readFileSync(HT, "utf8").split("*/")[0];
  const header = collapse(headerRaw);
  const R1 = "`hub-talk` marks a turn read when it prints it. Run `--inbox` or `--wait` only where its output reaches the agent. A process whose output the agent never sees must not run them.";
  const R2 = "Never run `--wait` or `--inbox` just to advance past turns; every run's output must be read.";
  check("A7.R1-doc", "R1 verbatim in joining-the-hub.md", doc.includes(R1), doc.includes(R1));
  check("A7.R2-doc", "R2 verbatim in joining-the-hub.md", { exact: doc.includes(R2), colonVariant: doc.includes(R2.replace("turns;", "turns:")) }, doc.includes(R2));
  check("A7.R1-header", "R1 verbatim in hub-talk.mjs header", header.includes(R1), header.includes(R1));
  check("A7.R2-header", "R2 verbatim in hub-talk.mjs header", header.includes(R2), header.includes(R2));
  // Secondary, reported not judged: the same after stripping comment markers and backticks.
  const loose = (s) => collapse(s.replace(/^\s*\*\s?/gm, " ").replace(/`/g, ""));
  console.log(`      info: header matches with comment markers + backticks stripped: R1=${loose(headerRaw).includes(loose(R1))} R2=${loose(headerRaw).includes(loose(R2))}`);
  for (const L of ["L1", "L2", "L3", "L4", "L5"]) {
    const inDoc = new RegExp(`\\b${L}\\b`).test(doc), inHeader = new RegExp(`\\b${L}\\b`).test(header);
    check(`A7.${L}`, `${L} present in the doc and in the hub-talk header`, { doc: inDoc, header: inHeader }, inDoc && inHeader);
  }
}

const failed = results.filter((x) => !x.pass);
writeFileSync(join(process.env.QA_TMP, `rows-${[...want].join("")}-${tag}.json`), JSON.stringify({ tag, tree: TREE, hubtalk: HT_OVERRIDE, results }, null, 1));
console.log(`\n${[...want].join(",")}: ${results.length - failed.length}/${results.length} pass; failed: ${failed.map((f) => f.row).join(", ") || "none"}`);
process.exit(failed.length ? 1 : 0);
