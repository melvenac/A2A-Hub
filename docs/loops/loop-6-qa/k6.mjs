// K6 (loop-6-qa-criteria.md, C1): count every scratch key and every enrollment code, and the sha256 hex
// of each (hashKey, src/auth.ts:37), across log files and recorded responses. Prints counts, never values.
// Needles: QA_TMP/keys/**/*.key and _harness.keys; QA_TMP/codes/*.code (one code per line).
// Excluded by request id, not by pattern: the issue responses, listed one id per line in
// QA_TMP/codes/issue-responses.txt. A recorded response file is JSONL, one {id, ...} per line.
// Usage: QA_TMP=... node k6.mjs --selftest | node k6.mjs <label>=<path> ...
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
const TMP = process.env.QA_TMP; if (!TMP) throw new Error("QA_TMP not set");
const sha = (s) => createHash("sha256").update(s).digest("hex");
function lines(p) { return readFileSync(p, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean); }
function walkFiles(d, pred, out = []) { if (!existsSync(d)) return out; for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walkFiles(p, pred, out); else if (pred(e.name)) out.push(p); } return out; }
function load(root = TMP) {
  const keys = walkFiles(join(root, "keys"), (n) => n.endsWith(".key") || n === "_harness.keys").flatMap(lines);
  const codes = walkFiles(join(root, "codes"), (n) => n.endsWith(".code")).flatMap(lines);
  const excl = existsSync(join(root, "codes", "issue-responses.txt")) ? new Set(lines(join(root, "codes", "issue-responses.txt"))) : new Set();
  return { keys, codes, excl, needles: [...keys, ...codes].flatMap((x) => [x, sha(x)]).map((s) => Buffer.from(s)) };
}
const count = (buf, ns) => { let n = 0; for (const x of ns) { let i = -1; while ((i = buf.indexOf(x, i + 1)) !== -1) n++; } return n; };
function scan(path, L) {
  const st = { files: 0, bytes: 0, hits: 0, excludedResponses: 0, responses: 0 };
  const files = statSync(path).isDirectory() ? walkFiles(path, () => true) : [path];
  for (const f of files) {
    const b = readFileSync(f); st.files++; st.bytes += b.length;
    if (f.endsWith(".jsonl")) { // recorded responses: skip the listed issue responses by id, scan the rest
      for (const l of b.toString("utf8").split("\n").filter(Boolean)) {
        let id = null; try { id = JSON.parse(l).id; } catch {}
        st.responses++; if (id && L.excl.has(String(id))) { st.excludedResponses++; continue; }
        st.hits += count(Buffer.from(l), L.needles);
      }
    } else st.hits += count(b, L.needles);
  }
  return st;
}
if (process.argv[2] === "--selftest") {
  const R = join(TMP, "k6-selftest"); rmSync(R, { recursive: true, force: true });
  mkdirSync(join(R, "keys", "h"), { recursive: true }); mkdirSync(join(R, "codes"), { recursive: true }); mkdirSync(join(R, "logs"), { recursive: true });
  const key = "qa6-key-" + "k".repeat(40), code = "qa6code" + "c".repeat(36);
  writeFileSync(join(R, "keys", "h", "x.key"), key + "\n"); writeFileSync(join(R, "codes", "a.code"), code + "\n"); writeFileSync(join(R, "codes", "issue-responses.txt"), "issue-1\n");
  const L = load(R);
  writeFileSync(join(R, "logs", "clean.log"), "[enroll] ISSUE issuer=aaron\n[authz] WOULD REJECT x caller=qa\n");
  writeFileSync(join(R, "logs", "planted.log"), `a ${key} b ${sha(key)} c ${code} d ${sha(code)}\n`);
  writeFileSync(join(R, "logs", "resp.jsonl"), [JSON.stringify({ id: "issue-1", body: { code } }), JSON.stringify({ id: "r2", body: { error: "not found" } })].join("\n") + "\n");
  writeFileSync(join(R, "logs", "resp-leak.jsonl"), JSON.stringify({ id: "r3", body: { echo: code } }) + "\n");
  const c = scan(join(R, "logs", "clean.log"), L), p = scan(join(R, "logs", "planted.log"), L), r = scan(join(R, "logs", "resp.jsonl"), L), rl = scan(join(R, "logs", "resp-leak.jsonl"), L);
  const ok = L.keys.length === 1 && L.codes.length === 1 && c.hits === 0 && p.hits === 4 && r.hits === 0 && r.excludedResponses === 1 && rl.hits === 1;
  console.log(`selftest: clean ${c.hits} (0); planted key+hash+code+hash ${p.hits} (4); issue response excluded ${r.excludedResponses} (1) with hits ${r.hits} (0); non-issue response echoing a code ${rl.hits} (1)`);
  rmSync(R, { recursive: true, force: true });
  console.log(ok ? "SELFTEST PASS" : "SELFTEST FAIL"); process.exit(ok ? 0 : 1);
}
const L = load();
if (L.keys.length < 2) { console.log(`UNDETERMINED: only ${L.keys.length} keys loaded`); process.exit(2); }
console.log(`K6: ${L.keys.length} keys, ${L.codes.length} codes (${L.needles.length} needles incl. sha256), ${L.excl.size} issue responses excluded by id`);
let bad = 0;
for (const a of process.argv.slice(2)) {
  const [label, p] = a.split(/=(.*)/s);
  if (!existsSync(p)) { console.log(`UNDETERMINED ${label}: path missing`); bad++; continue; }
  const s = scan(p, L);
  if (s.files === 0) { console.log(`UNDETERMINED ${label}: no files walked`); bad++; continue; }
  console.log(`${s.hits ? "FAIL" : "PASS"} ${label}: ${s.files} files, ${s.bytes} bytes, ${s.responses} responses (${s.excludedResponses} excluded issue responses), hits ${s.hits}`);
  if (s.hits) bad++;
}
process.exit(bad ? 1 : 0);
