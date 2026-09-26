// D1-D3 (loop-6-qa-criteria.md): trigger error responses on a hub and classify each body. A body FAILS
// when it carries a filesystem path, a stack frame, or an internal message (Convex/Node text passed
// through). Keys are read from a file and sent only to the scratch hub; they are never printed.
// Usage: node d-scan.mjs <hubUrl> <keyFile> <agentName> [--expect-leaks]
//   --expect-leaks: the known-positive run (v1.11.0 leaks): exits 0 only if the detector flags leaks.
import { readFileSync } from "node:fs";
const [HUB, KEYF, NAME, MODE] = process.argv.slice(2);
if (!NAME) throw new Error("usage: d-scan.mjs <hubUrl> <keyFile> <agentName> [--expect-leaks]");
const KEY = readFileSync(KEYF, "utf8").trim();
const LEAK = [
  ["path", /(\/app\/|\/home\/|\/usr\/|[A-Za-z]:[\\/](Users|Windows)|node_modules|\.(ts|js|mjs):\d+)/],
  ["stack", /\bat [^\s]+ \(|\n\s+at |    at /],
  ["internal", /Server Error|Uncaught|ConvexError|ArgumentValidationError|Validator|Request ID|ENOENT|EACCES|SyntaxError|Unexpected token|is not valid JSON|Value does not match|Path: \./],
  ["express-default", /<title>Error<\/title>|Cannot (GET|POST|PUT|DELETE|PATCH) \//],
];
const classify = (b) => LEAK.filter(([, re]) => re.test(b)).map(([n]) => n);
// Known negative: the terse texts the design names must not be flagged (run before any request).
for (const t of ["not found", "malformed json", "internal error", "bad request", "session not found", "too many requests", "not a session id", "Auth backend unavailable",
  "this name is new and needs an enrollment code from its owner", "this enrollment code is expired", "this enrollment code is already used", "this enrollment code is not valid"])
  if (classify(JSON.stringify({ error: t })).length) { console.log(`UNDETERMINED: detector flags the terse text ${JSON.stringify(t)}`); process.exit(2); }
const J = { "content-type": "application/json" };
const K = { "X-Agent-Key": KEY };
const T = [
  ["GET /ui/<missing>", "/ui/does-not-exist-qa6", {}],
  ["GET /<unrouted>", "/qa6-no-such-route", {}],
  ["POST /a2a/register malformed JSON", "/a2a/register", { method: "POST", headers: J, body: "{" }],
  ["POST /a2a/heartbeat malformed JSON (keyed)", `/a2a/heartbeat/${NAME}`, { method: "POST", headers: { ...J, ...K }, body: "{" }],
];
// D2: every route that takes an id (baseline list from inv.mjs; the candidate's list is re-derived), with
// a malformed id and a well-formed id of the wrong table.
const ID_ROUTES = [
  // Bodies are VALID (field names from each handler's own 400 text on the baseline), so the id is the
  // only thing wrong: a body refusal would answer before the id is ever looked at.
  ["POST", "/a2a/task/:id/respond", { response: "qa6" }], ["POST", "/a2a/task/:id/claim", { agentName: NAME }],
  ["POST", "/a2a/session/:id/message", { from: NAME, content: "qa6" }], ["POST", "/a2a/session/:id/rename", { title: "qa6" }],
  ["POST", "/a2a/session/:id/extend", { addTurns: 1 }], ["GET", "/a2a/session/:id/messages", null],
  ["POST", "/a2a/session/:id/read", { reader: NAME, throughTurn: 1, via: "inbox" }], ["GET", "/a2a/session/:id/reads", null],
];
for (const [m, p, b] of ID_ROUTES) for (const [kind, id] of [["malformed id", "not-an-id"], ["wrong-table id", "jd7aaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]])
  T.push([`${m} ${p} ${kind} (keyed)`, p.replace(":id", id), { method: m, headers: b ? { ...J, ...K } : K, ...(b ? { body: JSON.stringify(b) } : {}) }]);
let leaks = 0, fivexx = 0;
for (const [label, path, opt] of T) {
  let r, body;
  try { r = await fetch(HUB + path, opt); body = await r.text(); } catch (e) { console.log(`ERROR ${label}: ${e.cause?.code ?? e.message}`); leaks++; continue; }
  const c = classify(body);
  // D2: a malformed or wrong-table id must be answered 4xx (brief D), not 2xx and not 5xx.
  if (/ id \(keyed\)$/.test(label) && !(r.status >= 400 && r.status < 500)) c.push(`not-4xx`);
  if (c.length) leaks++; if (r.status >= 500) fivexx++;
  const shown = body.replace(KEY, "<key>").replace(/\s+/g, " ").slice(0, 140);
  console.log(`${c.length ? "LEAK" : "ok  "} ${r.status} ${label}: [${c.join(",")}] ${JSON.stringify(shown)}`);
}
console.log(`${T.length} triggers, ${leaks} leaking, ${fivexx} with 5xx`);
if (MODE === "--expect-leaks") { console.log(leaks > 0 ? "KNOWN POSITIVE: detector flags leaks" : "UNDETERMINED: no leak flagged on a hub known to leak"); process.exitCode = leaks > 0 ? 0 : 2; }
else process.exitCode = leaks || fivexx ? 1 : 0;
