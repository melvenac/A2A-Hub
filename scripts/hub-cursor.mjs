/**
 * Read-cursor bookkeeping for hub-talk, split out so it is testable.
 *
 * The cursor is a TURN NUMBER, not a timestamp, and it moves only when a turn
 * has actually been printed. A --say must never advance it: a reader whose
 * cursor is moved by its own write cannot tell "nothing arrived" from "I
 * skipped it", so the drop is silent and the room looks healthy while turns
 * go missing.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Deliberately not the old `.since` name. Those files hold millisecond
// timestamps; reading one as a turn number would suppress every turn in the
// room — the same failure this change exists to remove.
export function cursorFile(me, sessionId) {
  return join(tmpdir(), `a2a-hub-talk-${me}-${sessionId}.after`);
}

export function readCursor(me, sessionId, fallback = 0) {
  try {
    const n = Number(readFileSync(cursorFile(me, sessionId), "utf8"));
    return Number.isInteger(n) && n >= 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

export function writeCursor(me, sessionId, turn) {
  writeFileSync(cursorFile(me, sessionId), String(turn));
}

/**
 * Number the turns. A hub that already returns `turn` wins; otherwise the
 * position in the room is the turn.
 *
 * The fallback stays sound against a hub that has not been redeployed yet:
 * such a hub ignores `after` and returns the whole room, so positions are
 * absolute. A hub new enough to honour `after` is new enough to send `turn`.
 */
export function withTurns(messages) {
  return (messages || []).map((m, i) => ({
    ...m,
    turn: Number.isInteger(m?.turn) ? m.turn : i + 1,
  }));
}

/** Peer turns this reader has not been shown yet. */
export function takeAfter(messages, after, me) {
  return withTurns(messages).filter((m) => m.from !== me && m.turn > after);
}

export function maxTurn(messages) {
  const turns = withTurns(messages).map((m) => m.turn);
  return turns.length ? Math.max(...turns) : 0;
}
