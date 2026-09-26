// Counting proxy for Loop 6 F (loop-6-qa-criteria.md, instrument "the burst driver"): the hub logs no
// requests, so every request a real hub-talk or daemon process makes is counted here, between it and
// the hub. One JSONL line per request: time, method, path, status, and who it was (the sha256 prefix of
// X-Agent-Key, 8 hex, never the key). Bodies are passed through untouched and not recorded.
// Usage: node proxy.mjs <listenPort> <hubUrl> <out.jsonl>
import { createServer, request } from "node:http";
import { createHash } from "node:crypto";
import { appendFileSync, writeFileSync } from "node:fs";
const [port, hub, out] = [Number(process.argv[2]), new URL(process.argv[3]), process.argv[4]];
if (!port || !out) throw new Error("usage: proxy.mjs <listenPort> <hubUrl> <out.jsonl>");
writeFileSync(out, "");
const who = (k) => (k ? createHash("sha256").update(String(k)).digest("hex").slice(0, 8) : "-");
createServer((req, res) => {
  const t = Date.now(); const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks); const p = req.url.split("?")[0];
    // A register carries its key in the body: attribute it by the body's name (the name only).
    let n = null; if (p === "/a2a/register") { try { n = String(JSON.parse(body.toString("utf8")).name ?? ""); } catch { n = "unparsable"; } }
    const rec = (s, extra = {}) => appendFileSync(out, JSON.stringify({ t, m: req.method, p, s, k: who(req.headers["x-agent-key"]), n, ...extra }) + "\n");
    const up = request({ host: hub.hostname, port: hub.port, method: req.method, path: req.url, headers: { ...req.headers, host: hub.host } }, (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
      r.on("end", () => rec(r.statusCode, { ra: r.headers["retry-after"] ?? null }));
    });
    up.on("error", (e) => { rec("proxy-error", { err: e.code }); res.writeHead(502); res.end(); });
    up.end(body);
  });
}).listen(port, "127.0.0.1", () => console.log(`proxy ${port} -> ${hub.href} logging to ${out}`));
