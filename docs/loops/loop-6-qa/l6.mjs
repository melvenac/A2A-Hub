// Loop 6 QA harness core (loop-6-qa-criteria.md). Builds on loop-5-qa/l5.mjs (keys under QA_TMP/keys,
// never printed; direct Convex calls; scratch row reader). Adds:
//  - the response recorder: every hub request is written, with an id, to QA_TMP/resp/<row>.jsonl (C1);
//  - codes: every issued code goes to QA_TMP/codes/*.code, and its issue response id to
//    QA_TMP/codes/issue-responses.txt, so K6 can exclude exactly those responses;
//  - the [enroll] line parser (design section 7 grammar).
import { appendFileSync, mkdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import * as L5 from "../loop-5-qa/l5.mjs";
export { key, placeKey, UNKNOWN, cq, cm, cvxRun, cvxData, check, summary, sleep, norm, sha, P8, SECRETS, parseAuthz } from "../loop-5-qa/l5.mjs";
export const { TMP, H, CVX, TREE, LOGOF } = L5;

mkdirSync(join(TMP, "resp"), { recursive: true }); mkdirSync(join(TMP, "codes"), { recursive: true });
let ROW = "misc";
export const setRow = (r) => { ROW = r.replace(/[^\w.-]/g, "_"); };
/** L5's hub(), recorded. Returns the response plus its recorder id. */
export async function hub(base, method, path, opt = {}) {
  const id = randomBytes(6).toString("hex");
  const r = await L5.hub(base, method, path, opt);
  appendFileSync(join(TMP, "resp", `${ROW}.jsonl`), JSON.stringify({ id, base, method, path, status: r.status, text: r.text }) + "\n");
  return { ...r, id };
}
export const register = (base, name, { kind = "ide-session", code, card = {}, top = {}, apiKey } = {}) =>
  hub(base, "POST", "/a2a/register", { body: { name, apiKey: apiKey ?? L5.key(name), agentCard: { name, description: `QA ${name}`, ...(kind ? { kind } : {}), ...card }, ...(code ? { enrollmentCode: code } : {}), ...top } });
/** POST /a2a/enroll as a name; a returned code is remembered for K6 and its response id excluded. */
export async function issue(base, as) {
  const r = await hub(base, "POST", "/a2a/enroll", { as, body: {} });
  if (r.json?.code) {
    appendFileSync(join(TMP, "codes", "issued.code"), r.json.code + "\n");
    appendFileSync(join(TMP, "codes", "issue-responses.txt"), r.id + "\n");
  }
  return r;
}
/** A code the harness made up (never issued): remembered so K6 would also catch it in a log. */
export function fakeCode() { const c = randomBytes(32).toString("base64url"); appendFileSync(join(TMP, "codes", "fake.code"), c + "\n"); return c; }

// ---------------------------------------------------------------- [enroll] lines
const ELINE = /^\[enroll\] (REJECT|WOULD REJECT) (no-code|expired|used|not-valid|kind=human|agent-issue) on (GET|POST) (\S+) caller=(\S+)( \(AUTH_MODE=warn; set AUTH_MODE=strict to enforce\))?$/;
const EISSUE = /^\[enroll\] ISSUE issuer=(\S+)$/;
export function parseEnroll(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim(); if (!l.includes("[enroll]")) continue;
    let m = ELINE.exec(l);
    if (m) { out.push({ ok: true, mode: m[1], what: m[2], route: `${m[3]} ${m[4]}`, caller: m[5], warnTail: !!m[6], bad32: /[A-Za-z0-9+/_=-]{32,}/.test(l) }); continue; }
    m = EISSUE.exec(l);
    out.push(m ? { ok: true, issue: true, issuer: m[1], bad32: /[A-Za-z0-9+/_=-]{32,}/.test(l) } : { ok: false, raw: l.slice(0, 160) });
  }
  return out;
}
const logPath = (base) => join(TMP, "logs", `${LOGOF[base]}.err.log`);
const logSize = (base) => (existsSync(logPath(base)) ? statSync(logPath(base)).size : 0);
/** Run fn; return the [enroll] and [authz] lines each hub appended meanwhile. */
export async function withLines(bases, fn) {
  const before = Object.fromEntries(bases.map((b) => [b, logSize(b)]));
  const res = await fn();
  await new Promise((r) => setTimeout(r, 500));
  const enroll = {}, authz = {};
  for (const b of bases) { const t = readFileSync(logPath(b)).subarray(before[b]).toString("utf8"); enroll[LOGOF[b]] = parseEnroll(t); authz[LOGOF[b]] = L5.parseAuthz(t); }
  return { res, enroll, authz };
}
/** Parsed rows of a table on the candidate's scratch Convex (admin, via the CLI). */
export const rows = (table) => L5.cvxData(L5.TREE.cand, table);
export const agentRow = (name) => rows("agents").filter((r) => r.name === name);
