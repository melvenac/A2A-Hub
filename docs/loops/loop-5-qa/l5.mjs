// Loop 5 QA harness core (loop-5-qa-criteria.md). Keys are generated here and written only under
// QA_TMP/keys (P6); never printed. Output carries names, statuses, ids and 8-hex prefixes only.
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";

export const TMP = process.env.QA_TMP; if (!TMP) throw new Error("QA_TMP not set");
export const H = {
  nW: "http://127.0.0.1:4710", nS: "http://127.0.0.1:4711", onW: "http://127.0.0.1:4712", onS: "http://127.0.0.1:4713",
  ooW: "http://127.0.0.1:4720", ooS: "http://127.0.0.1:4721", noW: "http://127.0.0.1:4730", noS: "http://127.0.0.1:4731",
  mut: "http://127.0.0.1:4740",
};
export const LOGOF = { [H.nW]: "nW", [H.nS]: "nS", [H.onW]: "onW", [H.onS]: "onS", [H.ooW]: "ooW", [H.ooS]: "ooS", [H.noW]: "noW", [H.noS]: "noS", [H.mut]: "mut" };
export const CVX = { N: "http://127.0.0.1:3710", O: "http://127.0.0.1:3720" };
export const TREE = { cand: "C:/Users/melve/Worktrees/qa3-cand", old: "C:/Users/melve/Worktrees/qa3-old" };
export const sha = (s) => createHash("sha256").update(s).digest("hex");
export const P8 = (s) => sha(s).slice(0, 8);

// ---------------------------------------------------------------- keys
const KDIR = join(TMP, "keys"); const HK = join(KDIR, "_harness");
mkdirSync(HK, { recursive: true });
export const SECRETS = [];
const KEYLOG = join(KDIR, "_harness.keys");
function remember(k) { if (!SECRETS.includes(k)) { SECRETS.push(k); appendFileSync(KEYLOG, k + "\n"); } }
if (existsSync(KEYLOG)) for (const l of readFileSync(KEYLOG, "utf8").split(/\r?\n/)) if (l.trim()) SECRETS.push(l.trim());
/** The key for a name: made once, kept in QA_TMP/keys/_harness/<name>.key. */
export function key(name) {
  const f = join(HK, `${name}.key`);
  if (existsSync(f)) { const k = readFileSync(f, "utf8").trim(); remember(k); return k; }
  const k = randomBytes(32).toString("base64url"); writeFileSync(f, k); remember(k); return k;
}
/** Put a name's key where hub-talk / the daemon / hub-key look for it for this hub. */
export function placeKey(name, hubUrl) {
  const u = new URL(hubUrl); const d = join(KDIR, `${u.hostname}-${u.port}`); mkdirSync(d, { recursive: true });
  writeFileSync(join(d, `${name}.key`), key(name));
}
export const UNKNOWN = (() => { const k = "qa5-unknown-" + "0".repeat(40); remember(k); return k; })();

// ---------------------------------------------------------------- HTTP
export async function hub(base, method, path, { body, as, rawKey, headers = {} } = {}) {
  const k = rawKey ?? (as ? key(as) : undefined);
  try {
    const r = await fetch(base + path, {
      method, redirect: "manual",
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(k !== undefined ? { "X-Agent-Key": k } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
    const text = await r.text(); let json = null; try { json = text ? JSON.parse(text) : null; } catch {}
    return { status: r.status, json, text };
  } catch (e) { return { status: "socket-error", error: e.cause?.code ?? e.message, json: null, text: "" }; }
}
export const register = (base, name, kind = "ide-session", extra = {}) =>
  hub(base, "POST", "/a2a/register", { body: { name, apiKey: key(name), agentCard: { name, description: `QA ${name}`, kind, ...(extra.card ?? {}) }, ...(extra.top ?? {}) } });
export async function cq(cvx, path, args = {}) {
  const r = await fetch(`${cvx}/api/query`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, args, format: "json" }) });
  const b = await r.json(); if (b.status !== "success") throw new Error(`${path}: ${b.errorMessage}`); return b.value;
}
export async function cm(cvx, path, args = {}) {
  const r = await fetch(`${cvx}/api/mutation`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, args, format: "json" }) });
  const b = await r.json(); if (b.status !== "success") throw new Error(`${path}: ${b.errorMessage}`); return b.value;
}
/** `convex run` an internal function on the scratch deployment of a tree (admin, anonymous local). */
export function cvxRun(tree, fn, args) {
  const out = execFileSync(process.execPath, ["node_modules/convex/bin/main.js", "run", fn, JSON.stringify(args)], {
    cwd: tree, encoding: "utf8", env: { ...process.env, CONVEX_AGENT_MODE: "anonymous" }, stdio: ["ignore", "pipe", "pipe"],
  });
  const t = out.trim(); try { return JSON.parse(t.slice(t.indexOf("{"))); } catch { return t; }
}
export function cvxData(tree, table) {
  const out = execFileSync(process.execPath, ["node_modules/convex/bin/main.js", "data", table, "--limit", "8000", "--format", "jsonl"], {
    cwd: tree, encoding: "utf8", env: { ...process.env, CONVEX_AGENT_MODE: "anonymous" }, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20,
  });
  return out.split(/\r?\n/).filter((l) => l.trim().startsWith("{")).map((l) => JSON.parse(l));
}

// ---------------------------------------------------------------- [authz] log reader (LOG)
const LINE = /^\[authz\] (REJECT|WOULD REJECT) (.+?) on (GET|POST|PUT|DELETE|PATCH) (\S+) caller=(\S+)( \(AUTH_MODE=warn; set AUTH_MODE=strict to enforce\))?$/;
export function parseAuthz(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim(); if (!l.includes("[authz]")) continue;
    const m = LINE.exec(l);
    out.push(m ? { ok: true, mode: m[1], what: m[2], method: m[3], route: m[4], caller: m[5], warnTail: !!m[6], bad32: /[A-Za-z0-9+/_=-]{32,}/.test(l) } : { ok: false, raw: l.slice(0, 160) });
  }
  return out;
}
const logPath = (base) => join(TMP, "logs", `${LOGOF[base]}.err.log`);
const logSize = (base) => (existsSync(logPath(base)) ? statSync(logPath(base)).size : 0);
/** Run fn, and return the [authz] lines the given hubs appended while it ran. */
export async function withLog(bases, fn) {
  const before = Object.fromEntries(bases.map((b) => [b, logSize(b)]));
  const res = await fn();
  await new Promise((r) => setTimeout(r, 400));
  const lines = {};
  for (const b of bases) { const buf = readFileSync(logPath(b)); lines[LOGOF[b]] = parseAuthz(buf.subarray(before[b]).toString("utf8")); }
  return { res, lines };
}

// ---------------------------------------------------------------- results
export const results = [];
export function check(row, required, observed, pass) {
  const o = typeof observed === "string" ? observed : JSON.stringify(observed);
  for (const s of SECRETS) if (o.includes(s) || o.includes(sha(s))) throw new Error(`${row}: key material in observation`);
  results.push({ row, required, observed: o, pass: !!pass });
  console.log(`${pass ? "PASS" : "FAIL"} ${row}: ${required} :: ${o.slice(0, 700)}`);
  return !!pass;
}
export function summary(file) {
  const f = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length} checks, ${results.length - f} pass, ${f} fail`);
  if (file) writeFileSync(file, results.map((r) => `${r.pass ? "PASS" : "FAIL"} ${r.row}: ${r.required} :: ${r.observed}`).join("\n") + "\n");
  return f;
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Strip volatile fields for old/new comparison (named: timestamps, ids, request ids, ports). */
export function norm(v) {
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) =>
    [k, /(At|Time|time|lastSeen|_creationTime|Ms|ms|^_id$|Id$|^id$)$/.test(k) && (typeof x === "number" || typeof x === "string") ? "<v>" : norm(x)]));
  return typeof v === "string" ? v.replace(/\[Request ID: [0-9a-f]+\]/g, "[Request ID: <id>]").replace(/\b47\d\d\b/g, "<port>") : v;
}
