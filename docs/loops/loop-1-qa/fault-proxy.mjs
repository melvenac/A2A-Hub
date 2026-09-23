// Instrument X (loop-1-qa-criteria.md): a fault proxy between hub-talk and the QA hub.
//
// Only two routes are ever faulted: POST /a2a/session/:id/read ("read") and
// GET /a2a/session/:id/reads ("reads"). Everything else passes through untouched.
//
// Usage: QA_PROXY_PORT=4420 QA_UPSTREAM=http://127.0.0.1:4410 node fault-proxy.mjs
// Control (not forwarded):
//   POST /__qa/mode  {"read":"pass|drop|404|500|delay:<ms>|inject","reads":"pass|drop|404|500|delay:<ms>",
//                     "inject":{"from":"qa-a","content":"injected"}}
//   GET  /__qa/log   every request seen, with the rule applied
//   POST /__qa/reset mode back to pass, log cleared
import http from "node:http";

const PORT = Number(process.env.QA_PROXY_PORT);
const UP = process.env.QA_UPSTREAM;
if (!PORT || !UP) { console.error("QA_PROXY_PORT and QA_UPSTREAM must both be set"); process.exit(1); }
if (/:(3210|4000)\b/.test(UP)) { console.error("refusing: main-stack port"); process.exit(1); }

let mode = { read: "pass", reads: "pass", inject: null };
let log = [];

const routeOf = (method, path) => {
  if (method === "POST" && /^\/a2a\/session\/[^/]+\/read$/.test(path)) return "read";
  if (method === "GET" && /^\/a2a\/session\/[^/]+\/reads$/.test(path)) return "reads";
  return null;
};

const body = (req) => new Promise((ok, no) => {
  const chunks = []; req.on("data", (c) => chunks.push(c)); req.on("end", () => ok(Buffer.concat(chunks))); req.on("error", no);
});

async function forward(req, res, buf) {
  const headers = { ...req.headers }; delete headers.host; delete headers["content-length"];
  const r = await fetch(UP + req.url, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : buf });
  const out = Buffer.from(await r.arrayBuffer());
  const h = {}; r.headers.forEach((v, k) => { if (!["content-encoding", "transfer-encoding", "content-length", "connection"].includes(k)) h[k] = v; });
  res.writeHead(r.status, h); res.end(out);
  return r.status;
}

const server = http.createServer(async (req, res) => {
  const path = req.url.split("?")[0];
  const buf = await body(req);
  if (path.startsWith("/__qa/")) {
    if (req.method === "POST" && path === "/__qa/mode") { mode = { ...mode, ...JSON.parse(buf.toString() || "{}") }; }
    else if (req.method === "POST" && path === "/__qa/reset") { mode = { read: "pass", reads: "pass", inject: null }; log = []; }
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(path === "/__qa/log" ? log : mode));
  }
  const route = routeOf(req.method, path);
  const rule = route ? mode[route] : "pass";
  const entry = { at: Date.now(), method: req.method, url: req.url, route, rule, body: route ? buf.toString() : undefined };
  log.push(entry);
  try {
    if (rule === "drop") { entry.status = "dropped"; return req.socket.destroy(); }
    if (rule === "404" || rule === "500") {
      entry.status = Number(rule);
      res.writeHead(Number(rule), { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: `qa fault proxy: ${rule}` }));
    }
    if (rule.startsWith("delay:")) await new Promise((r) => setTimeout(r, Number(rule.slice(6))));
    if (rule === "inject" && route === "read") {
      // Land a new turn after the reader fetched and printed, before its mark arrives.
      const sid = path.split("/")[3];
      const inj = mode.inject || { from: "qa-a", content: "qa injected turn" };
      const r = await fetch(`${UP}/a2a/session/${sid}/message`, {
        method: "POST", headers: { "Content-Type": "application/json", "X-Agent-Key": req.headers["x-agent-key"] || "dev-key" },
        body: JSON.stringify(inj),
      });
      entry.injected = { status: r.status, body: await r.text() };
    }
    entry.status = await forward(req, res, buf);
  } catch (e) {
    entry.status = "proxy-error"; entry.error = String(e?.message || e);
    if (!res.headersSent) { res.writeHead(502); res.end(); }
  }
});

server.on("error", (e) => { console.error(`fault-proxy: ${e.code || e.message}`); process.exit(1); });
server.listen(PORT, "127.0.0.1", () => console.log(`fault-proxy :${PORT} -> ${UP}`));
