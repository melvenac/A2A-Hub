// T-065 rows run with the READONLY key only: M1-M4, AL, AS (menu), N (refusals), NF (forwarding),
// and L (secret scan of every menu output, planted positive first). Full-key steps (S, AK, P2, P3,
// W, AF, NF's positive control) are separate commands, each approved by Aaron.
// Usage: node t065.mjs <outdir>
import { spawnSync, spawn } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import net from "node:net";

const OUT = process.argv[2]; if (!OUT) throw new Error("usage: t065.mjs <outdir>"); mkdirSync(OUT, { recursive: true });
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

// ---------------------------------------------------------------- NF: forwarding
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function tunnel(flagArgs, probe) {
  const p = spawn("ssh", [...RO, "-N", ...flagArgs, HOST], { stdio: ["ignore", "pipe", "pipe"] });
  let err = ""; p.stderr.on("data", (d) => (err += d)); await sleep(3500);
  let res; try { res = await probe(); } catch (e) { res = { error: e.cause?.code ?? e.code ?? e.message }; }
  p.kill(); await sleep(300); return { res, err: err.trim().slice(0, 200), exited: p.exitCode };
}
{ const t = await tunnel(["-L", "45999:127.0.0.1:4000"], async () => { const r = await fetch("http://127.0.0.1:45999/health", { signal: AbortSignal.timeout(5000) }); return { status: r.status }; });
  check("NF -L 45999->127.0.0.1:4000", t.res.status !== 200, t); }
{ const t = await tunnel(["-o", "ExitOnForwardFailure=yes", "-R", "45998:127.0.0.1:9"], async () => ({ note: "remote side; see ssh stderr/exit" }));
  check("NF -R", /forwarding failed|prohibited|refused/i.test(t.err) || (t.exited !== null && t.exited !== 0), t); }
{ const t = await tunnel(["-D", "45997"], () => new Promise((resolve) => {
    const s = net.connect(45997, "127.0.0.1"); let stage = 0; const done = (x) => { s.destroy(); resolve(x); };
    s.on("error", (e) => done({ error: e.code })); s.setTimeout(6000, () => done({ error: "timeout" }));
    s.on("connect", () => s.write(Buffer.from([5, 1, 0])));
    s.on("data", (d) => { if (stage === 0) { stage = 1; s.write(Buffer.from([5, 1, 0, 1, 127, 0, 0, 1, 0x0f, 0xa0])); } else done({ socksReply: d[1] }); });
    s.on("close", () => done({ closed: true, stage }));
  }));
  check("NF -D (SOCKS connect to 127.0.0.1:4000)", t.res.socksReply !== 0, t); }

writeFileSync(join(OUT, "results.txt"), results.join("\n") + "\n");
console.log(`\n${results.length} checks, ${results.length - fails} pass, ${fails} fail`);
process.exitCode = fails ? 1 : 0;
