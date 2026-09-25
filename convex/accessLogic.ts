// T-066 (Loop 5 §3-§4): who may see a room. Pure, so it is unit tested
// without a database (tests/access-logic.test.ts), like keyLogic and readLogic.
//
// A caller may see a session if it is a participant, or if it is a human and
// some participant is an agent it owns: an owner sees what his agents see, and
// never more. No agent gains a view of a room it is not in.

/** The fields of an agents row this module reads. */
export type OwnedRow = {
  name: string;
  agentCard?: { kind?: unknown } | null;
  owner?: string;
};

export function isHumanRow(row: OwnedRow | null | undefined): boolean {
  return row?.agentCard?.kind === "human";
}

/**
 * The human who owns a row. A human-kind row owns itself even before
 * agents:assignOwnerAtDeploy has run; any other row has the stored owner, or
 * none.
 */
export function ownerOf(row: OwnedRow | null | undefined): string | undefined {
  if (!row) return undefined;
  if (row.owner) return row.owner;
  return isHumanRow(row) ? row.name : undefined;
}

export type Access = { participant: boolean; ownerView: boolean };

/**
 * @param caller        the authenticated name, or null (warn mode, unknown key)
 * @param callerRow     the caller's agents row, if it has one
 * @param participants  the session's participant names
 * @param rowsByName    agents rows of the participants that have one
 */
export function decideAccess(
  caller: string | null,
  callerRow: OwnedRow | null | undefined,
  participants: string[],
  rowsByName: Map<string, OwnedRow>
): Access {
  if (!caller) return { participant: false, ownerView: false };
  const participant = participants.includes(caller);
  if (participant) return { participant, ownerView: false };
  if (!isHumanRow(callerRow)) return { participant, ownerView: false };
  const ownerView = participants.some((name) => {
    const row = rowsByName.get(name);
    return !!row && !isHumanRow(row) && ownerOf(row) === caller;
  });
  return { participant, ownerView };
}

/**
 * The first participant with another owner than the caller, or null (Q6, O2: a
 * create). A name with no agents row is skipped: sessions.create answers it
 * with its own "Unknown peer" error, which hub-talk reads (Preserve 1).
 */
export function crossOwnerParticipant(
  callerRow: OwnedRow | null | undefined,
  participants: string[],
  rowsByName: Map<string, OwnedRow>
): string | null {
  const owner = ownerOf(callerRow);
  for (const name of participants) {
    const row = rowsByName.get(name);
    if (row && ownerOf(row) !== owner) return name;
  }
  return null;
}
