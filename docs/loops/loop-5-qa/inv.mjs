// INV (loop-5-qa-criteria.md): every Express route and JSON-RPC method at a SHA, parsed from the
// source (git show), not copied from the brief or design. Usage: node inv.mjs <sha> [--expect N]
// Prints one line per route; exits 2 if --expect N and the app.get/post count differs (known positive).
import { execFileSync } from "node:child_process";
const [sha, flag, n] = process.argv.slice(2);
const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 64 << 20 });
const files = git("ls-tree", "-r", "--name-only", "--full-tree", sha, "src/").split("\n").filter((f) => f.endsWith(".ts"));
const routes = [];
for (const f of files) {
  // Line comments are blanked (same length, so line numbers hold): a route named in a comment is not a route.
  const src = git("show", `${sha}:${f}`).replace(/\/\/[^\n]*/g, (c) => " ".repeat(c.length));
  // app.<verb>("path" ... and app.use("path" ...  (strings may be template-free literals only)
  for (const m of src.matchAll(/\bapp\.(get|post|put|delete|patch|all|use)\(\s*(["'`])([^"'`]+)\2/g)) {
    const line = src.slice(0, m.index).split("\n").length;
    routes.push({ kind: m[1] === "use" ? "USE" : m[1].toUpperCase(), path: m[3], at: `${f}:${line}` });
  }
  for (const m of src.matchAll(/\bmountUi\(\s*app/g)) routes.push({ kind: "USE", path: "/ui (mountUi)", at: `${f}:${src.slice(0, m.index).split("\n").length}` });
  for (const m of src.matchAll(/\bRouter\(/g)) routes.push({ kind: "ROUTER?", path: "(a Router is constructed: inspect)", at: `${f}:${src.slice(0, m.index).split("\n").length}` });
}
// The JSON-RPC methods the SDK's server dispatches (from the SDK bundle in the tree at this SHA's lockfile).
let rpc = [];
try {
  const tree = process.env.QA_TREE;
  if (tree) {
    const { readFileSync } = await import("node:fs");
    const b = readFileSync(`${tree}/node_modules/@a2a-js/sdk/dist/server/index.cjs`, "utf8");
    rpc = [...new Set([...b.matchAll(/["']((?:message|tasks|agent)\/[a-zA-Z/]+)["']/g)].map((m) => m[1]))].sort();
  }
} catch (e) { rpc = [`(unread: ${e.message})`]; }
for (const r of routes) console.log(`${r.kind.padEnd(7)} ${r.path.padEnd(40)} ${r.at}`);
for (const m of rpc) console.log(`JSONRPC ${m}`);
const verbs = routes.filter((r) => r.kind !== "USE" && r.kind !== "ROUTER?").length;
console.log(`\n${verbs} verb routes, ${routes.filter((r) => r.kind === "USE").length} mounts, ${rpc.length} JSON-RPC methods at ${sha}`);
if (flag === "--expect" && verbs !== Number(n)) { console.log(`UNEXPECTED: ${verbs} != ${n}`); process.exit(2); }
