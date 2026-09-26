// PD for the Loop 5 deploy (docs/loops/loop-5-deploy-plan.md step 10): after the swap, keyless and
// read-only against tcm. Loop 4's four GETs (loop-4-qa/pd.mjs), none with an X-Agent-Key header,
// plus Relay's accepted addition (2026-09-26): the served bundle is the v1.11.0 client, identified by
// its content-hashed asset name from a local build of the client stage at v1.11.0 (45c168e).
// Known positive for that method: the same local build at v1.10.0 gives index-BDybZYJ0.js, the name
// tcm served in Loop 4 (loop-4-qa-report.md:176).
// Usage: node pd.mjs   (PD_HUB overrides the address; PD_EXPECT_ASSET overrides the expected path)
const TCM = process.env.PD_HUB ?? "http://100.124.212.87:4000";
const EXPECT = process.env.PD_EXPECT_ASSET ?? "/ui/assets/index-DleSmG9D.js";
const OLD = "/ui/assets/index-BDybZYJ0.js"; // v1.10.0's bundle: seeing it means the swap did not land
const get = async (p) => {
  const r = await fetch(TCM + p, { redirect: "manual" }); // no headers added: no key can be sent
  const text = await r.text();
  return { status: r.status, type: r.headers.get("content-type"), cc: r.headers.get("cache-control"), text };
};
const out = []; let fail = 0;
const check = (row, ok, obs) => { out.push(`${ok ? "PASS" : "FAIL"} ${row}: ${JSON.stringify(obs)}`); if (!ok) fail++; };
console.log(`PD against ${TCM} at ${new Date().toISOString()}, expecting ${EXPECT}`);
const ui = await get("/ui/");
const asset = /src="(\/ui\/assets\/[^"]+\.js)"/.exec(ui.text)?.[1];
check("PD.1 GET /ui/", ui.status === 200 && /text\/html/.test(ui.type ?? "") && ui.cc === "no-cache" && !!asset, { status: ui.status, type: ui.type, cc: ui.cc, asset });
check("PD.1b bundle is v1.11.0's", asset === EXPECT, { served: asset ?? null, expected: EXPECT, isOldV1_10_0: asset === OLD });
const a = asset ? await get(asset) : { status: "no asset ref" };
check("PD.2 GET asset", a.status === 200 && /immutable/.test(a.cc ?? ""), { path: asset, status: a.status, type: a.type, cc: a.cc, bytes: a.text?.length });
const root = await get("/");
check("PD.3 GET /", root.status === 404, { status: root.status, body: root.text.replace(/\s+/g, " ").slice(0, 80) });
const h = await get("/health");
let hj = null; try { hj = JSON.parse(h.text); } catch {}
const keys = hj ? Object.keys(hj).sort() : null;
check("PD.4 GET /health", h.status === 200 && JSON.stringify(keys) === JSON.stringify(["agent", "convex", "status"]) && hj.status === "ok" && hj.convex?.status === "ok",
  { status: h.status, keys, statusField: hj?.status, agent: hj?.agent, convex: hj?.convex?.status });
console.log(out.join("\n")); console.log(`PD ${fail ? "FAIL" : "PASS"} (${out.length} checks over 4 reads, 0 keys sent)`);
process.exitCode = fail ? 1 : 0;
