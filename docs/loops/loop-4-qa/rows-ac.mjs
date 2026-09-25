// Loop 4 rows A1, A5 and C1 (with R's known positive). Run: QA_TMP=... node rows-ac.mjs
import { H, hub, register, heartbeat, newKey, check, summary, P8 } from "./l4.mjs";

const TAG = Date.now().toString(36);
const nm = (s) => `qa-${s}-${TAG}`;

// ---------------------------------------------------------------- setup (through newW; same DB)
const kr = newKey(), kr2 = newKey(), unknown = newKey();
const r = nm("r"), r2 = nm("r2");
for (const [n, k] of [[r, kr], [r2, kr2]]) {
  const res = await register(H.newW, n, k);
  if (res.status !== 200) throw new Error(`setup register ${n}: ${res.status} ${res.text.slice(0, 120)}`);
}
await heartbeat(H.newW, r, kr);
const ses = await hub(H.newW, "POST", "/a2a/session", { key: kr, body: { title: "qa c1", participants: [r, r2], maxTurns: 8 } });
const sid = ses.json?.sessionId;
if (!sid) throw new Error(`setup session: ${ses.status} ${ses.text.slice(0, 120)}`);
await hub(H.newW, "POST", `/a2a/session/${sid}/message`, { key: kr, body: { from: r, content: "c1 seed" } });
console.log(`setup: ${r} (${P8(kr)}), ${r2} (${P8(kr2)}), session ${sid}`);

// ---------------------------------------------------------------- A1
{
  const n = H.newW;
  const ui = await hub(n, "GET", "/ui/");
  const asset = /src="\/ui\/assets\/([^"]+\.js)"/.exec(ui.text)?.[1];
  const css = /href="\/ui\/assets\/([^"]+\.css)"/.exec(ui.text)?.[1];
  check("A1.1", "GET /ui/ 200 text/html with the app mount and /ui/assets refs",
    { status: ui.status, type: ui.headers["content-type"], mount: /<div id="app"/.test(ui.text) || /id="app"/.test(ui.text), asset, css },
    ui.status === 200 && /text\/html/.test(ui.headers["content-type"]) && !!asset && !!css);
  check("A1.2", "index.html Cache-Control no-cache", { cc: ui.headers["cache-control"] }, ui.headers["cache-control"] === "no-cache");
  const idx = await hub(n, "GET", "/ui/index.html");
  check("A1.2b", "GET /ui/index.html also no-cache", { status: idx.status, cc: idx.headers["cache-control"] }, idx.status === 200 && idx.headers["cache-control"] === "no-cache");
  const redir = await hub(n, "GET", "/ui");
  check("A1.3", "GET /ui redirects to /ui/", { status: redir.status, location: redir.headers.location }, [301, 302, 307, 308].includes(redir.status) && redir.headers.location === "/ui/");
  for (const a of [asset, css]) {
    const g = await hub(n, "GET", `/ui/assets/${a}`);
    check("A1.4", `asset ${a.split(".").pop()} 200 immutable`, { status: g.status, cc: g.headers["cache-control"], type: g.headers["content-type"] },
      g.status === 200 && /max-age=31536000/.test(g.headers["cache-control"] ?? "") && /immutable/.test(g.headers["cache-control"] ?? ""));
  }
  for (const p of ["/ui/does-not-exist", "/ui/assets/nope.js", "/ui/deep/route"]) {
    const m = await hub(n, "GET", p);
    check("A1.5", `${p} 404 and not index.html (no SPA fallback)`,
      { status: m.status, isIndex: m.text.includes('id="app"'), type: m.headers["content-type"], stackTrace: /\bat \S+ \(|node_modules|[A-Z]:\\/.test(m.text), bytes: m.text.length },
      m.status === 404 && !m.text.includes('id="app"'));
  }
  for (const p of ["/ui/..%2f..%2fpackage.json", "/ui/%2e%2e/%2e%2e/package.json", "/ui/../package.json", "/ui/..\\..\\package.json"]) {
    const t = await hub(n, "GET", p);
    check("A1.6", `traversal ${p} does not serve package.json`, { status: t.status, leaked: t.text.includes('"a2a-intelligent-hub"') }, !t.text.includes('"a2a-intelligent-hub"'));
  }
  const rootNew = await hub(n, "GET", "/"), rootOld = await hub(H.oldW, "GET", "/");
  check("A1.7", "GET / 404, identical old and new", { new: rootNew.status, old: rootOld.status, sameBody: rootNew.text === rootOld.text },
    rootNew.status === 404 && rootOld.status === 404 && rootNew.text === rootOld.text);
  const oldUi = await hub(H.oldW, "GET", "/ui/");
  check("A1.8", "both directions: old hub /ui/ is 404 (P12)", { old: oldUi.status, new: ui.status }, oldUi.status === 404 && ui.status === 200);
  const post = await hub(n, "POST", "/ui/", { body: {} }), postOld = await hub(H.oldW, "POST", "/ui/", { body: {} });
  check("A1.9", "POST /ui/ (info): new vs old", { new: post.status, allow: post.headers.allow, old: postOld.status }, true);
}

// ---------------------------------------------------------------- A5
{
  const a = await hub(H.noUi, "GET", "/ui/"), o = await hub(H.oldW, "GET", "/ui/");
  const a2 = await hub(H.noUi, "GET", "/ui"), o2 = await hub(H.oldW, "GET", "/ui");
  check("A5", "hub with no client build: /ui/ and /ui equal cef7517's 404", { noUi: [a.status, a2.status], old: [o.status, o2.status], same: a.text === o.text && a2.text === o2.text },
    a.status === 404 && a.text === o.text && a2.status === o2.status && a2.text === o2.text);
}

// ---------------------------------------------------------------- R / C1
// Named volatile fields (criteria R): timestamps and latency (numbers under these keys); the
// Convex request id inside 500 error strings; the hub's own port (agent-card url); and the replay
// directory in Express's error pages (old and new run from different dirs). Nothing else.
const VOLATILE = /(At|Time|time|lastSeen|uptime|timestamp|_creationTime|Ms|ms)$/;
const scrub = (s) => s.replace(/\[Request ID: [0-9a-f]+\]/g, "[Request ID: <id>]").replace(/\b46[0-4]\d\b/g, "<port>")
  .replace(/rep-(old|new)/g, "rep-<tree>");
function norm(v) {
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, VOLATILE.test(k) && typeof x === "number" ? "<t>" : norm(x)]));
  return typeof v === "string" ? scrub(v) : v;
}
const body = (res) => (res.json !== null ? JSON.stringify(norm(res.json)) : scrub(res.text));
const CORS = ["access-control-allow-origin", "access-control-allow-headers", "access-control-allow-methods"];
const bogusId = "k57abcdefghijklmnopqrstuvwxyz123";
const CASES = [
  ["GET", "/health"], ["HEAD", "/health"], ["GET", "/.well-known/agent-card.json"],
  ["GET", "/"], ["GET", "/nope"], ["GET", "/uix"], ["GET", "/ui-x"], ["GET", "/uix/"], ["GET", "/a2a"], ["GET", "/a2a/ui"],
  ["GET", "/a2a/whoami"], ["GET", "/a2a/agents/live"], ["GET", "/a2a/agents/live?kind=ide-session"], ["GET", "/a2a/sessions"],
  ["GET", `/a2a/queue/${r}`], ["GET", `/a2a/peer/${r}/sessions`],
  ["GET", `/a2a/session/${sid}/messages`], ["GET", `/a2a/session/${sid}/reads`],
  ["GET", "/a2a/session/bogus/messages"], ["GET", `/a2a/session/${bogusId}/messages`], ["GET", "/a2a/session/bogus/reads"],
  ["POST", "/a2a/register", {}], ["POST", "/a2a/rotate", {}], ["POST", "/a2a/session", {}],
  ["POST", `/a2a/session/${sid}/message`, {}], ["POST", `/a2a/session/${sid}/rename`, {}], ["POST", `/a2a/session/${sid}/extend`, {}],
  ["POST", `/a2a/session/${sid}/read`, {}], ["POST", "/a2a/session/bogus/message", { from: r, content: "x" }],
  ["POST", "/a2a/task/bogus/respond", {}], ["POST", "/a2a/task/bogus/claim", {}],
  ["POST", "/a2a/message/send", {}], ["POST", "/a2a/jsonrpc", { jsonrpc: "2.0", id: 1, method: "qa/none", params: {} }],
  ["POST", "/a2a/jsonrpc", "{not json"], ["POST", "/health", {}],
  ["OPTIONS", "/a2a/session", undefined, { Origin: "http://localhost:5173", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,x-agent-key" }],
  ["OPTIONS", "/health", undefined, { Origin: "http://localhost:5173" }],
];
const KEYS = { none: undefined, valid: kr, unknown };

async function compare(label, oldBase, newBase, rowName) {
  let diffs = 0, n = 0; const seen = [];
  for (const [m, p, b, hdr] of CASES) for (const [kn, k] of Object.entries(KEYS)) {
    const o = await hub(oldBase, m, p, { key: k, body: b, headers: hdr });
    const w = await hub(newBase, m, p, { key: k, body: b, headers: hdr });
    n++;
    const same = o.status === w.status && body(o) === body(w) && CORS.every((h) => o.headers[h] === w.headers[h]);
    if (!same) { diffs++; seen.push(`${m} ${p} [${kn}] old ${o.status} new ${w.status}`); }
  }
  return { label, n, diffs, seen };
}
// R's known positive: warn vs strict on the same build must differ (unknown-key rows).
const pos = await compare("positive oldW vs oldS", H.oldW, H.oldS);
check("R.pos", "R reports a known difference (warn vs strict, unknown key)", { diffs: pos.diffs, first: pos.seen.slice(0, 3) }, pos.diffs > 0 && pos.seen.some((s) => s.includes("[unknown]")));
for (const [lbl, o, w] of [["warn", H.oldW, H.newW], ["strict", H.oldS, H.newS]]) {
  const c = await compare(lbl, o, w);
  check("C1", `old vs new (${lbl}): identical status, parsed body and CORS headers on ${CASES.length} cases x 3 key states`, { cases: c.n, diffs: c.diffs, seen: c.seen }, c.diffs === 0);
}
process.exitCode = summary() ? 1 : 0;
