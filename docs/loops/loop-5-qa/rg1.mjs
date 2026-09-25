// RG1: Loop 3's key flows on the candidate, both modes: whoami, rotate (the old key stops, the new one
// answers), and register refusing a taken name with a different key. Run: QA_TMP=... node rg1.mjs
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { H, TMP, hub, key, register, check, summary } from "./l5.mjs";

for (const base of [H.nW, H.nS]) {
  const mode = base === H.nS ? "strict" : "warn";
  const n = `qa-rg1-${mode}`;
  const r = await register(H.nW, n);
  const w = await hub(base, "GET", "/a2a/whoami", { as: n });
  check(`RG1 whoami ${mode}`, "register then whoami resolves the name", { reg: r.status, whoami: w.json?.name }, r.status === 200 && w.json?.name === n);
  const fresh = randomBytes(32).toString("base64url");
  const rot = await hub(base, "POST", "/a2a/rotate", { as: n, body: { newApiKey: fresh } });
  const oldKey = await hub(base, "GET", "/a2a/whoami", { as: n });
  const newKey = await hub(base, "GET", "/a2a/whoami", { rawKey: fresh });
  check(`RG1 rotate ${mode}`, "rotate: 200; the new key resolves; the old key no longer does (strict 403, warn name:null)", { rot: rot.status, old: [oldKey.status, oldKey.json?.name ?? null], new: newKey.json?.name },
    rot.status === 200 && newKey.json?.name === n && (mode === "strict" ? oldKey.status === 403 : oldKey.json?.name == null));
  const taken = await hub(base, "POST", "/a2a/register", { body: { name: n, apiKey: randomBytes(32).toString("base64url"), agentCard: { name: n, kind: "ide-session" } } });
  check(`RG1 taken ${mode}`, "register of a taken name with a different key: 409", { status: taken.status, body: taken.text.slice(0, 90) }, taken.status === 409);
}
process.exitCode = summary(join(TMP, "rg1.results.txt")) ? 1 : 0;
