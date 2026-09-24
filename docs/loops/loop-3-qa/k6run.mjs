// K6 (loop-3-qa-criteria.md): no key or full hash in any artifact of the run. Counts only; nothing
// matched is ever printed. Keys come from the run's own records in scratch (secrets-*.json, key
// files, the harness salts). The one allowed full hash is K6.5's exception.
// QA_TMP=<run dir> node k6run.mjs <file-or-dir>...    (artifacts to scan; dirs are walked)
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { createHash } from "node:crypto";
import { scan } from "./leakscan.mjs";

const TMP = process.env.QA_TMP;
const sha = (s) => createHash("sha256").update(s).digest("hex");
const walk = (p) => (statSync(p).isDirectory() ? readdirSync(p).flatMap((f) => walk(join(p, f))) : [p]);

// the run's keys (never printed)
const keys = new Set();
for (const f of readdirSync(TMP).filter((f) => /^secrets-.*\.json$/.test(f))) for (const k of JSON.parse(readFileSync(join(TMP, f), "utf8"))) keys.add(k);
// key files and harness salts anywhere under the run dir (the Loop 1 scripts use a subdirectory)
const everything = walk(TMP);
for (const f of everything.filter((f) => /[\\/](keys|n5-keys)[\\/]/.test(f))) keys.add(readFileSync(f, "utf8").trim());
const salts = everything.filter((f) => basename(f) === "salts.txt").flatMap((f) => readFileSync(f, "utf8").split(/\s+/).filter(Boolean));

// artifacts: never the key records themselves
const isRecord = (f) => /[\\/](keys|n5-keys)[\\/]/.test(f) || /secrets-.*\.json$/.test(basename(f)) || basename(f) === "salts.txt" || /^import-/.test(basename(f));
const files = process.argv.slice(2).flatMap(walk).filter((f) => !isRecord(f));

const DEV_HASH = sha("dev-key");
const byFile = scan(files, [...keys]);
const saltHits = files.map((f) => ({ f, n: salts.reduce((a, s) => a + (readFileSync(f, "utf8").split(s).length - 1), 0) }));
const devHashHits = files.map((f) => ({ f, n: readFileSync(f, "utf8").split(DEV_HASH).length - 1 })).filter((x) => x.n);

let bad = 0;
for (const r of byFile) if (r.key || r.hash) { bad++; console.log(`HIT ${r.file}: key ${r.key}, hash ${r.hash}`); }
for (const s of saltHits) if (s.n) { bad++; console.log(`HIT ${s.f}: ${s.n} harness key(s) (by salt)`); }
console.log(`scanned ${files.length} artifacts for ${keys.size} keys (+ their hashes) and ${salts.length} harness salts`);
console.log(`full sha256("dev-key") occurrences: ${devHashHits.map((x) => `${basename(x.f)}:${x.n}`).join(", ") || "none"}`);
console.log(bad ? `K6: ${bad} artifact(s) with a hit` : "K6: no key or key hash in any artifact");
process.exit(bad ? 1 : 0);
