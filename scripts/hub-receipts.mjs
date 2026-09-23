/**
 * Read-receipt rendering for hub-talk (T-049), split out so it is testable.
 *
 * Input is the hub's GET /a2a/session/:id/reads body. "Never read" and "read
 * through turn N" are different facts and must never print alike: a null
 * lastRead is not turn 0.
 */

export function isoTime(ms) {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function describeMark(lastRead) {
  if (!lastRead) return "never read this room";
  const via = lastRead.via ? ` (${lastRead.via})` : "";
  return `read through turn ${lastRead.turn} at ${isoTime(lastRead.at)}${via}`;
}

/** One line per (own turn, participant who has not been shown it), by turn. */
export function unreadOwnLines(state, me) {
  const rows = [];
  for (const p of state?.participants || []) {
    if (p.name === me) continue;
    const mark = describeMark(p.lastRead);
    for (const t of p.unread || []) {
      if (t.from !== me) continue;
      rows.push({
        turn: t.turn,
        line: `[hub-talk] turn ${t.turn} (yours): unread by ${p.name} since ${isoTime(t.sentAt)} — ${mark}`,
      });
    }
  }
  return rows.sort((a, b) => a.turn - b.turn).map((r) => r.line);
}
