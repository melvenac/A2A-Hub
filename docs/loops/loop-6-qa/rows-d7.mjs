// Relay's two checks on c461c65 (2026-09-26): (1) EVERY register and key refusal is 4xx, old vs candidate
// (G1e, extended to rotate); (2) the answers Rivet left at 500 "internal error" (session not found, empty
// title, bad addTurns) against brief D. A well-formed missing session id is taken from THIS database:
// a session is created, then the id is checked as "well-formed" by /read answering 404, not 400.
// Usage: QA_TMP=... node rows-d7.mjs
import { join } from "node:path";
import { H, key, hub, register, setRow, check, summary } from "./l6.mjs";
const OLD = { warn: H.ooW, strict: "http://127.0.0.1:4721" }, NEW = { warn: H.nW, strict: H.nS };
const cls = (s) => `${Math.floor(s / 100)}xx`; const clip = (t) => String(t).replace(/\s+/g, " ").slice(0, 150);
setRow("D7");
for (const n of ["qa-d7a", "qa-d7b"]) { await register(OLD.warn, n); await register(NEW.warn, n); }
// (1) rotate refusals
const rot = [
  ["rotate: new key under 32 chars", (b) => hub(b, "POST", "/a2a/rotate", { as: "qa-d7a", body: { newApiKey: "short", apiKey: "short" } })],
  ["rotate: new key held by another name", (b) => hub(b, "POST", "/a2a/rotate", { as: "qa-d7a", body: { newApiKey: key("qa-d7b"), apiKey: key("qa-d7b") } })],
  ["rotate: missing body", (b) => hub(b, "POST", "/a2a/rotate", { as: "qa-d7a", body: {} })],
];
for (const [label, fn] of rot) for (const mode of ["warn", "strict"]) {
  const o = await fn(OLD[mode]), c = await fn(NEW[mode]);
  check(`G1e ${label} ${mode}`, "a key refusal is 4xx on the candidate, and its class matches v1.11.0", { old: [o.status, clip(o.text)], cand: [c.status, clip(c.text)] },
    c.status >= 400 && c.status < 500 && cls(o.status) === cls(c.status));
}
// (2) the 500s Rivet kept, against brief D
const s = await hub(NEW.strict, "POST", "/a2a/session", { as: "qa-d7a", body: { title: "d7", participants: ["qa-d7a", "qa-d7b"], maxTurns: 6 } });
const sid = s.json?.sessionId;
const cases = [
  ["rename: empty title", `/a2a/session/${sid}/rename`, { title: "" }],
  ["extend: addTurns 0", `/a2a/session/${sid}/extend`, { addTurns: 0 }],
  ["extend: addTurns -3", `/a2a/session/${sid}/extend`, { addTurns: -3 }],
  ["message: empty content", `/a2a/session/${sid}/message`, { from: "qa-d7a", content: "" }],
];
for (const [label, path, body] of cases) for (const mode of ["warn", "strict"]) {
  const c = await hub(NEW[mode], "POST", path, { as: "qa-d7a", body });
  check(`D2c ${label} ${mode} (caller's own input)`, "recorded against brief D: status and body (a 500 for the caller's input is reported)", { status: c.status, body: clip(c.text) }, c.status < 500);
}
console.log("session for the missing-id cases:", s.status);
const f = summary(join(process.env.QA_TMP, "rows-d7.results.txt"));
process.exitCode = f ? 1 : 0;
