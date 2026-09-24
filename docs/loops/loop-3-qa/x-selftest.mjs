// Validates instrument X's Loop 3 additions against known positives (loop-3-qa-criteria.md):
// the key-presence log (never a value) and rotate's forward-then-drop. Also checks that Loop 1's
// drop rule still fires. The upstream is a stub that counts what it "commits", so a commit the client
// never heard about is directly visible. It is re-checked on the real candidate before the run counts.
// Usage: QA_TMP=<scratch> node x-selftest.mjs      (ports 4550 proxy, 4551 stub; PIDs to QA_TMP/pids.txt)
import http from "node:http";
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const TMP = process.env.QA_TMP;
if (!TMP) { console.log("QA_TMP must be set"); process.exit(2); }
mkdirSync(TMP, { recursive: true });
const PIDS = join(TMP, "pids.txt");
const PROXY = 4550, STUB = 4551;
const X = join(dirname(fileURLToPath(import.meta.url)), "..", "loop-1-qa", "fault-proxy.mjs");

const commits = [];
const stub = http.createServer((req, res) => {
  const chunks = []; req.on("data", (c) => chunks.push(c));
  req.on("end", () => { commits.push(`${req.method} ${req.url}`); res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"ok":true}'); });
});
await new Promise((ok) => stub.listen(STUB, "127.0.0.1", ok));
appendFileSync(PIDS, `${process.pid}\n`);

const proxy = spawn(process.execPath, [X], { env: { ...process.env, QA_PROXY_PORT: String(PROXY), QA_UPSTREAM: `http://127.0.0.1:${STUB}` }, stdio: ["ignore", "pipe", "pipe"] });
appendFileSync(PIDS, `${proxy.pid}\n`);
await new Promise((ok) => proxy.stdout.once("data", ok));

const base = `http://127.0.0.1:${PROXY}`;
const call = async (method, path, { body, key } = {}) => {
  try {
    const r = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(key !== undefined ? { "X-Agent-Key": key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: r.status, text: await r.text() };
  } catch (e) { return { error: e.cause?.code ?? e.message }; }
};
const qa = (path, body) => call("POST", `/__qa/${path}`, { body });
const logText = async () => (await call("GET", "/__qa/log")).text;
const last = async () => JSON.parse(await logText()).at(-1);

const K = `qa-x-${randomBytes(16).toString("hex")}`, NEW = randomBytes(32).toString("base64url");
const results = [];
const check = (name, ok, observed) => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `  observed: ${JSON.stringify(observed)}`}`); };

await qa("reset", {});
let r = await call("GET", "/a2a/whoami", { key: K });
let e = await last();
check("pass-through: 200, key present, not dev-key", r.status === 200 && e.key.present === true && e.key.devKey === false, { r, key: e.key });
await call("GET", "/a2a/whoami", { key: "dev-key" });
e = await last();
check("dev-key header flagged as devKey", e.key.present && e.key.devKey, e.key);
await call("GET", "/a2a/whoami");
e = await last();
check("no header: present false", e.key.present === false && e.key.devKey === false, e.key);
await call("POST", "/a2a/register", { body: { name: "qa-x", apiKey: K } });
e = await last();
check("register body not logged", e.body === undefined, e.body);

const before = commits.length;
r = await call("POST", "/a2a/rotate", { key: K, body: { newApiKey: NEW } });
e = await last();
check("rotate pass: 200, forwarded, body not logged", r.status === 200 && commits.length === before + 1 && e.route === "rotate" && e.body === undefined, { r, e });

await qa("mode", { rotate: "forward-then-drop" });
const c0 = commits.length;
r = await call("POST", "/a2a/rotate", { key: K, body: { newApiKey: NEW } });
e = await last();
check("forward-then-drop: upstream committed (known positive) while the client got a socket error",
  r.error !== undefined && commits.length === c0 + 1 && commits.at(-1) === "POST /a2a/rotate" && /upstream 200, then dropped/.test(e.status), { r, commits: commits.length - c0, status: e.status });

await qa("reset", {});
r = await call("POST", "/a2a/rotate", { key: K, body: { newApiKey: NEW } });
check("reset: rotate passes again", r.status === 200, r);

await qa("mode", { read: "drop" });
r = await call("POST", "/a2a/session/s1/read", { key: K, body: { reader: "qa-x", throughTurn: 1, via: "wait" } });
check("Loop 1 regression: read=drop still destroys the socket", r.error !== undefined, r);
await qa("reset", {});

const whole = await logText();
check("no key value anywhere in the log (the header key, the register key, the new key)", !whole.includes(K) && !whole.includes(NEW), "leak");

proxy.kill();
stub.close();
const bad = results.filter((x) => !x).length;
console.log(bad ? `\nX selftest: ${bad} failed` : `\nX selftest: all ${results.length} pass`);
process.exit(bad ? 1 : 0);
