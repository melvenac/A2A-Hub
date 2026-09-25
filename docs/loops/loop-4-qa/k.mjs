// Instrument K (Loop 4, D1-D3): count every scratch key used in the run, and every full sha256 of
// one, across directory trees AND inside tar archives (walked member by member, uncompressed tar).
// Prints counts per target, never values. Known positive first (--selftest).
// Keys come from QA_TMP/keys/**.key and QA_TMP/keys/_harness.keys, plus the literal unknown key W used.
// Usage: QA_TMP=... node k.mjs --selftest | node k.mjs <label>=<path> ...
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { gunzipSync } from "node:zlib";

const TMP = process.env.QA_TMP; if (!TMP) throw new Error("QA_TMP not set");
const sha = (s) => createHash("sha256").update(s).digest("hex");
function loadKeys() {
  const ks = new Set(); const dir = join(TMP, "keys");
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith(".key") || e.name === "_harness.keys") for (const l of readFileSync(p, "utf8").split(/\r?\n/)) if (l.trim()) ks.add(l.trim()); } };
  walk(dir); ks.add("qa-unknown-" + "0".repeat(40));
  return [...ks];
}
function needles(keys) { return keys.flatMap((k) => [Buffer.from(k), Buffer.from(sha(k))]); }
function countBuf(buf, ns) { let n = 0; for (const x of ns) { let i = -1; while ((i = buf.indexOf(x, i + 1)) !== -1) n++; } return n; }
const GZ = (b) => b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;
const OPAQUE = (b) => (b.length > 4 && b.readUInt32LE(0) === 0xfd2fb528) || (b.length > 5 && b.subarray(0, 6).equals(Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]))) || (b.length > 3 && b.subarray(0, 3).toString() === "BZh");
function leaf(b, ns, stats) {
  if (GZ(b)) { stats.gz++; let x; try { x = gunzipSync(b); } catch { stats.opaque++; return; } return leaf(x, ns, stats); }
  if (OPAQUE(b)) { stats.opaque++; return; }
  if (isTar(b)) return scanTar(b, ns, stats);
  stats.hits += countBuf(b, ns);
}
function scanTar(buf, ns, stats) {
  let off = 0;
  while (off + 512 <= buf.length) {
    const h = buf.subarray(off, off + 512); if (h.every((b) => b === 0)) break;
    const size = parseInt(h.subarray(124, 136).toString().replace(/\0.*$/, "").trim() || "0", 8);
    const body = buf.subarray(off + 512, off + 512 + size);
    stats.members++;
    leaf(body, ns, stats); // leaves only: one hit per copy; gzip opened; unreadable compression counted opaque
    off += 512 + Math.ceil(size / 512) * 512;
  }
}
const isTar = (b) => b.length > 512 && b.subarray(257, 262).toString() === "ustar";
function scan(path, ns) {
  const stats = { files: 0, members: 0, bytes: 0, hits: 0, gz: 0, opaque: 0 };
  const walk = (p) => {
    const st = statSync(p);
    if (st.isDirectory()) { for (const e of readdirSync(p)) walk(join(p, e)); return; }
    const b = readFileSync(p); stats.files++; stats.bytes += b.length;
    leaf(b, ns, stats);
  };
  walk(path); return stats;
}

const keys = loadKeys(); const ns = needles(keys);
if (keys.length < 2) { console.log(`UNDETERMINED: only ${keys.length} keys loaded`); process.exit(2); }
console.log(`K: ${keys.length} keys loaded (${ns.length} needles: key + sha256 each)`);
if (process.argv[2] === "--selftest") {
  const pos = join(TMP, "k-positive"); rmSync(pos, { recursive: true, force: true }); mkdirSync(pos, { recursive: true });
  cpSync(join(TMP, "rep-new", "app", "client", "dist"), join(pos, "dist"), { recursive: true });
  const k = keys.find((x) => x.length >= 32);
  const js = readdirSync(join(pos, "dist", "assets")).find((f) => f.endsWith(".js"));
  writeFileSync(join(pos, "dist", "assets", js), readFileSync(join(pos, "dist", "assets", js), "utf8") + `\n//${k}`);
  writeFileSync(join(pos, "dist", "index.html"), readFileSync(join(pos, "dist", "index.html"), "utf8") + `<!--${sha(k)}-->`);
  const clean = scan(join(TMP, "rep-new", "app", "client", "dist"), ns);
  const planted = scan(join(pos, "dist"), ns);
  mkdirSync(join(pos, "t"), { recursive: true });
  execFileSync("C:/Windows/System32/tar.exe", ["-cf", join(pos, "t", "inner.tar"), "-C", join(pos, "dist"), "."]);
  execFileSync("C:/Windows/System32/tar.exe", ["-cf", join(pos, "outer.tar"), "-C", join(pos, "t"), "inner.tar"]);
  rmSync(join(pos, "dist"), { recursive: true }); rmSync(join(pos, "t"), { recursive: true });
  const nested = scan(pos, ns);
  // gzip layer: a tar holding a gzipped tar that holds the planted files (docker save's compressed-layer shape)
  const { gzipSync } = await import("node:zlib");
  const g = join(TMP, "k-positive-gz"); rmSync(g, { recursive: true, force: true }); mkdirSync(join(g, "l"), { recursive: true });
  writeFileSync(join(g, "l", "layer.tar.gz"), gzipSync(readFileSync(join(pos, "outer.tar"))));
  execFileSync("C:/Windows/System32/tar.exe", ["-cf", join(g, "save.tar"), "-C", join(g, "l"), "layer.tar.gz"]);
  rmSync(join(g, "l"), { recursive: true });
  const gz = scan(g, ns);
  writeFileSync(join(g, "save.tar"), Buffer.concat([Buffer.from([0x28, 0xb5, 0x2f, 0xfd]), Buffer.alloc(64)]));
  const zst = scan(g, ns);
  rmSync(g, { recursive: true, force: true });
  const ok = clean.hits === 0 && planted.hits === 2 && nested.hits === 2 && nested.members >= 3 && gz.hits === 2 && gz.gz >= 1 && zst.opaque === 1;
  console.log(`selftest: gzip layer hits ${gz.hits} (expect 2, gzip opened ${gz.gz}); zstd-magic file opaque ${zst.opaque} (expect 1: fail closed)`);
  console.log(`selftest: clean dist hits ${clean.hits} (expect 0); planted dist hits ${planted.hits} (expect 2: key in JS + hash in html); nested tar hits ${nested.hits} over ${nested.members} members (expect 2)`);
  rmSync(pos, { recursive: true, force: true });
  console.log(ok ? "SELFTEST PASS" : "SELFTEST FAIL"); process.exit(ok ? 0 : 1);
}
let bad = 0;
for (const a of process.argv.slice(2)) {
  const [label, p] = a.split(/=(.*)/s);
  const s = scan(p, ns);
  if (s.files === 0) { console.log(`UNDETERMINED ${label}: no files walked`); bad++; continue; }
  const verdict = s.opaque ? "FAIL (unreadable compression: fail closed)" : s.hits === 0 ? "PASS" : "FAIL";
  console.log(`${verdict} ${label}: ${s.files} files, ${s.members} tar members, ${s.gz} gzip opened, ${s.opaque} opaque, ${s.bytes} bytes, hits ${s.hits}`);
  if (s.hits || s.opaque) bad++;
}
process.exit(bad ? 1 : 0);
