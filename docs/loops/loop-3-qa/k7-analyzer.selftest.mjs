// Validates instrument A on synthetic known positives before it counts (loop-3-qa-criteria.md).
// Every fixture is synthetic; no real hash is involved. Usage: node k7-analyzer.selftest.mjs
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const A = join(dirname(fileURLToPath(import.meta.url)), "k7-analyzer.mjs");
const h = (s) => createHash("sha256").update(s).digest("hex");
const fresh = () => h(randomBytes(32).toString("hex"));
const DEV = h("dev-key");
const row = (name, apiKeyHash, keyStatus, lastSeen = 1000, _id = name) => ({ _id, name, apiKeyHash, lastSeen, ...(keyStatus ? { keyStatus } : {}), agentCard: { secret: "never printed" } });
const jsonl = (rows, extra = "") => rows.map((r) => JSON.stringify(r)).join("\n") + "\n" + extra;
const run = (input, args) => {
  const r = spawnSync(process.execPath, [A, ...args], { input, encoding: "utf8" });
  return { code: r.status, out: r.stdout };
};
const std = ["--limit", "8000", "--auth-mode", "warn"];

const clean = [row("relay", fresh(), "owned"), row("atlas", fresh(), "owned"), row("grok", fresh(), "owned")];
const cases = [
  ["clean table passes", jsonl(clean), std, 0, null],
  ["stale hash on a duplicate row", jsonl([...clean, row("relay", fresh(), "owned", 500, "relay-old")]), std, 1, /stale hash/],
  ["shared hash", (() => { const s = fresh(); return jsonl([row("a", s, "legacy"), row("b", s, "legacy")]); })(), std, 1, /shared hash/],
  ["legacy row", jsonl([...clean, row("clark", fresh(), "legacy")]), std, 1, /legacy rows: clark/],
  ["row with no keyStatus", jsonl([...clean, row("general", fresh(), null)]), std, 1, /no keyStatus: general/],
  ["dev-key holder (single row, legacy)", jsonl([...clean, row("probe", DEV, "legacy")]), std, 1, new RegExp(`dev-key \\(${DEV.slice(0, 8)}\\) held by probe`)],
  ["AUTH_MODE not warn", jsonl(clean), ["--limit", "8000", "--auth-mode", "strict"], 1, /AUTH_MODE is "strict"/],
  ["non-JSON line", jsonl(clean, "not json at all\n"), std, 1, /non-JSON/],
  ["prefix mismatch", jsonl(clean), [...std, "--expect-prefix", "relay=00000000"], 1, /prefix mismatch for relay/],
  ["D-007 end state: exact names, all owned, passes", jsonl(clean), [...std, "--expect-names", "atlas,grok,relay", "--expect-absent", "clark,probe"], 0, null],
  ["D-007: a released name still present fails", jsonl([...clean, row("clark", fresh(), "owned")]), [...std, "--expect-absent", "clark"], 1, /clark should be absent/],
  ["D-007: a needed name missing fails", jsonl(clean), [...std, "--expect-names", "atlas,grok,relay,forge"], 1, /missing forge/],
  ["deploy act with test names released: 2 owned + 4 legacy, released absent", jsonl([row("cursor-grok", fresh(), "owned"), row("grok-probe", fresh(), "owned"),
    ...["relay", "grok", "forge", "atlas"].map((n) => row(n, DEV, "legacy"))]),
    [...std, "--phase", "deploy", "--expect-rows", "6", "--expect-owned", "2", "--expect-legacy", "4", "--expect-absent", "clark,cursor,general,probe"], 0, null],
  ["deploy act: a name that should be released still present fails", jsonl([row("cursor-grok", fresh(), "owned"), row("clark", DEV, "legacy")]),
    [...std, "--phase", "deploy", "--expect-rows", "2", "--expect-owned", "1", "--expect-legacy", "1", "--expect-absent", "clark"], 1, /clark should be absent/],
  ["askPolicy counted by name (pre-deploy read)", jsonl([row("atlas", DEV, null), { ...row("forge", DEV, null), askPolicy: { allow: ["relay"] } }]),
    [...std, "--phase", "deploy", "--expect-rows", "2", "--expect-owned", "0", "--expect-legacy", "0"], 1, /askPolicy on 1 row\(s\): forge/],
  ["askPolicy set again after re-registration passes", jsonl([...clean, { ...row("forge", fresh(), "owned"), askPolicy: { allow: ["relay"] } }]),
    [...std, "--expect-askpolicy", `forge=${createHash("sha256").update(JSON.stringify({ allow: ["relay"] })).digest("hex").slice(0, 8)}`], 0, null],
  ["askPolicy dropped by the fresh row fails", jsonl([...clean, row("forge", fresh(), "owned")]),
    [...std, "--expect-askpolicy", `forge=${createHash("sha256").update(JSON.stringify({ allow: ["relay"] })).digest("hex").slice(0, 8)}`], 1, /askPolicy for forge: none/],
  ["empty input is undetermined", "", std, 2, /no rows parsed/],
  ["count at the limit is undetermined", jsonl(clean), ["--limit", "3", "--auth-mode", "warn"], 2, /at --limit 3/],
  ["deploy phase: 2 owned + 8 legacy on the dev-key passes", jsonl([row("cursor-grok", fresh(), "owned"), row("grok-probe", fresh(), "owned"),
    ...["relay", "grok", "cursor", "clark", "general", "probe", "forge", "atlas"].map((n) => row(n, DEV, "legacy"))]),
    [...std, "--phase", "deploy", "--expect-rows", "10", "--expect-owned", "2", "--expect-legacy", "8"], 0, /dev-key 7e9f8fd1: held by 8 row\(s\), resolves to no name/],
  ["deploy phase: a row left unclassified fails", jsonl([row("cursor-grok", fresh(), "owned"), row("atlas", DEV, null)]),
    [...std, "--phase", "deploy", "--expect-rows", "2", "--expect-owned", "1", "--expect-legacy", "1"], 1, null],
];

let bad = 0;
for (const [name, input, args, code, re] of cases) {
  const r = run(input, args);
  const leaked = /[0-9a-f]{64}/.test(r.out) || r.out.includes("never printed");
  const ok = r.code === code && (!re || re.test(r.out)) && !leaked;
  if (!ok) bad++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: exit ${r.code} (want ${code})${leaked ? " LEAKED a full hash or agentCard" : ""}`);
}
console.log(bad ? `\nA selftest: ${bad} failed` : `\nA selftest: all ${cases.length} pass; no output carried a full hash or an agentCard`);
process.exit(bad ? 1 : 0);
