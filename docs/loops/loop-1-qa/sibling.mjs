import { hub } from "./harness.mjs";
for (const p of ["/a2a/session/not-a-session-id/messages", "/a2a/session/not-a-session-id/reads"]) { const r = await hub("GET", p); console.log(r.status, p, String(r.json?.error ?? r.text).split("\n")[0].slice(0, 80)); }
