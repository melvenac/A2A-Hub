// OP1 and OP2 (loop-6-qa-criteria.md): the operator commands, run as documented, on the scratch stack.
// OP1: `node scripts/hub-enroll.mjs --as <name>` (design section 4 / CHANGELOG), HUB_URL = scratch strict hub.
// OP2: docs/loops/loop-6-create-human.md at the candidate, step 1 (the Git Bash hash command, copied
//      from the doc) and step 2 (`npx convex run agents:createHuman ...`, scratch: no ssh/export lines).
//      The doc has no step that makes the new human's key file; QA supplies it with
//      `hub-key.mjs init --as <name>` (no --register) and says so. Codes are never printed.
// Usage: QA_TMP=... OP_SHA=<sha> node op6.mjs
import { spawnSync, execFileSync } from "node:child_process";
import { readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { H, TMP, TREE, key, placeKey, rows, hub, setRow, check, summary, SECRETS } from "./l6.mjs";
setRow("OP");
// Before each check: if an observation holds a secret (raw or sha256), name the FIELD and redact it, so
// the guard's refusal says where, never what.
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
function redact(obs) {
  const hits = [];
  const walk = (v, path) => {
    if (typeof v === "string") { let o = v; SECRETS.forEach((s, i) => { for (const x of [s, sha256(s)]) if (o.includes(x)) { hits.push(`${path} holds secret #${i}${x === s ? "" : " (sha256)"}`); o = o.split(x).join("<redacted>"); } }); return o; }
    if (Array.isArray(v)) return v.map((x, i) => walk(x, `${path}[${i}]`));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, `${path}.${k}`)]));
    return v;
  };
  const out = walk(obs, "obs"); if (hits.length) console.log("REDACTED:", hits.join("; ")); return out;
}
const env = { ...process.env, HUB_URL: H.nS, A2A_KEY_DIR: join(TMP, "keys") }; delete env.AGENT_KEY;
const run = (args, opts = {}) => { const r = spawnSync(process.execPath, args, { cwd: TREE.cand, env, encoding: "utf8", ...opts }); return { rc: r.status, out: r.stdout ?? "", err: r.stderr ?? "" }; };
// ---------------------------------------------------------------- OP1
placeKey("aaron", H.nS); placeKey("grokbot", H.nS);
const a = run(["scripts/hub-enroll.mjs", "--as", "aaron"]);
const code = a.err.trim(); const lines = a.err.trim().split(/\r?\n/).filter(Boolean);
if (code) { SECRETS.push(code); appendFileSync(join(TMP, "codes", "op1.code"), code + "\n"); }
const keyShown = [key("aaron"), createHash("sha256").update(key("aaron")).digest("hex")].some((s) => (a.out + a.err).includes(s));
const g = run(["scripts/hub-enroll.mjs", "--as", "grokbot"]);
const use = await hub(H.nS, "POST", "/a2a/register", { body: { name: "qa-op1b", apiKey: key("qa-op1b"), agentCard: { name: "qa-op1b", description: "op1" }, enrollmentCode: code } });
check("OP1", "hub-enroll --as aaron: exit 0, stdout empty, one stderr line (the code), no key or key hash printed; the code enrolls a name; --as an agent exits 1 with the agent-issue text and no code",
  redact({ rc: a.rc, stdoutEmpty: a.out === "", stderrLines: lines.length, codeLen: code.length, keyShown, codeEnrolls: use.status, agent: [g.rc, g.err.trim().slice(0, 80)] }),
  a.rc === 0 && a.out === "" && lines.length === 1 && code.length >= 40 && !keyShown && use.status === 200 && g.rc === 1 && /only a human owner can issue an enrollment code/.test(g.err) && !/[A-Za-z0-9_-]{40,}/.test(g.err));
// ---------------------------------------------------------------- OP2
const doc = execFileSync("git", ["show", `${process.env.OP_SHA}:docs/loops/loop-6-create-human.md`], { encoding: "utf8" });
const bashCmd = doc.split("Git Bash:")[1].split("```")[1].trim();        // the doc's step-1 command, verbatim
const NAME = "qa-op2b";
const k0 = run(["scripts/hub-key.mjs", "init", "--as", NAME, "--hub", H.nS]);   // QA's step 0 (not in the doc)
const keyFile = join(TMP, "keys", "127.0.0.1-4711", `${NAME}.key`);
const cmd = bashCmd.replace("$HOME/.a2a-hub/keys/100.124.212.87-4000/NAME.key", keyFile.replace(/\\/g, "/"));
const h = spawnSync("bash", ["-c", cmd], { encoding: "utf8" });
const hash = (h.stdout ?? "").trim();
const want = createHash("sha256").update(readFileSync(keyFile, "utf8").trim()).digest("hex");
const step2 = doc.split("## 2.")[1].match(/npx convex run agents:createHuman '([^']+)'/)[1].replace("NAME", NAME).replace("HASH", hash);
const c1 = spawnSync(process.execPath, ["node_modules/convex/bin/main.js", "run", "agents:createHuman", step2], { cwd: TREE.cand, env: { ...process.env, CONVEX_AGENT_MODE: "anonymous" }, encoding: "utf8" });
const c2 = spawnSync(process.execPath, ["node_modules/convex/bin/main.js", "run", "agents:createHuman", step2], { cwd: TREE.cand, env: { ...process.env, CONVEX_AGENT_MODE: "anonymous" }, encoding: "utf8" });
const row = rows("agents").find((r) => r.name === NAME); const peer = rows("peers").find((p) => p.name === NAME);
const who = await hub(H.nS, "GET", "/a2a/whoami", { rawKey: readFileSync(keyFile, "utf8").trim() });
const e = run(["scripts/hub-enroll.mjs", "--as", NAME]); if (e.err.trim()) { SECRETS.push(e.err.trim()); appendFileSync(join(TMP, "codes", "op2.code"), e.err.trim() + "\n"); }
check("OP2 (doc as written)", "the doc's steps, exactly: step-1 prints only the sha256 hex of the trimmed key; step 2 gives {ok:true}; a second run is refused 'name exists'; the row is human, owner itself, a human peer; the key authenticates and can issue",
  redact({ stepZeroSuppliedByQA: "hub-key.mjs init --as qa-op2 (no --register): rc " + k0.rc, step1: { rc: h.status, oneLine: hash.split("\n").length === 1, isHex64: /^[0-9a-f]{64}$/.test(hash), equalsHashKey: hash === want }, step2: (c1.stdout + c1.stderr).trim().slice(0, 60), again: /name exists/.test(c2.stdout + c2.stderr), row: [row?.agentCard?.kind, row?.owner], peer: peer?.type, whoami: [who.status, who.json?.name], canIssue: e.rc }),
  h.status === 0 && hash === want && /"ok": ?true|ok: true/.test(c1.stdout + c1.stderr) && /name exists/.test(c2.stdout + c2.stderr) && row?.agentCard?.kind === "human" && row?.owner === NAME && peer?.type === "human" && who.json?.name === NAME && e.rc === 0);
check("OP2 completeness", "the doc lets Aaron create a NEW human without programming: it must say how the new human's key file is made (no step does; QA used hub-key.mjs init)", { docMentionsKeyCreation: /hub-key\.mjs init|--init-key|key file is created|create the key/i.test(doc) }, /hub-key\.mjs init|create the key/i.test(doc));
summary(join(TMP, "op6.results.txt"));
