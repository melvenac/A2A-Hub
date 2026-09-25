// RG1: the agent path through the candidate hub (warn, :4610), driven by the candidate's own
// unchanged hub-talk.mjs: init-key, whoami, say, --wait delivery, --inbox, and a read receipt.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { H, TMP, hub, keyFile, whoami, check, summary } from "./l4.mjs";
const CAND = "C:/Users/melve/Worktrees/qa3-cand";
const tag = Date.now().toString(36), X = `qa-rg1x-${tag}`, Y = `qa-rg1y-${tag}`;
function talk(args) {
  const env = { ...process.env, HUB_URL: H.newW, A2A_KEY_DIR: join(TMP, "keys") }; delete env.AGENT_KEY;
  const r = spawnSync(process.execPath, [join(CAND, "scripts/hub-talk.mjs"), ...args], { env, encoding: "utf8", timeout: 90_000 });
  return { rc: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
}
for (const n of [X, Y]) { const r = talk(["--as", n, "--init-key"]); check("RG1", `hub-talk --init-key ${n}`, { rc: r.rc }, r.rc === 0); }
const kx = keyFile(H.newW, X), ky = keyFile(H.newW, Y);
check("RG1", "whoami resolves each hub-talk key", { x: await whoami(H.newW, kx), y: await whoami(H.newW, ky) }, (await whoami(H.newW, kx)) === X && (await whoami(H.newW, ky)) === Y);
const s = await hub(H.newW, "POST", "/a2a/session", { key: kx, body: { title: `qa rg1 ${tag}`, participants: [X, Y], maxTurns: 8 } });
const sid = s.json?.sessionId;
const say1 = talk(["--as", X, "--session", sid, "--say", `rg1 hello ${tag}`]);
check("RG1", "X --say", { rc: say1.rc }, say1.rc === 0);
const w = talk(["--as", Y, "--session", sid, "--wait", "--wait-timeout", "30"]);
check("RG1", "Y --wait delivers X's turn (rc 0)", { rc: w.rc, sawTurn: w.out.includes(`rg1 hello ${tag}`) }, w.rc === 0 && w.out.includes(`rg1 hello ${tag}`));
const say2 = talk(["--as", Y, "--session", sid, "--say", `rg1 reply ${tag}`]);
const inbox = talk(["--as", X, "--session", sid, "--inbox"]);
check("RG1", "Y replies; X --inbox shows it", { say: say2.rc, inbox: inbox.rc, saw: inbox.out.includes(`rg1 reply ${tag}`) }, say2.rc === 0 && inbox.out.includes(`rg1 reply ${tag}`));
const msgs = (await hub(H.newW, "GET", `/a2a/session/${sid}/messages`, { key: kx })).json?.messages ?? [];
check("RG1", "messages parsed: senders in order", { from: msgs.map((m) => m.from) }, JSON.stringify(msgs.map((m) => m.from)) === JSON.stringify([X, Y]));
const reads = await hub(H.newW, "GET", `/a2a/session/${sid}/reads`, { key: kx });
const readers = JSON.stringify(reads.json ?? {});
check("RG1", "read receipts recorded for the --wait/--inbox readers", { status: reads.status, hasY: readers.includes(Y), hasX: readers.includes(X) }, reads.status === 200 && readers.includes(Y));
process.exitCode = summary() ? 1 : 0;
