// Loop 3 row library (loop-3-qa-criteria.md). Talks to the throwaway stack started by start-stack.ps1.
// It never prints a key or a full hash: observations carry names, statuses and 8-hex prefixes only.
// Every key it makes is remembered in-process (SECRETS) for the K6 scan at the end of a script.
import { createHash, randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

export const TMP = process.env.QA_TMP;
if (!TMP) throw new Error("QA_TMP must be set");
mkdirSync(TMP, { recursive: true });
export const CAND = process.env.QA_CAND || "C:/Users/melve/Worktrees/qa3-cand";
export const OLD = process.env.QA_OLD || "C:/Users/melve/Worktrees/qa3-old";
export const H = {
  W: "http://127.0.0.1:4510", S: "http://127.0.0.1:4511",           // candidate app on candidate functions
  OW: "http://127.0.0.1:4520", OS: "http://127.0.0.1:4521",         // ea9d057 app on candidate functions
  BASE: "http://127.0.0.1:4530", NEWOLD: "http://127.0.0.1:4531",   // on ea9d057 functions
  PROXY: "http://127.0.0.1:4550",
};
export const CVX = { A: "http://127.0.0.1:3510", B: "http://127.0.0.1:3520", E: "http://127.0.0.1:3530" };
for (const u of [...Object.values(H), ...Object.values(CVX)]) if (/:(3210|4000)\b/.test(u)) throw new Error("refusing: main-stack port");

export const TAG = Date.now().toString(36);
export const SECRETS = [];
export const sha = (s) => createHash("sha256").update(s).digest("hex");
export const P8 = (s) => sha(s).slice(0, 8);
export const DEV = "dev-key", DEV_HASH = sha("dev-key");
/** A fresh 43-character key, like the design's. Remembered for K6. */
export const newKey = () => { const k = randomBytes(32).toString("base64url"); SECRETS.push(k); return k; };
/** A short key (under the floor), remembered for K6. */
export const shortKey = (label) => { const k = `qa-short-${label}-${randomBytes(4).toString("hex")}`; SECRETS.push(k); return k; };
export const name = (s) => `qa-${s}-${TAG}`;

// ---------------------------------------------------------------- HTTP
export async function hub(base, method, path, { body, key } = {}) {
  try {
    const r = await fetch(base + path, {
      method, headers: { "Content-Type": "application/json", ...(key !== undefined ? { "X-Agent-Key": key } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch {}
    return { status: r.status, json, text };
  } catch (e) { return { status: "socket-error", error: e.cause?.code ?? e.message, json: null, text: "" }; }
}
export const register = (base, n, key, card) => hub(base, "POST", "/a2a/register", { body: { name: n, apiKey: key, agentCard: card ?? { name: n, description: `QA ${n}`, kind: "ide-session" } } });
export const rotate = (base, cur, next, instanceId) => hub(base, "POST", "/a2a/rotate", { key: cur, body: { newApiKey: next, ...(instanceId ? { instanceId } : {}) } });
/** whoami: the name, null (resolves to no one, warn), or the HTTP status when not 200. */
export async function whoami(base, key) {
  const r = await hub(base, "GET", "/a2a/whoami", { key });
  return r.status === 200 ? (r.json?.name ?? null) : r.status;
}

// ---------------------------------------------------------------- Convex public API
async function capi(cvx, kind, path, args) {
  const r = await fetch(`${cvx}/api/${kind}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, args, format: "json" }) });
  const b = await r.json().catch(() => ({ status: "unparsed" }));
  return b.status === "success" ? { ok: true, value: b.value } : { ok: false, error: b.errorMessage, data: b.errorData };
}
export const cq = (cvx, path, args = {}) => capi(cvx, "query", path, args);
export const cm = (cvx, path, args = {}) => capi(cvx, "mutation", path, args);
export async function q(cvx, path, args = {}) { const r = await cq(cvx, path, args); if (!r.ok) throw new Error(`${path}: ${r.error}`); return r.value; }

// ---------------------------------------------------------------- Convex CLI (admin, per tree)
function cli(tree, args, input) {
  const r = spawnSync(process.execPath, [join(tree, "node_modules", "convex", "bin", "main.js"), ...args], {
    cwd: tree, encoding: "utf8", input, env: { ...process.env, CONVEX_AGENT_MODE: "anonymous" },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
/** Every row of a table (whole rows, parsed). */
export function data(table, tree = CAND) {
  const r = cli(tree, ["data", table, "--format", "jsonLines", "--limit", "8000"]);
  if (r.code !== 0) throw new Error(`convex data ${table}: ${r.err.split("\n")[0]}`);
  const rows = r.out.split(/\r?\n/).filter((l) => l.trim().startsWith("{")).map((l) => JSON.parse(l));
  if (rows.length >= 8000) throw new Error(`convex data ${table}: at the limit, undetermined`);
  return rows;
}
/** An internal function with the admin key (classifyAtDeploy, release). Returns parsed output or throws. */
export function run(fn, args = {}, tree = CAND) {
  const r = cli(tree, ["run", fn, JSON.stringify(args)]);
  if (r.code !== 0) return { ok: false, error: (r.err || r.out).trim().split("\n").slice(-1)[0] };
  let value = r.out.trim(); try { value = JSON.parse(value); } catch {}
  return { ok: true, value };
}
/** Append rows to a table (P8 seeding, Relay's approved method). */
export function importRows(table, rows, tree = CAND) {
  const f = join(TMP, `import-${table}-${Date.now()}.jsonl`);
  writeFileSync(f, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  const r = cli(tree, ["import", "--table", table, "--append", "--format", "jsonLines", "-y", f]);
  if (r.code !== 0) throw new Error(`import ${table}: ${(r.err || r.out).trim().split("\n").slice(-1)[0]}`);
}
/** P8: seed legacy agents rows (no keyStatus) that share one short key, plus their peers rows. */
export function seedLegacy(names, key, extra = {}) {
  const now = Date.now();
  importRows("agents", names.map((n, i) => ({ name: n, apiKeyHash: sha(key), agentCard: { name: n, description: `QA ${n}`, kind: "ide-session" }, lastSeen: now - i, status: "online", ...(extra[n] ?? {}) })));
  importRows("peers", names.map((n) => ({ name: n, type: "agent", isActive: true })));
}

// ---------------------------------------------------------------- clients
/** Run a client script from a tree. AGENT_KEY is never inherited; A2A_KEY_DIR is always scratch. */
export function client(tree, script, args, { hub: hubUrl = H.W, env = {}, keyDir = join(TMP, "keys"), timeoutMs = 120_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(tree, script), ...args], {
      cwd: tree, env: { ...process.env, HUB_URL: hubUrl, AGENT_KEY: undefined, A2A_KEY_DIR: keyDir, TMP, TEMP: TMP, TMPDIR: TMP, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => (stdout += d)); child.stderr.on("data", (d) => (stderr += d));
    const t = setTimeout(() => child.kill(), timeoutMs);
    child.on("close", (code) => { clearTimeout(t); appendFileSync(join(TMP, "client-output.log"), `\n### ${script} ${args.join(" ")}\n${stdout}\n${stderr}\n`); resolve({ code, stdout, stderr }); });
  });
}
export const hubTalk = (args, o) => client(o?.tree ?? CAND, "scripts/hub-talk.mjs", args, o);
export const hubKey = (args, o) => client(o?.tree ?? CAND, "scripts/hub-key.mjs", args, o);

// ---------------------------------------------------------------- results
export const results = [];
const LEAK = (s) => SECRETS.some((k) => s.includes(k) || s.includes(sha(k))) || s.includes(DEV_HASH);
export function check(row, required, observed, pass) {
  const o = typeof observed === "string" ? observed : JSON.stringify(observed);
  if (LEAK(o)) throw new Error(`${row}: an observation carried a key or full hash; refusing to print it`);
  results.push({ row, required, observed: o, pass: !!pass, at: new Date().toISOString() });
  console.log(`${pass ? "PASS" : "FAIL"} ${row}: ${required}\n      observed: ${o}`);
}
export const report = (row, text) => { if (LEAK(text)) throw new Error(`${row}: leak in report`); results.push({ row, report: text }); console.log(`INFO ${row}: ${text}`); };
export function finish(label) {
  const failed = results.filter((r) => r.pass === false);
  // K6: this process's keys, for the leak scan. Scratch only (QA_TMP), never tracked, never printed.
  writeFileSync(join(TMP, `secrets-${label}-${TAG}.json`), JSON.stringify(SECRETS));
  writeFileSync(join(TMP, `${label}-${TAG}.json`), JSON.stringify({ tag: TAG, results }, null, 1));
  console.log(`\n${label}: ${results.filter((r) => r.pass === true).length}/${results.filter((r) => "pass" in r).length} pass; failed: ${failed.map((f) => f.row).join(", ") || "none"}`);
  return failed.length;
}

// ---------------------------------------------------------------- key files and hub logs
import { readFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
const hk = await import(pathToFileURL(join(CAND, "scripts", "hub-key.mjs")).href);
export const KEYDIR = join(TMP, "keys");
/** The key a client stored for `n` on `hubUrl`, read in-process (never printed); remembered for K6. */
export function keyOf(n, hubUrl = H.W) {
  const p = hk.keyPath(hubUrl, n, { A2A_KEY_DIR: KEYDIR });
  if (!existsSync(p)) return null;
  const k = readFileSync(p, "utf8").trim();
  SECRETS.push(k);
  return k;
}
export const keyFile = (n, hubUrl = H.W) => hk.keyPath(hubUrl, n, { A2A_KEY_DIR: KEYDIR });
/** How many lines of a hub's stdout+stderr log match `re` (hub = start-stack part name). */
export function logCount(part, re) {
  let n = 0;
  for (const s of ["out", "err"]) {
    const f = join(TMP, "logs", `${part}.${s}.log`);
    if (existsSync(f)) n += readFileSync(f, "utf8").split(/\r?\n/).filter((l) => re.test(l)).length;
  }
  return n;
}
/** Key-shaped runs in client output (K6.2): 43-char base64url or 64-hex. */
export const keyShaped = (t) => /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/.test(t) || /(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])/i.test(t);
