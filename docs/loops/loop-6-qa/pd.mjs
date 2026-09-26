// PD for the Loop 6 deploy: after the swap, keyless, against tcm. Loop 5's PD (loop-5-qa/pd.mjs: /ui/,
// the bundle by its reproducible hashed name, one asset, /, /health) plus D3's keyless reads
// (loop-6-qa-criteria.md D3, "What these criteria cannot see"): a missing /ui/ file and malformed JSON to
// register must answer terse, and / (unrouted) too. No request carries X-Agent-Key. The malformed
// register creates nothing (the body does not parse) and costs 1 of the global bucket's 90.
// PD_EXPECT_ASSET is REQUIRED: the hashed name from a local build of the candidate's client stage
// (loop-5-qa/fixtures/client-hash.sh <sha>). PD_OLD_ASSET is the bundle the swap replaces.
// Usage: PD_EXPECT_ASSET=/ui/assets/index-XXXX.js [PD_OLD_ASSET=...] [PD_HUB=...] node pd.mjs
const TCM = process.env.PD_HUB ?? "http://100.124.212.87:4000";
const EXPECT = process.env.PD_EXPECT_ASSET; if (!/^\/ui\/assets\/index-[\w-]+\.js$/.test(EXPECT ?? "")) throw new Error("PD_EXPECT_ASSET not set");
const OLD = process.env.PD_OLD_ASSET ?? "/ui/assets/index-DleSmG9D.js"; // v1.11.0's bundle
// d-scan.mjs's classifier (validated there on v1.11.0's leaks, and on the design's terse texts).
const LEAK = [
  ["path", /(\/app\/|\/home\/|\/usr\/|[A-Za-z]:[\\/](Users|Windows)|node_modules|\.(ts|js|mjs):\d+)/],
  ["stack", /\bat [^\s]+ \(|\n\s+at |    at /],
  ["internal", /Server Error|Uncaught|ConvexError|ArgumentValidationError|Validator|Request ID|ENOENT|EACCES|SyntaxError|Unexpected token|is not valid JSON|Value does not match|Path: \./],
  ["express-default", /<title>Error<\/title>|Cannot (GET|POST|PUT|DELETE|PATCH) \//],
];
const leaks = (b) => LEAK.filter(([, re]) => re.test(b)).map(([n]) => n);
const req = async (p, opt = {}) => {
  const r = await fetch(TCM + p, { redirect: "manual", ...opt }); // headers only as given below: no key
  const text = await r.text();
  return { status: r.status, type: r.headers.get("content-type"), cc: r.headers.get("cache-control"), text };
};
const out = []; let fail = 0;
const check = (row, ok, obs) => { out.push(`${ok ? "PASS" : "FAIL"} ${row}: ${JSON.stringify(obs)}`); if (!ok) fail++; };
const short = (t) => t.replace(/\s+/g, " ").slice(0, 100);
console.log(`PD against ${TCM} at ${new Date().toISOString()}, expecting ${EXPECT}`);
const ui = await req("/ui/");
const asset = /src="(\/ui\/assets\/[^"]+\.js)"/.exec(ui.text)?.[1];
check("PD.1 GET /ui/", ui.status === 200 && /text\/html/.test(ui.type ?? "") && ui.cc === "no-cache" && !!asset, { status: ui.status, type: ui.type, cc: ui.cc, asset });
check("PD.1b bundle is the candidate's", asset === EXPECT, { served: asset ?? null, expected: EXPECT, isOld: asset === OLD });
const a = asset ? await req(asset) : { status: "no asset ref" };
check("PD.2 GET asset", a.status === 200 && /immutable/.test(a.cc ?? ""), { path: asset, status: a.status, type: a.type, cc: a.cc, bytes: a.text?.length });
const root = await req("/");
check("PD.3 GET / (404, terse)", root.status === 404 && leaks(root.text).length === 0, { status: root.status, leaks: leaks(root.text), body: short(root.text) });
const h = await req("/health");
let hj = null; try { hj = JSON.parse(h.text); } catch {}
const keys = hj ? Object.keys(hj).sort() : null;
check("PD.4 GET /health", h.status === 200 && JSON.stringify(keys) === JSON.stringify(["agent", "convex", "status"]) && hj.status === "ok" && hj.convex?.status === "ok",
  { status: h.status, keys, statusField: hj?.status, agent: hj?.agent, convex: hj?.convex?.status });
const miss = await req("/ui/does-not-exist-pd6");
check("PD.5 GET /ui/<missing> (D3: 404, terse)", miss.status === 404 && leaks(miss.text).length === 0, { status: miss.status, type: miss.type, leaks: leaks(miss.text), body: short(miss.text) });
const mj = await req("/a2a/register", { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
check("PD.6 POST /a2a/register malformed JSON (D3: 400, terse)", mj.status === 400 && leaks(mj.text).length === 0, { status: mj.status, type: mj.type, leaks: leaks(mj.text), body: short(mj.text) });
console.log(out.join("\n")); console.log(`PD ${fail ? "FAIL" : "PASS"} (${out.length} checks over 7 requests, 0 keys sent)`);
process.exitCode = fail ? 1 : 0;
