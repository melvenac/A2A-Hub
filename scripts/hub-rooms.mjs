/**
 * Lobby selection for hub-talk, split out so it is testable.
 *
 * With --peer the caller has named who it wants to talk to, so only a room
 * whose participants are exactly {me, peer} will do. Falling back to "the
 * newest open room containing me" sends the message into whichever
 * conversation happens to be open — how a QA kickoff landed in the
 * developer's room.
 */

export function participantNames(session) {
  return (session?.participants || []).map((p) =>
    typeof p === "string" ? p : p?.name,
  );
}

export function isOpen(session, title) {
  return Boolean(
    session?.isActive &&
      session.title === title &&
      session.turnCount < session.maxTurns,
  );
}

/** True when the room is exactly the two named peers, in any order. */
export function isPairRoom(session, me, peer) {
  const names = participantNames(session);
  return names.length === 2 && names.includes(me) && names.includes(peer);
}

/**
 * Pick the room to speak into. `peer` narrows to that pair; without it, the
 * newest open room containing this agent wins. Returns undefined when there
 * is nothing suitable, which the caller turns into a new room.
 */
export function selectLobby(sessions, { me, peer, title }) {
  const open = (sessions || [])
    .filter((s) => isOpen(s, title))
    .filter((s) => (peer ? isPairRoom(s, me, peer) : true))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return open[0]?._id;
}
