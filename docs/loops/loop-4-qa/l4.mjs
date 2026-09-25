// Loop 4 QA harness core (loop-4-qa-criteria.md). Keys are generated here or by the candidate's
// hub-key.mjs into QA_TMP/keys, and are never printed: output carries names, statuses and 8-hex
// hash prefixes only.
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";

export const TMP = process.env.QA_TMP;
if (!TMP) throw new Error("QA_TMP not set");
export const H = {
  newW: "http://127.0.0.1:4610", newS: "http://127.0.0.1:4611", noUi: "http://127.0.0.1:4612",
  oldW: "http://127.0.0.1:4620", oldS: "http://127.0.0.1:4621", mut: "http://127.0.0.1:4640",
};
export const CVX = "http://127.0.0.1:3610";
export const sha = (s) => createHash("sha256").update(s).digest("hex");
export const P8 = (s) => sha(s).slice(0, 8);
export const SECRETS = [];
// Every key this harness makes or reads is appended to QA_TMP/keys/_harness.keys (scratch keys
// only, inside the QA key dir, P6) so K can count exact values later. Never printed.
const KEYLOG = join(TMP, "keys", "_harness.keys");
export function remember(k) { if (!SECRETS.includes(k)) { SECRETS.push(k); appendFileSync(KEYLOG, k + "\n"); } }
export const newKey = () => { const k = randomBytes(32).toString("base64url"); remember(k); return k; };

export async function hub(base, method, path, { body, key, headers = {} } = {}) {
  try {
    const r = await fetch(base + path, {
      method, redirect: "manual",
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(key !== undefined ? { "X-Agent-Key": key } : {}), ...headers },
      body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body)),
    });
    const text = await r.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch {}
    return { status: r.status, json, text, headers: Object.fromEntries(r.headers) };
  } catch (e) { return { status: "socket-error", error: e.cause?.code ?? e.message, json: null, text: "", headers: {} }; }
}
export const register = (base, n, key, kind = "ide-session") =>
  hub(base, "POST", "/a2a/register", { body: { name: n, apiKey: key, agentCard: { name: n, description: `QA ${n}`, ...(kind ? { kind } : {}) } } });
export const heartbeat = (base, n, key) => hub(base, "POST", `/a2a/heartbeat/${n}`, { key, body: {} });
export async function whoami(base, key) {
  const r = await hub(base, "GET", "/a2a/whoami", { key });
  return r.status === 200 ? (r.json?.name ?? null) : r.status;
}
/** Read a key file written by the candidate's hub-key.mjs; never printed. */
export function keyFile(hubUrl, name) {
  const u = new URL(hubUrl);
  const p = join(TMP, "keys", `${u.hostname}-${u.port}`, `${name}.key`);
  if (!existsSync(p)) throw new Error(`no key file for ${name} at ${hubUrl}`);
  const k = readFileSync(p, "utf8").trim(); remember(k); return k;
}

export const results = [];
export function check(row, required, observed, pass) {
  const o = typeof observed === "string" ? observed : JSON.stringify(observed);
  for (const s of SECRETS) if (o.includes(s) || o.includes(sha(s))) throw new Error(`${row}: key material in observation`);
  results.push({ row, required, observed: o, pass });
  console.log(`${pass ? "PASS" : "FAIL"} ${row}: ${required} :: ${o}`);
  return pass;
}
export const summary = () => {
  const f = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length} checks, ${results.length - f} pass, ${f} fail`);
  return f;
};
