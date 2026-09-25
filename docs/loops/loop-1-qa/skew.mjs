// A4: version skew. New = candidate hub-talk; old = 2eb7928 hub-talk (whole scripts/ dir).
// QA_NEW_HT, QA_OLD_HT, and hubs: QA_H_NEW(4410 new/new) QA_H_OLDAPP_NEWCVX(4430) QA_H_OLD(4431) QA_H_NEWAPP_OLDCVX(4432)
// plus the proxy QA_HUB(4420 -> 4410) for (e)/(f).
import { talk, hub, key, asSeat, check, results } from "./harness.mjs";
const NEW = process.env.QA_NEW_HT, OLD = process.env.QA_OLD_HT;
const H = { newnew: process.env.QA_H_NEW, oldApp_newCvx: process.env.QA_H_OLDAPP_NEWCVX, old: process.env.QA_H_OLD, newApp_oldCvx: process.env.QA_H_NEWAPP_OLDCVX, proxy: process.env.QA_HUB };
for (const [k, v] of Object.entries({ NEW, OLD, ...H })) if (!v) throw new Error(`missing ${k}`);
const tag = Date.now().toString(36);

// Known positives: each hub is what it claims to be, told apart by behaviour. The probes carry a
// registered seat's key, so they reach the route rather than stopping at auth.
const prober = `qa-sk-probe-${tag}`;
for (const base of [H.newnew, H.oldApp_newCvx, H.old, H.newApp_oldCvx]) await hub("POST", "/a2a/register", { name: prober, apiKey: key(prober), agentCard: { name: prober, description: `QA ${prober}`, kind: "ide-session" } }, { base });
const probe = async (base) => (await hub("GET", "/a2a/session/not-a-session/reads", undefined, { base, headers: asSeat(prober) })).status;
const ident = { newnew: await probe(H.newnew), oldApp_newCvx: await probe(H.oldApp_newCvx), old: await probe(H.old), newApp_oldCvx: await probe(H.newApp_oldCvx) };
const routeAbsent = async (base) => /Cannot GET/.test((await hub("GET", "/a2a/session/x/reads", undefined, { base, headers: asSeat(prober) })).text);
const absent = { newnew: await routeAbsent(H.newnew), oldApp_newCvx: await routeAbsent(H.oldApp_newCvx), old: await routeAbsent(H.old), newApp_oldCvx: await routeAbsent(H.newApp_oldCvx) };
check("A4.ident", "hub identities by behaviour: /reads route absent on old apps, present on new apps", { absent, status: ident },
  !absent.newnew && absent.oldApp_newCvx && absent.old && !absent.newApp_oldCvx);

function norm(s, names) {
  let out = s;
  for (const [n, rep] of names) out = out.split(n).join(rep);
  return out.replace(/session [a-z0-9]{20,}/g, "session <SID>").replace(/\r/g, "");
}
const ALLOWED = [/^\[hub-talk\] read receipt not recorded \(.*\)$/, /^\[hub-talk\] read receipts unavailable from this hub \(.*\)$/, /^\[hub-talk\] turn \d+ \(yours\): unread by .*$/];
const stripAllowed = (s) => s.split("\n").filter((l) => !ALLOWED.some((re) => re.test(l))).join("\n");

async function scenario(script, base, label) {
  const a = `qa-sk-${label}-a-${tag}`, b = `qa-sk-${label}-b-${tag}`;
  for (const n of [a, b]) await hub("POST", "/a2a/register", { name: n, apiKey: key(n), agentCard: { name: n, description: `QA ${n}`, kind: "ide-session" } }, { base });
  const sid = (await hub("POST", "/a2a/session", { title: "qa-skew", participants: [a, b], maxTurns: 500 }, { base, headers: { "X-Agent-Key": key(a) } })).json.sessionId;
  const run = (n, args) => talk(script, ["--as", n, ...args], { hub: base, env: { AGENT_KEY: key(n) } });
  const steps = [
    ["say", await run(a, ["--session", sid, "--say", "skew one"])],
    ["wait", await run(b, ["--session", sid, "--wait", "--wait-timeout", "15"])],
    ["inbox-b", await run(b, ["--session", sid, "--inbox"])],
    ["inbox-a", await run(a, ["--session", sid, "--inbox"])],
    ["wait-timeout", await run(b, ["--session", sid, "--wait", "--wait-timeout", "3"])],
    ["peer-say", await run(a, ["--peer", b, "--say", "skew two"])],
    ["peer-wait", await run(b, ["--peer", a, "--wait", "--wait-timeout", "15"])],
    ["usage", await talk(script, ["--say", "no name"], { hub: base })],
  ];
  const names = [[a, "<A>"], [b, "<B>"]];
  return { sid, a, b, steps: steps.map(([k, r]) => ({ k, code: r.code, out: norm(r.stdout, names), err: norm(r.stderr, names), ms: r.ms })) };
}
const same = (x, y, { stderrStrict }) => x.steps.every((s, i) => {
  const t = y.steps[i];
  return s.k === t.k && s.code === t.code && s.out === t.out && (stderrStrict ? s.err === t.err : stripAllowed(s.err) === stripAllowed(t.err));
});
const diffs = (x, y, strict) => x.steps.map((s, i) => { const t = y.steps[i]; const d = []; if (s.code !== t.code) d.push(`code ${s.code}/${t.code}`); if (s.out !== t.out) d.push("stdout"); if ((strict ? s.err : stripAllowed(s.err)) !== (strict ? t.err : stripAllowed(t.err))) d.push("stderr"); return d.length ? `${s.k}: ${d.join(",")}` : null; }).filter(Boolean);

const codes = (x) => x.steps.map((s) => `${s.k}=${s.code}`).join(" ");
const oldOnOld = await scenario(OLD, H.old, "oo");
check("A4.base", "baseline sanity (old client, old hub): codes say0 wait0 inbox0 inbox0 timeout2 peer-say0 peer-wait0 usage1", codes(oldOnOld),
  codes(oldOnOld) === "say=0 wait=0 inbox-b=0 inbox-a=0 wait-timeout=2 peer-say=0 peer-wait=0 usage=1");

for (const [row, base] of [["a-bothOld", H.old], ["b-appNew-cvxOld", H.newApp_oldCvx], ["c-appOld-cvxNew", H.oldApp_newCvx]]) {
  const o = await scenario(OLD, base, `${row[0]}o`);
  const n = await scenario(NEW, base, `${row[0]}n`);
  const extra = n.steps.flatMap((s) => s.err.split("\n").filter((l) => ALLOWED.some((re) => re.test(l))).map((l) => `${s.k}: ${l.replace(/\(.*\)/, (m) => m.slice(0, 60))}`));
  check(`A4.${row}`, "new hub-talk == old hub-talk on this hub: stdout + exit codes identical; stderr differs only by the stated receipt lines", { codes: codes(n), diffs: diffs(n, o, false), extraLines: extra.slice(0, 6) }, same(n, o, { stderrStrict: false }));
}

const oldOnNew = await scenario(OLD, H.newnew, "dn");
const oldReads = (await hub("GET", `/a2a/session/${oldOnNew.sid}/reads`, undefined, { base: H.newnew, headers: asSeat(oldOnNew.a) })).json;
const bOld = oldReads?.participants?.find((p) => p.name === oldOnNew.b);
check("A4.d-oldClient-newHub", "old hub-talk on candidate hub == old hub-talk on old hub (stdout, stderr, codes)", { codes: codes(oldOnNew), diffs: diffs(oldOnNew, oldOnOld, true) }, same(oldOnNew, oldOnOld, { stderrStrict: true }));
check("A4.d-L4", "old reader who waited + inboxed shows never-read (lastRead null) on the new hub (L4)", bOld?.lastRead ?? "missing", bOld && bOld.lastRead === null);

// (e)/(f): faults on /read and /reads through the proxy in front of the candidate hub.
const mode = (m) => hub("POST", "/__qa/mode", m, { base: H.proxy });
await hub("POST", "/__qa/reset", {}, { base: H.proxy });
const pass = await scenario(NEW, H.proxy, "ep");
for (const [label, m] of [["read-drop", { read: "drop" }], ["read-404", { read: "404" }], ["read-500", { read: "500" }], ["read-delay30s", { read: "delay:30000" }], ["reads-404", { reads: "404" }], ["reads-500", { reads: "500" }]]) {
  await mode({ read: "pass", reads: "pass", ...m });
  const f = await scenario(NEW, H.proxy, `e${label.replace(/[^a-z0-9]/g, "")}`);
  await hub("POST", "/__qa/reset", {}, { base: H.proxy });
  const slow = f.steps.map((s, i) => ({ k: s.k, over: s.ms - pass.steps[i].ms })).filter((x) => x.over > 6000);
  const marker = label.startsWith("read-") ? /read receipt not recorded/ : /read receipts unavailable/;
  const saw = f.steps.some((s) => marker.test(s.err));
  const rs = (await hub("GET", `/a2a/session/${f.sid}/reads`, undefined, { base: H.newnew, headers: asSeat(f.a) })).json;
  const bState = rs?.participants?.find((p) => p.name === f.b);
  const falseUnreadOk = label.startsWith("read-") ? bState?.lastRead === null : true;
  check(`A4.${label.startsWith("read-") ? "e" : "f"}-${label}`, "stdout + codes == pass-through; stderr carries the receipt line; <= +6 s per call; a lost mark leaves B unread (never a false read)",
    { codes: codes(f), diffs: diffs(f, pass, false), stderrLine: saw, slowSteps: slow, bLastRead: bState?.lastRead ?? null },
    same(f, pass, { stderrStrict: false }) && saw && slow.length === 0 && falseUnreadOk);
}

const failed = results.filter((r) => !r.pass);
console.log(`\nA4: ${results.length - failed.length}/${results.length} pass; failed: ${failed.map((f) => f.row).join(", ") || "none"}`);
process.exit(failed.length ? 1 : 0);
