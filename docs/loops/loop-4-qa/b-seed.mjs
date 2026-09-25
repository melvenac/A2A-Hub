// B setup read-back: every scratch key resolves to its own name; two sessions that include aaron.
import { H, hub, whoami, keyFile, check, summary } from "./l4.mjs";
const K = Object.fromEntries(["aaron", "qa-h2", "qa-l4a", "qa-l4b", "qa-l4c"].map((n) => [n, keyFile(H.newW, n)]));
for (const [n, k] of Object.entries(K)) check("B.setup", `whoami(${n}) on warn and strict`, { warn: await whoami(H.newW, k), strict: await whoami(H.newS, k) },
  (await whoami(H.newW, k)) === n && (await whoami(H.newS, k)) === n);
const out = [];
for (const [peer, title] of [["qa-l4a", "qa-b seeded 1"], ["qa-l4b", "qa-b seeded 2"]]) {
  const s = await hub(H.newW, "POST", "/a2a/session", { key: K[peer], body: { title, participants: ["aaron", peer], maxTurns: 12 } });
  const sid = s.json?.sessionId;
  const m = await hub(H.newW, "POST", `/a2a/session/${sid}/message`, { key: K[peer], body: { from: peer, content: `hello aaron from ${peer}` } });
  check("B.setup", `seeded session ${title}`, { status: s.status, sid, msg: m.status, ok: m.json?.ok }, s.status === 200 && !!sid && m.status === 200);
  out.push(sid);
}
console.log("SEEDED " + out.join(" "));
process.exitCode = summary() ? 1 : 0;
