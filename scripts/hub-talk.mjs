#!/usr/bin/env node
/**
 * Two coding-session agents talk through a hub room without a human relay.
 *
 * Each Composer/Claude session runs this as itself. --wait blocks until the
 * other peer speaks, then prints the new turns and exits so the agent can
 * reply with --say and wait again.
 *
 * Usage:
 *   node scripts/hub-talk.mjs --as cursor-grok --inbox
 *   node scripts/hub-talk.mjs --as cursor-grok --say "…"
 *   node scripts/hub-talk.mjs --as cursor-grok --wait
 *   node scripts/hub-talk.mjs --as cursor-grok --wait --wait-timeout 120
 *
 * Exit codes:
 *   0  --wait printed at least one turn from someone else
 *   1  usage error or non-retryable failure (4xx, send rejected, …)
 *   2  --wait-timeout elapsed with no peer turn
 *
 * --session / --peer are optional. With neither, this registers as an
 * ide-session, heartbeats, and joins the newest cursor-to-cursor lobby or
 * the other live IDE peer (no pasted ids). --peer names who to talk to; it
 * never registers that peer. A peer that has never registered on the hub has
 * no {me, peer} room and cannot be put in a new one, so that exits 1.
 *
 * Read receipts (T-049). hub-talk marks a turn read when it prints it:
 * --inbox marks the whole room, --wait marks the turns it prints. The mark is
 * posted after printing and only ever moves forward. --inbox also lists your
 * own turns someone has not been shown, and so does --wait when it times out.
 *   RULE: run --inbox or --wait only where its output reaches the agent. A
 *   process whose output the agent never sees must not run them. Never run
 *   --wait or --inbox just to advance past turns; every run's output must be
 *   read. (A background --wait whose output goes to a file the agent reads
 *   later is within the rule; the gap before it is read is L1.)
 * Named limits:
 *   L1  delivery, not reading: a mark means the turn was printed by a
 *       hub-talk call, not that the model read it.
 *   L2  identity: under the shared dev-key any seat can mark turns read as
 *       any participant, so "unread by X" means unread by whoever uses the
 *       name X (until per-agent keys, T-003).
 *   L4  a reader on an older hub-talk never marks, so it shows as "never
 *       read this room" however much it has read.
 *   L5  a mark that fails to post (hub down, timeout, a crash after printing)
 *       leaves a delivered turn showing unread. Reported on stderr.
 * Receipts never change an exit code. A hub without them (older, or its app
 * deployed ahead of its Convex functions) says so on stderr and works as
 * before.
 */
import {
  maxTurn,
  readCursor,
  takeAfter,
  withTurns,
  writeCursor,
} from "./hub-cursor.mjs";
import { unreadOwnLines } from "./hub-receipts.mjs";
import { selectLobby } from "./hub-rooms.mjs";

const HUB = process.env.HUB_URL || "http://127.0.0.1:4000";
const AGENT_KEY = process.env.AGENT_KEY || "dev-key";
const POLL_MS = 2000;
const MAX_BACKOFF_MS = 10_000;
const hdrs = { "Content-Type": "application/json", "X-Agent-Key": AGENT_KEY };

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const ME = arg("--as");
const PEER = arg("--peer");
const SESSION = arg("--session");
const SAY = arg("--say");
const WAIT = process.argv.includes("--wait");
const INBOX = process.argv.includes("--inbox") || (!SAY && !WAIT);

if (!ME) {
  console.error(
    'Usage: node scripts/hub-talk.mjs --as <name> [--peer <name>] [--session <id>] [--inbox|--say "…"|--wait] [--wait-timeout <seconds>] [--max-turns <n>]',
  );
  process.exit(1);
}

const LOBBY = "cursor-to-cursor";
const LIVE_KIND = "ide-session";
// A room that fills mid-loop is a dropped conversation, and the seat rooms
// reached 21 turns in a single afternoon. The cap exists to stop two
// unattended agents looping forever, not to end a supervised one, so it sits
// far above any real session. Overridable for callers that want a tight cap.
const MAX_TURNS = Number(arg("--max-turns", "500"));
const JOIN_TIMEOUT_MS = Number(arg("--join-timeout", WAIT ? "0" : "120")) * 1000;
const WAIT_TIMEOUT_SEC = arg("--wait-timeout");
const WAIT_UNTIL =
  WAIT && WAIT_TIMEOUT_SEC && Number.isFinite(Number(WAIT_TIMEOUT_SEC))
    ? Date.now() + Number(WAIT_TIMEOUT_SEC) * 1000
    : Infinity;

async function heartbeat(name) {
  await fetch(`${HUB}/a2a/heartbeat/${name}`, {
    method: "POST",
    headers: hdrs,
    body: "{}",
  }).catch(() => {});
}


function isNetworkError(error) {
  const msg = String(error?.message || error || "");
  const code = error?.cause?.code || error?.code;
  if (error?.name === "TypeError" && /fetch/i.test(msg)) return true;
  return /fetch failed|ECONNREFUSED|ECONNRESET|ETIMEDOUT|socket hang up|network/i.test(
    msg + " " + (code || ""),
  );
}

async function sleepUnreachable(attempt) {
  console.error(`[hub-talk] hub unreachable, retrying`);
  const ms = Math.min(POLL_MS * 2 ** Math.min(attempt, 3), MAX_BACKOFF_MS);
  await new Promise((r) => setTimeout(r, ms));
}

function waitTimedOut() {
  const error = new Error("wait timeout");
  error.exitCode = 2;
  return error;
}

async function api(path, init, { retry = false, until = Infinity } = {}) {
  let attempt = 0;
  for (;;) {
    if (retry && Date.now() >= until) throw waitTimedOut();
    try {
      const res = await fetch(`${HUB}${path}`, { headers: hdrs, ...init });
      if ([408, 502, 503, 504].includes(res.status)) {
        if (!retry) throw new Error(`${path} -> ${res.status}`);
        await sleepUnreachable(attempt++);
        continue;
      }
      const text = await res.text();
      let body = {};
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          if (retry) {
            await sleepUnreachable(attempt++);
            continue;
          }
        }
      }
      if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(body)}`);
      return body;
    } catch (error) {
      if (error.exitCode === 2) throw error;
      if (retry && isNetworkError(error)) {
        await sleepUnreachable(attempt++);
        continue;
      }
      throw error;
    }
  }
}

async function register(name) {
  await fetch(`${HUB}/a2a/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      apiKey: AGENT_KEY,
      agentCard: {
        name,
        description: `Coding-session peer ${name}`,
        kind: "ide-session",
      },
    }),
  }).catch(() => {});
}

function printTurns(messages) {
  for (const m of messages) {
    console.log(`--- ${m.from} ---`);
    console.log(m.content);
  }
}

async function myLobby(peer) {
  const { sessions } = await api(`/a2a/peer/${ME}/sessions`);
  return selectLobby(sessions, { me: ME, peer, title: LOBBY });
}

async function liveIdePeers() {
  await heartbeat(ME);
  const { agents } = await api(`/a2a/agents/live?kind=${LIVE_KIND}`);
  return (agents || []).map((a) => a.name).filter((n) => n && n !== ME);
}

async function createLobby(peer) {
  try {
    const { sessionId } = await api("/a2a/session", {
      method: "POST",
      body: JSON.stringify({
        title: LOBBY,
        participants: [ME, peer],
        maxTurns: MAX_TURNS,
      }),
    });
    return sessionId;
  } catch (error) {
    // --peer does not register the peer (that rewrote its agent card), so a
    // name the hub has never seen fails here. Registering it on its behalf
    // would claim the name with this seat's key, and a typo would open a room
    // nobody ever reads. Fail closed and say how to fix it.
    if (/Unknown peer/.test(String(error?.message || ""))) {
      throw new Error(
        `peer ${peer} is not registered on this hub — it must run hub-talk --as ${peer} once, or pass --session <id>`,
      );
    }
    throw error;
  }
}

// Receipts are off the hot path: one attempt, bounded, never thrown, never
// allowed to change what the call returns.
async function receiptCall(path, init) {
  try {
    const res = await fetch(`${HUB}${path}`, {
      headers: hdrs,
      signal: AbortSignal.timeout(5000),
      ...init,
    });
    const text = await res.text();
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {}
    return { ok: res.ok, status: res.status, body };
  } catch (error) {
    return { ok: false, status: 0, body: { error: String(error?.message || error) } };
  }
}

function receiptFailure(r) {
  const detail = typeof r.body?.error === "string" ? r.body.error : "";
  if (r.status === 404 && !detail) return "404: hub has no read receipts";
  return r.status ? `${r.status}${detail ? ` ${detail}` : ""}` : detail;
}

// Call only after the turns up to `throughTurn` have been printed. Marking
// first would turn a crash between the two into a false "read"; this order
// makes it a false "unread", which is the side to fail on.
async function markRead(sessionId, throughTurn, via) {
  if (!(throughTurn > 0)) return;
  const r = await receiptCall(`/a2a/session/${sessionId}/read`, {
    method: "POST",
    body: JSON.stringify({ reader: ME, throughTurn, via }),
  });
  if (!r.ok) {
    console.error(`[hub-talk] read receipt not recorded (${receiptFailure(r)})`);
  }
}

async function reportReceipts(sessionId) {
  const r = await receiptCall(`/a2a/session/${sessionId}/reads`);
  if (!r.ok) {
    console.error(`[hub-talk] read receipts unavailable from this hub (${receiptFailure(r)})`);
    return;
  }
  for (const line of unreadOwnLines(r.body, ME)) console.error(line);
}

async function resolveSession() {
  if (SESSION) return SESSION;

  // --peer names who this is for, so only the {ME, PEER} room qualifies.
  // Reusing "the newest open room containing ME" here is what put a kickoff
  // in the wrong conversation.
  if (PEER) return (await myLobby(PEER)) ?? (await createLobby(PEER));

  const existing = await myLobby();
  if (existing) return existing;

  const deadline = JOIN_TIMEOUT_MS > 0 ? Date.now() + JOIN_TIMEOUT_MS : Infinity;
  for (;;) {
    await register(ME);
    const others = await liveIdePeers();
    const lobby = await myLobby();
    if (lobby) return lobby;
    if (others.length) {
      const peer = [...others].sort()[0];
      if (ME < peer) return createLobby(peer);
      await new Promise((r) => setTimeout(r, POLL_MS));
      const again = await myLobby();
      if (again) return again;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        "no live IDE peer and no cursor-to-cursor lobby — start hub-talk --as <other> on the other session",
      );
    }
    console.error(`[hub-talk] waiting for another ide-session peer…`);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

async function main() {
  await register(ME);
  await heartbeat(ME);
  const sessionId = await resolveSession();
  console.error(`[hub-talk] ${ME} session ${sessionId}`);
  await heartbeat(ME);

  if (SAY) {
    const sent = await api(`/a2a/session/${sessionId}/message`, {
      method: "POST",
      body: JSON.stringify({ from: ME, content: SAY }),
    });
    if (sent.ok === false) throw new Error(`send rejected: ${sent.reason}`);
    console.error(`[hub-talk] sent turn ${sent.turn}`);
    // Deliberately does not touch the read cursor. Advancing it here is what
    // silently swallowed peer turns that arrived before this send.
  }

  const waitOpts = WAIT ? { retry: true, until: WAIT_UNTIL } : {};

  // A hub whose Express app is redeployed ahead of its Convex functions does
  // not ignore `after` — it rejects the whole query, so every read 500s. Fall
  // back to the unfiltered read and keep filtering locally, which takeAfter
  // already does. Latched per process so one probe costs one request.
  let serverTakesAfter = true;
  const fetchTurns = async (after) => {
    if (serverTakesAfter) {
      try {
        const body = await api(
          `/a2a/session/${sessionId}/messages?after=${after}`,
          undefined,
          waitOpts,
        );
        return withTurns(body.messages || []);
      } catch (error) {
        if (error.exitCode === 2) throw error;
        serverTakesAfter = false;
        console.error("[hub-talk] hub rejected ?after=, filtering client-side");
      }
    }
    const body = await api(
      `/a2a/session/${sessionId}/messages`,
      undefined,
      waitOpts,
    );
    return withTurns(body.messages || []);
  };

  // A reader with no cursor starts at 0 and is shown the whole room. Starting
  // from its own last turn instead would skip a peer turn that landed before
  // that send — the same drop, reached through the fallback. Replaying a
  // backlog once is noise; skipping a turn is data loss, so this fails closed.
  const after = readCursor(ME, sessionId, 0);

  // --inbox is the "did I miss anything" check, so it must not consume what
  // it reports: advancing the cursor here would destroy the evidence of a
  // skip in the act of showing it. It reads the whole room and leaves the
  // cursor where it was. Only --wait advances.
  if (INBOX && !WAIT) {
    const all = await fetchTurns(0);
    printTurns(all);
    console.error(
      `[hub-talk] ${all.length} turns, ${takeAfter(all, after, ME).length} unread after turn ${after} (cursor unchanged)`,
    );
    // The room is now in the agent's context, so the server mark moves; the
    // local cursor above does not. They answer different questions: the mark
    // is "delivered", the cursor is "what --wait has handed over as new".
    await markRead(sessionId, maxTurn(all), "inbox");
    await reportReceipts(sessionId);
    return 0;
  }

  if (!WAIT) return 0;

  const emit = async (pending) => {
    printTurns(pending);
    writeCursor(ME, sessionId, maxTurn(pending));
    await markRead(sessionId, maxTurn(pending), "wait");
  };

  // On timeout, "no peer turn" arrives with who has not seen yours: the
  // difference between a quiet room and an absent reader.
  const poll = async () => {
    try {
      return takeAfter(await fetchTurns(after), after, ME);
    } catch (error) {
      if (error.exitCode === 2) await reportReceipts(sessionId);
      throw error;
    }
  };

  const pending = await poll();
  if (pending.length) {
    await emit(pending);
    return 0;
  }

  for (;;) {
    if (Date.now() >= WAIT_UNTIL) {
      await reportReceipts(sessionId);
      throw waitTimedOut();
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
    await heartbeat(ME);
    const next = await poll();
    if (next.length) {
      await emit(next);
      return 0;
    }
  }
}

main()
  .then((code) => process.exit(code ?? 0))
  .catch((error) => {
    console.error(`[hub-talk] ${error.message}`);
    process.exit(error.exitCode === 2 ? 2 : 1);
  });
