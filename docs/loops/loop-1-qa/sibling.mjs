import { hub, asSeat, register } from "./harness.mjs";
const me = `qa-sib-${Date.now().toString(36)}`;
await register(me);
for (const p of ["/a2a/session/not-a-session-id/messages", "/a2a/session/not-a-session-id/reads"]) { const r = await hub("GET", p, undefined, { headers: asSeat(me) }); console.log(r.status, p, String(r.json?.error ?? r.text).split("\n")[0].slice(0, 80)); }
