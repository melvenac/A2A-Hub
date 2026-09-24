// Validates H and X against known positives before either counts as an instrument.
// Runs against any hub; on master code /reads and /read do not exist (404).
// QA_HUB=<proxy> QA_HUB_DIRECT=<hub> QA_CONVEX=... QA_TMP=... QA_HUBTALK=<path to hub-talk.mjs> node selftest.mjs
import { existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { talk, hub, key, asSeat, messages, register, room, cursorFile, check, results, DIRECT, HUB } from "./harness.mjs";

const HT = process.env.QA_HUBTALK;
if (!HT || !existsSync(HT)) throw new Error("QA_HUBTALK must name an existing hub-talk.mjs");
const mode = (m) => hub("POST", "/__qa/mode", m, { base: HUB });
await hub("POST", "/__qa/reset", {}, { base: HUB });
if (HUB === DIRECT) throw new Error("selftest needs QA_HUB = the proxy and QA_HUB_DIRECT = the hub");

const tag = Date.now().toString(36);
const A = `qa-st-a-${tag}`, B = `qa-st-b-${tag}`;
await register(A); await register(B);
const sid = await room([A, B], "qa-selftest");

// H: talk runs hub-talk; the cursor lands in QA_TMP and not in the real temp dir.
const realTmpBefore = readdirSync(tmpdir()).filter((f) => f.includes(B)).length;
const say1 = await talk(HT, ["--as", A, "--session", sid, "--say", "t1"], { hub: DIRECT, env: { AGENT_KEY: key(A) } });
const wait1 = await talk(HT, ["--as", B, "--session", sid, "--wait", "--wait-timeout", "10"], { hub: DIRECT, env: { AGENT_KEY: key(B) } });
check("H.talk", "--say exits 0; --wait exits 0 and prints t1", { say: say1.code, wait: wait1.code, out: wait1.stdout.trim() }, say1.code === 0 && wait1.code === 0 && wait1.stdout.includes("t1"));
check("H.tmp", "cursor file in QA_TMP (known positive), none in real temp", { qa: existsSync(cursorFile(B, sid)), real: readdirSync(tmpdir()).filter((f) => f.includes(B)).length - realTmpBefore }, existsSync(cursorFile(B, sid)) && readdirSync(tmpdir()).filter((f) => f.includes(B)).length === realTmpBefore);
const to = await talk(HT, ["--as", B, "--session", sid, "--wait", "--wait-timeout", "3"], { hub: DIRECT, env: { AGENT_KEY: key(B) } });
check("H.exit2", "--wait with no new turn exits 2", to.code, to.code === 2);

// X pass-through: identical to direct.
await talk(HT, ["--as", A, "--session", sid, "--say", "t2"], { hub: HUB, env: { AGENT_KEY: key(A) } });
const viaDirect = await talk(HT, ["--as", B, "--session", sid, "--inbox"], { hub: DIRECT, env: { AGENT_KEY: key(B) } });
const viaProxy = await talk(HT, ["--as", B, "--session", sid, "--inbox"], { hub: HUB, env: { AGENT_KEY: key(B) } });
check("X.pass", "--inbox through the proxy == direct (stdout, stderr, exit)", { direct: [viaDirect.code, viaDirect.stdout.length], proxy: [viaProxy.code, viaProxy.stdout.length] },
  viaDirect.code === viaProxy.code && viaDirect.stdout === viaProxy.stdout && viaDirect.stderr === viaProxy.stderr);
const msgs = await messages(sid, A);
check("X.pass.turns", "both turns stored once each via proxy and direct", msgs.map((m) => m.content), msgs.length === 2 && msgs[1].content === "t2");

// X faults fire (known positive): reads 500 through proxy while direct gives its own answer.
const directReads = await hub("GET", `/a2a/session/${sid}/reads`, undefined, { headers: asSeat(A) });
await mode({ reads: "500" });
const proxReads = await hub("GET", `/a2a/session/${sid}/reads`, undefined, { base: HUB, headers: asSeat(A) });
check("X.500", "reads=500 answers 500 through proxy; direct unaffected", { direct: directReads.status, proxy: proxReads.status }, proxReads.status === 500 && directReads.status !== 500);
await mode({ read: "drop" });
let dropped;
try { await hub("POST", `/a2a/session/${sid}/read`, { reader: B, throughTurn: 1, via: "wait" }, { base: HUB, headers: asSeat(B) }); dropped = "answered"; } catch (e) { dropped = `socket error (${e.cause?.code ?? e.message})`; }
check("X.drop", "read=drop destroys the socket", dropped, dropped.startsWith("socket error"));
await mode({ read: "delay:2000" });
const t0 = Date.now(); await hub("POST", `/a2a/session/${sid}/read`, { reader: B, throughTurn: 1, via: "wait" }, { base: HUB, headers: asSeat(B) });
check("X.delay", "read=delay:2000 holds the request >= 2 s", Date.now() - t0, Date.now() - t0 >= 2000);
await mode({ read: "inject", inject: { from: A, content: "qa injected turn" } });
await hub("POST", `/a2a/session/${sid}/read`, { reader: B, throughTurn: 2, via: "inbox" }, { base: HUB, headers: asSeat(B) });
const after = await messages(sid, A);
check("X.inject", "read=inject lands one new turn from A before forwarding", after.map((m) => `${m.turn}:${m.from}:${m.content}`), after.length === 3 && after[2].content === "qa injected turn" && after[2].from === A);
await hub("POST", "/__qa/reset", {}, { base: HUB });

const failed = results.filter((r) => !r.pass).length;
console.log(`\nselftest: ${results.length - failed}/${results.length} pass`);
process.exit(failed ? 1 : 0);
