// Instrument H (loop-1-qa-criteria.md): drives hub-talk and reads hub/Convex state.
// Every URL comes from the environment. There are no defaults, and main-stack ports are refused.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const HUB = process.env.QA_HUB;         // the QA hub, or the fault proxy in front of it
export const DIRECT = process.env.QA_HUB_DIRECT || HUB; // always the hub itself, never the proxy
export const CVX = process.env.QA_CONVEX;
export const TMP = process.env.QA_TMP;         // cursor files live here, never in the real %TEMP%
for (const [k, v] of Object.entries({ QA_HUB: HUB, QA_CONVEX: CVX, QA_TMP: TMP })) {
  if (!v) throw new Error(`${k} must be set; no defaults`);
}
if (/:(3210|4000)\b/.test([HUB, DIRECT, CVX].join(" "))) throw new Error("refusing: main-stack port");
mkdirSync(TMP, { recursive: true });

const KEY = { "X-Agent-Key": "dev-key" };

/** Run a hub-talk script. Returns stdout, stderr, exit code and wall time, kept separate. */
export function talk(script, args, { hub = HUB, env = {}, timeoutMs = 120_000 } = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [script, ...args], {
      env: { ...process.env, HUB_URL: hub, AGENT_KEY: "dev-key", TMP, TEMP: TMP, TMPDIR: TMP, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ args, stdout, stderr, code, signal, ms: Date.now() - t0 });
    });
  });
}

/** Raw hub call on the DIRECT hub. Returns status, raw text and parsed JSON (or null). */
export async function hub(method, path, body, { base = DIRECT, headers = KEY } = {}) {
  const r = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { status: r.status, text, json };
}

/** Receipts, read straight from GET /reads (P5). Never read from hub-talk's rendering. */
export async function reads(sessionId) {
  const r = await hub("GET", `/a2a/session/${sessionId}/reads`);
  return { ...r, participant: (name) => r.json?.participants?.find((p) => p.name === name) };
}

export async function messages(sessionId) {
  const r = await hub("GET", `/a2a/session/${sessionId}/messages`);
  if (r.status !== 200) throw new Error(`messages ${r.status} ${r.text}`);
  return r.json.messages;
}

/** Public Convex query on QA Convex (snapshots for A5). */
export async function cq(path, args = {}) {
  const r = await fetch(`${CVX}/api/query`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  const b = await r.json();
  if (b.status !== "success") throw new Error(`${path}: ${b.errorMessage ?? JSON.stringify(b)}`);
  return b.value;
}

export async function register(name, agentCard = { name, description: `QA ${name}`, kind: "ide-session" }) {
  return hub("POST", "/a2a/register", { name, apiKey: "dev-key", agentCard });
}

export async function room(participants, title = "qa-room") {
  const r = await hub("POST", "/a2a/session", { title, participants, maxTurns: 500 });
  if (r.status !== 200) throw new Error(`room ${r.status} ${r.text}`);
  return r.json.sessionId;
}

export function cursorFile(me, sessionId) {
  return join(TMP, `a2a-hub-talk-${me}-${sessionId}.after`);
}

export function sha256OrAbsent(path) {
  return existsSync(path) ? createHash("sha256").update(readFileSync(path)).digest("hex") : "absent";
}

/** A result row: what was required, what was observed, pass or fail. */
export const results = [];
export function check(row, required, observed, pass) {
  results.push({ row, required, observed, pass: !!pass, at: new Date().toISOString() });
  console.log(`${pass ? "PASS" : "FAIL"} ${row}: ${required}\n      observed: ${typeof observed === "string" ? observed : JSON.stringify(observed)}`);
}
