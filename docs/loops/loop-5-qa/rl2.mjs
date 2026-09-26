// RL2 (loop-5-qa-criteria.md, A1 / O4; deploy plan steps 8-9): after the v1.11.0 a2a-readonly and
// a2a-k7.mjs are installed on tcm, re-run T-065's rows with the READONLY key only (t065-qa/t065.mjs,
// minus NF, which RL2 does not name): M1-M4, AL, AS, N (19 refusals, rc 2), L (secret scan, planted
// positive first). Plus the new script's rows, whose parsers are self-tested on planted output
// (new-format positive must pass, v1.10.0-format negative must fail) before any tcm read:
//   RL2.M3 the running container is the new image (RL2_NEW_ID, 12 hex); 648ac3963dd7 is still listed
//   RL2.AL auth-log's header carries authz-lines=, and the printed [auth]/[authz] lines match its counts
//   RL3    agents-summary: `PASS ownerAssigned rows-without-owner=0`, K7=PASS, no FAIL/UNDETERMINED
// The scripts' sha256 on tcm is not readable with this key; it is Rivet's step-8 full-key output,
// compared here with the v1.11.0 blobs (c7728ab751cd / f1de001c3435) via RL2_HASHES.
// Usage: node rl2.mjs --selftest | RL2_NEW_ID=<12hex> RL2_HASHES="<a2a-readonly12> <a2a-k7 12>" node rl2.mjs <outdir>
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------- RL2's own parsers, and their selftest
const OLD_ID = "648ac3963dd7";
function rl2M3(out, newId) {
  const cid = /^container-image-id=([0-9a-f]{12})$/m.exec(out)?.[1] ?? null;
  return { ok: cid === newId && cid !== OLD_ID && out.includes(OLD_ID), obs: { containerImageId: cid, expected: newId, oldStillListed: out.includes(OLD_ID) } };
}
function rl2AL(out) {
  const h = /^auth-lines=(\d+) authz-lines=(\d+) first=\S* last=\S* total-lines=(\d+)$/m.exec(out);
  const lines = out.split("\n");
  const pa = lines.filter((l) => /\[auth\]/.test(l)).length, pz = lines.filter((l) => /\[authz\]/.test(l)).length;
  return { ok: !!h && +h[1] === pa && +h[2] === pz, obs: { header: h?.[0] ?? null, printedAuth: pa, printedAuthz: pz } };
}
function rl3(out) {
  const line = /^PASS ownerAssigned rows-without-owner=0$/m.test(out), k7 = /^rows=\d+ K7=PASS$/m.test(out);
  return { ok: line && k7 && !/FAIL|UNDETERMINED/.test(out), obs: { ownerAssigned0: line, k7Pass: k7, failOrUndet: /FAIL|UNDETERMINED/.test(out) } };
}
if (process.argv[2] === "--selftest") {
  const NEW = "abcdef012345", ts = "2026-09-26T05:00:00.000Z";
  const pos = {
    img: `container=/a2a-hub image=a2a-hub status=running started=${ts}\ncontainer-image-id=${NEW}\na2a-hub:latest ${NEW} x\na2a-hub:v1.11.0 ${NEW} x\na2a-hub:prev ${OLD_ID} x`,
    al: `auth-lines=1 authz-lines=2 first=${ts} last=${ts} total-lines=9\nlog-driver=json-file started=${ts}\n${ts} [auth] WOULD REJECT x\n${ts} [authz] a\n${ts} [authz] b`,
    as: `aaron\tkind=human\towner=aaron\nPASS names-unique\nrows=8 K7=PASS\nPASS ownerAssigned rows-without-owner=0`,
  };
  const neg = { // v1.10.0 shapes, and the failure lines the new script can print
    img: `container=/a2a-hub image=a2a-hub status=running started=${ts}\ncontainer-image-id=${OLD_ID}\na2a-hub:latest ${OLD_ID} x`,
    al: `auth-lines=1 first=${ts} last=${ts} total-lines=9\n${ts} [auth] WOULD REJECT x`,
    alMiscount: `auth-lines=1 authz-lines=3 first=${ts} last=${ts} total-lines=9\n${ts} [auth] x\n${ts} [authz] a`,
    as: `aaron\tkind=human\nPASS names-unique\nrows=8 K7=PASS`,
    asFail: `rows=8 K7=PASS\nFAIL ownerAssigned rows-without-owner=1`,
  };
  const r = [["M3 pos", rl2M3(pos.img, NEW).ok, true], ["M3 neg", rl2M3(neg.img, NEW).ok, false],
    ["AL pos", rl2AL(pos.al).ok, true], ["AL neg (no authz header)", rl2AL(neg.al).ok, false], ["AL neg (miscount)", rl2AL(neg.alMiscount).ok, false],
    ["RL3 pos", rl3(pos.as).ok, true], ["RL3 neg (no line)", rl3(neg.as).ok, false], ["RL3 neg (FAIL 1)", rl3(neg.asFail).ok, false]];
  for (const [n, got, want] of r) console.log(`${got === want ? "ok " : "BAD"} ${n}: got ${got}, want ${want}`);
  const bad = r.filter(([, g, w]) => g !== w).length; console.log(bad ? `SELFTEST FAIL (${bad})` : "SELFTEST PASS"); process.exit(bad ? 1 : 0);
}
const NEW_ID = process.env.RL2_NEW_ID; if (!/^[0-9a-f]{12}$/.test(NEW_ID ?? "")) throw new Error("RL2_NEW_ID (12 hex) not set");
{ const st = spawnSync(process.execPath, [process.argv[1], "--selftest"], { encoding: "utf8" });
  if (st.status !== 0) { console.log(st.stdout + st.stderr); throw new Error("RL2 selftest failed; no tcm read"); } }

const OUT = process.argv[2]; if (!OUT) throw new Error("usage: rl2.mjs <outdir>"); mkdirSync(OUT, { recursive: true });
const HOST = "melvenac@100.124.212.87";
const KEY = "C:/Users/melve/.ssh/tcm-readonly";
const RO = ["-i", KEY, "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10"];
const results = []; let fails = 0;
const check = (row, ok, obs) => { results.push(`${ok ? "PASS" : "FAIL"} ${row}: ${JSON.stringify(obs)}`); console.log(results.at(-1)); if (!ok) fails++; };
const ro = (cmd, extra = []) => {
  const args = [...RO, ...extra, HOST, ...(cmd === null ? [] : [cmd])];
  const r = spawnSync("ssh", args, { encoding: "utf8", timeout: 60_000, input: "" });
  return { rc: r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
};
const menuOut = {};

// ---------------------------------------------------------------- L's detector, known positive first
const SECRET = [
  ["hex/base64url run >= 32", /[A-Za-z0-9_\-+/]{32,}/g],
  ["convex admin key prefix", /convex-self-hosted/g],
  ["ssh public/private key", /ssh-ed25519 AAAA|BEGIN OPENSSH/g],
  ["64-hex run", /\b[0-9a-f]{64}\b/g],
];
const scan = (text) => SECRET.map(([n, re]) => [n, (text.match(re) ?? []).length]);
{
  const planted = `x ${"a".repeat(40)} y convex-self-hosted|abc ssh-ed25519 AAAAC3Nza z ${"0123456789abcdef".repeat(4)}`;
  const hits = scan(planted);
  check("L.pos", hits.every(([, n]) => n >= 1), Object.fromEntries(hits));
}

// ---------------------------------------------------------------- M1-M4, AL, AS
for (const item of ["health", "auth-mode", "image", "runners", "auth-log", "agents-summary"]) {
  const r = ro(item); menuOut[item] = r; writeFileSync(join(OUT, `menu-${item}.txt`), `rc ${r.rc}\n--- stdout\n${r.out}\n--- stderr\n${r.err}`);
}
{ const r = menuOut.health; let j = null; try { j = JSON.parse(r.out); } catch {}
  check("M1 health", r.rc === 0 && JSON.stringify(Object.keys(j ?? {}).sort()) === '["agent","convex","status"]', { rc: r.rc, keys: j && Object.keys(j).sort(), status: j?.status }); }
{ const r = menuOut["auth-mode"]; check("M2 auth-mode", r.rc === 0 && r.out.trim() === "warn", { rc: r.rc, out: r.out.trim() }); }
{ const r = menuOut.image; check("M3 image", r.rc === 0 && r.out.includes("648ac3963dd7") && !/\b[0-9a-f]{64}\b/.test(r.out), { rc: r.rc, has648: r.out.includes("648ac3963dd7"), lines: r.out.trim().split("\n") }); }
{ const r = menuOut.runners; const ls = r.out.trim().split("\n");
  check("M4 runners", r.rc === 0 && ls.length >= 2 && ls.every((l) => /\b(active|inactive)\b/.test(l)), { rc: r.rc, lines: ls }); }
{ const r = menuOut["auth-log"]; const head = r.out.split("\n").filter((l) => !/^\S+Z?\s.*\[auth\]/.test(l)).slice(0, 12);
  const authLines = r.out.split("\n").filter((l) => l.includes("[auth]")).length;
  check("AL auth-log (shape; count checked against full key separately)", r.rc === 0, { rc: r.rc, authLinesPrinted: authLines, headerLines: head }); }
{ const r = menuOut["agents-summary"];
  check("AS agents-summary", r.rc === 0 && /PASS/.test(r.out) && !/FAIL|UNDETERMINED/.test(r.out) && !r.out.includes("7e9f8fd1"), { rc: r.rc, lines: r.out.trim().split("\n") }); }
{ const r = menuOut.image, x = rl2M3(r.out, NEW_ID); check("RL2.M3 running container is the new image", r.rc === 0 && x.ok, { rc: r.rc, ...x.obs }); }
{ const r = menuOut["auth-log"], x = rl2AL(r.out); check("RL2.AL authz-lines header, counts match printed lines", r.rc === 0 && x.ok, { rc: r.rc, ...x.obs }); }
{ const r = menuOut["agents-summary"], x = rl3(r.out); check("RL3 ownerAssigned rows-without-owner=0", r.rc === 0 && x.ok, { rc: r.rc, ...x.obs }); }
{ const h = (process.env.RL2_HASHES ?? "").trim().split(/\s+/);
  check("RL2.hash (Rivet's step-8 sha256sum vs v1.11.0 blobs)", h[0] === "c7728ab751cd" && h[1] === "f1de001c3435", { reported: h, expected: ["c7728ab751cd", "f1de001c3435"] }); }
{ const all = Object.values(menuOut).map((r) => r.out + r.err).join("\n");
  const hits = scan(all); check("L menu outputs", hits.every(([, n]) => n === 0), Object.fromEntries(hits)); }

// ---------------------------------------------------------------- N: refusals (exit 2, "refused")
const N = ["docker ps", "touch /tmp/qa-t065-x", "auth-log; id", "auth-log && id", "auth-log|id", "auth-log\nid", "auth-log ", " auth-log", "AUTH-LOG",
  "auth-log --all", "health x", "$(id)", "sh", "bash -i", null];
for (const c of N) {
  const r = ro(c);
  check(`N ${JSON.stringify(c)}`, r.rc === 2 && /refused/.test(r.out + r.err) && !/uid=/.test(r.out), { rc: r.rc, out: (r.out + r.err).trim().slice(0, 120) });
}
{ const r = ro(null, ["-tt"]);
  check("N -tt (pty, no command)", r.rc === 2 && /refused/.test(r.out + r.err) && !/\$ $|# $/.test(r.out), { rc: r.rc, out: (r.out + r.err).trim().replace(/\r/g, "").slice(0, 160) }); }
writeFileSync(join(OUT, "scp-src.txt"), "qa t065 scp payload\n");
for (const [label, extra] of [["scp (sftp mode)", []], ["scp -O (legacy)", ["-O"]]]) {
  const r = spawnSync("scp", [...RO, ...extra, join(OUT, "scp-src.txt"), `${HOST}:/tmp/qa-t065-scp`], { encoding: "utf8", timeout: 60_000 });
  check(`N ${label}`, r.status !== 0, { rc: r.status, out: ((r.stdout ?? "") + (r.stderr ?? "")).trim().slice(0, 160) });
}
{ writeFileSync(join(OUT, "sftp-batch.txt"), "ls /tmp\nput " + join(OUT, "scp-src.txt").replace(/\\/g, "/") + " /tmp/qa-t065-sftp\n");
  const r = spawnSync("sftp", [...RO, "-b", join(OUT, "sftp-batch.txt"), HOST], { encoding: "utf8", timeout: 60_000 });
  check("N sftp", r.status !== 0, { rc: r.status, out: ((r.stdout ?? "") + (r.stderr ?? "")).trim().slice(0, 160) }); }

writeFileSync(join(OUT, "results.txt"), results.join("\n") + "\n");
console.log(`\n${results.length} checks, ${results.length - fails} pass, ${fails} fail`);
process.exitCode = fails ? 1 : 0;
