/**
 * Per-agent key rules (T-003, Loop 3 design §1, §7). Pure, so the Convex
 * mutations and the unit tests run the same decision.
 *
 * `keyStatus` is stored, never recomputed from how many names share a hash:
 * "owned" is written when a name acquires a key under these rules (insert,
 * migration, rotate) or by classifyAtDeploy for a row that was unshared at
 * deploy. A row with no status is legacy.
 */
export type KeyStatus = "owned" | "legacy";

export const KEY_FLOOR = 32;

export type RegisterDecision =
  | { kind: "insert" }
  | { kind: "same"; legacy: boolean }
  | { kind: "migrate" }
  | { kind: "refuse"; status: 400 | 409; reason: string };

export function isOwned(row: { keyStatus?: KeyStatus }): boolean {
  return row.keyStatus === "owned";
}

/**
 * The whole register decision (design §7's table). First match wins, and every
 * refusal leaves the stored hash unchanged.
 */
export function decideRegister(input: {
  /** The name's canonical row, or null for a new name. */
  existing: { apiKeyHash: string; keyStatus?: KeyStatus } | null;
  presentedHash: string;
  /** Some row of a *different* name holds presentedHash. */
  heldByOtherName: boolean;
  /** The presented key is shorter than KEY_FLOOR (only the hub sees the key). */
  keyTooShort: boolean;
  strict: boolean;
}): RegisterDecision {
  const { existing, presentedHash, heldByOtherName, keyTooShort, strict } = input;
  const holdsIt = existing !== null && existing.apiKeyHash === presentedHash;

  // U1: no name acquires a hash another name holds. Both modes.
  if (heldByOtherName && !holdsIt) {
    return { kind: "refuse", status: 409, reason: "key held by another agent" };
  }
  // Key floor on acquisition. Re-registering the hash you hold is exempt.
  if (!holdsIt && keyTooShort) {
    return { kind: "refuse", status: 400, reason: `key too short (min ${KEY_FLOOR})` };
  }
  if (existing === null) return { kind: "insert" };

  if (isOwned(existing)) {
    if (holdsIt) return { kind: "same", legacy: false };
    // C7: an owned name is never re-keyed by register, in warn or strict.
    return { kind: "refuse", status: 409, reason: "name holds its own key; use rotate" };
  }

  // Legacy row. U2 for the same hash, §4.1's migration for a fresh one.
  if (strict) {
    return {
      kind: "refuse",
      status: 409,
      reason: "legacy key; migrate while AUTH_MODE=warn (hub-talk --init-key)",
    };
  }
  return holdsIt ? { kind: "same", legacy: true } : { kind: "migrate" };
}

export type RotateDecision =
  | { kind: "rotate" }
  | { kind: "refuse"; status: 400 | 409; reason: string };

/** Rotation (§2.2): compare-and-swap on the current hash, owned rows only. */
export function decideRotate(input: {
  row: { apiKeyHash: string; keyStatus?: KeyStatus } | null;
  currentHash: string;
  newHash: string;
  newHeldByOtherName: boolean;
}): RotateDecision {
  const { row, currentHash, newHash, newHeldByOtherName } = input;
  if (!row || !isOwned(row) || row.apiKeyHash !== currentHash) {
    return { kind: "refuse", status: 409, reason: "stale key" };
  }
  if (newHash === currentHash) {
    return { kind: "refuse", status: 400, reason: "new key must differ from the current key" };
  }
  if (newHeldByOtherName) {
    return { kind: "refuse", status: 409, reason: "key held by another agent" };
  }
  return { kind: "rotate" };
}

/**
 * U3: a hash authenticates only when every row holding it (the caller reads up
 * to two) carries one name and is owned. Anything else resolves to nobody.
 */
export function resolveKeyHolder(
  rows: { name: string; keyStatus?: KeyStatus }[]
): { name: string } | null {
  if (rows.length === 0) return null;
  if (rows.some((r) => r.name !== rows[0].name)) return null;
  if (!rows.every(isOwned)) return null;
  return { name: rows[0].name };
}

export type KeyHashStatus = "owned" | "legacy" | "shared" | "unknown";

/** Why a hash does or does not authenticate. For log lines only, never auth. */
export function describeKeyHash(
  rows: { name: string; keyStatus?: KeyStatus }[]
): KeyHashStatus {
  if (rows.length === 0) return "unknown";
  if (rows.some((r) => r.name !== rows[0].name)) return "shared";
  return rows.every(isOwned) ? "owned" : "legacy";
}
