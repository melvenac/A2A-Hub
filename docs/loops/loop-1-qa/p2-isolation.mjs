// P2 (loop-1-qa-criteria.md): prove the QA hub writes to QA Convex, with a known positive.
// Usage: QA_HUB=http://127.0.0.1:4410 QA_CONVEX=http://127.0.0.1:3410 node p2-isolation.mjs
// Fails closed: exits 1 unless QA Convex is empty before and the probe appears there after.
const HUB = process.env.QA_HUB, CVX = process.env.QA_CONVEX;
if (!HUB || !CVX) { console.error("QA_HUB and QA_CONVEX must both be set; no defaults"); process.exit(1); }
if (/:(3210|4000)\b/.test(HUB + CVX)) { console.error("refusing: main-stack port"); process.exit(1); }
const q = async (path, args = {}) => {
  const r = await fetch(`${CVX}/api/query`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, args, format: "json" }) });
  const b = await r.json(); if (b.status !== "success") throw new Error(`${path}: ${JSON.stringify(b)}`); return b.value;
};
for (let i = 0; i < 30; i++) { try { if ((await fetch(`${HUB}/health`)).status) break; } catch {} await new Promise(r => setTimeout(r, 1000)); }
const health = await fetch(`${HUB}/health`).then(r => r.status + " " + r.statusText);
const before = { agents: (await q("agents:listOnline")).length, sessions: (await q("sessions:listAll")).length, probe: await q("agents:getByName", { name: "qa-probe" }) };
const reg = await fetch(`${HUB}/a2a/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "qa-probe", apiKey: "dev-key", agentCard: { name: "qa-probe", description: "QA isolation probe", kind: "qa-probe" } }) });
const after = { agents: (await q("agents:listOnline")).map(a => a.name), probe: (await q("agents:getByName", { name: "qa-probe" }))?.name ?? null };
const hubSessions = await fetch(`${HUB}/a2a/sessions`, { headers: { "X-Agent-Key": "dev-key" } }).then(r => r.json());
console.log(JSON.stringify({ at: new Date().toISOString(), hub: HUB, convex: CVX, health, before, register: reg.status, after, hubSessionCount: (hubSessions.sessions ?? hubSessions).length }, null, 1));
const ok = before.agents === 0 && before.sessions === 0 && before.probe === null && after.probe === "qa-probe";
console.log(ok ? `P2 PASS: ${CVX} empty before; probe present there after register via ${HUB}` : "P2 FAIL");
process.exit(ok ? 0 : 1);
