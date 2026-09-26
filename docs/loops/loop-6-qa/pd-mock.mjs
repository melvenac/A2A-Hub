// A mock of tcm's hub for pd.mjs's own validation: serves a built client dist with the headers Loop 4
// observed on tcm, / as 404, /health in the observed shape. Logs any request carrying a key header.
// Usage: node pd-mock.mjs <port> <distDir>
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const [port, dist] = [Number(process.argv[2]), process.argv[3]];
createServer((req, res) => {
  const keyHdr = Object.keys(req.headers).filter((h) => /key|auth/i.test(h));
  console.log(`${req.method} ${req.url} keyHeaders=${JSON.stringify(keyHdr)}`);
  if (req.url === "/ui/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" }); return res.end(readFileSync(join(dist, "index.html"))); }
  if (req.url.startsWith("/ui/assets/") && existsSync(join(dist, req.url.slice(4)))) { res.writeHead(200, { "content-type": "text/javascript", "cache-control": "public, max-age=31536000, immutable" }); return res.end(readFileSync(join(dist, req.url.slice(4)))); }
  if (req.url === "/health") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ status: "ok", agent: "hub", convex: { status: "ok" } })); }
  // LEAKY=1 answers the way v1.11.0 does (Express's development pages); otherwise the design's terse JSON.
  const leaky = process.env.LEAKY === "1";
  if (req.url === "/a2a/register" && req.method === "POST") {
    if (leaky) { res.writeHead(400, { "content-type": "text/html" }); return res.end("<!DOCTYPE html><title>Error</title><pre>SyntaxError: Expected property name<br> &nbsp; &nbsp;at JSON.parse (&lt;anonymous&gt;)<br> &nbsp; &nbsp;at /app/node_modules/body-parser/lib/types/json.js:92:19</pre>"); }
    res.writeHead(400, { "content-type": "application/json" }); return res.end(JSON.stringify({ error: "malformed json" }));
  }
  if (leaky) { res.writeHead(404, { "content-type": "text/html" }); return res.end(req.url.startsWith("/ui/") ? "<title>Error</title><pre>Error: ENOENT: no such file or directory, stat '/app/client/dist/x'</pre>" : "<title>Error</title><pre>Cannot GET " + req.url + "</pre>"); }
  res.writeHead(404, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "not found" }));
}).listen(port, "127.0.0.1", () => console.log(`mock on ${port} serving ${dist}`));
