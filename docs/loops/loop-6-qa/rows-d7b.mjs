// Relay's check (2): inputs that pass the hub's own checks and reach Convex, where Rivet kept 500
// "internal error". Recorded per case against brief D. Usage: QA_TMP=... node rows-d7b.mjs
import { join } from "node:path";
import { H, hub, register, setRow, check, summary } from "./l6.mjs";
setRow("D7b");
const clip = (t) => String(t).replace(/\s+/g, " ").slice(0, 150);
for (const n of ["qa-d7c", "qa-d7d"]) await register(H.nW, n);
const mk = async (b) => (await hub(b, "POST", "/a2a/session", { as: "qa-d7c", body: { title: "d7b", participants: ["qa-d7c", "qa-d7d"], maxTurns: 6 } })).json?.sessionId;
for (const [mode, b] of [["warn", H.nW], ["strict", H.nS]]) {
  const sid = await mk(b);
  const closed = await mk(b); await hub(b, "POST", `/a2a/session/${closed}/close`, { as: "qa-d7c", body: {} });
  const cases = [
    ["rename: whitespace title", `/a2a/session/${sid}/rename`, { title: "   " }],
    ["rename: 10k-char title", `/a2a/session/${sid}/rename`, { title: "x".repeat(10000) }],
    ["extend: addTurns 1.5", `/a2a/session/${sid}/extend`, { addTurns: 1.5 }],
    ["extend: addTurns 1e9", `/a2a/session/${sid}/extend`, { addTurns: 1e9 }],
    ["extend: addTurns \"3\" (string)", `/a2a/session/${sid}/extend`, { addTurns: "3" }],
    ["message: to a closed session", `/a2a/session/${closed}/message`, { from: "qa-d7c", content: "late" }],
    ["message: content is an object", `/a2a/session/${sid}/message`, { from: "qa-d7c", content: { a: 1 } }],
    ["create: maxTurns -1", "/a2a/session", { title: "neg", participants: ["qa-d7c", "qa-d7d"], maxTurns: -1 }],
    ["create: participants not an array", "/a2a/session", { title: "bad", participants: "qa-d7d", maxTurns: 4 }],
  ];
  for (const [label, path, body] of cases) {
    const c = await hub(b, "POST", path, { as: "qa-d7c", body });
    check(`D2c ${label} ${mode}`, "caller's own input: recorded; a 5xx is reported against brief D (terse either way)", { status: c.status, body: clip(c.text) }, c.status < 500);
  }
}
const f = summary(join(process.env.QA_TMP, "rows-d7b.results.txt"));
process.exitCode = f ? 1 : 0;
