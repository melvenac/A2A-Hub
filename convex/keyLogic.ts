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

/**
 * sha256 of the retired shared key that 8 tcm names held (Loop 2, V-003). No
 * name may ever acquire it again, in either mode, whatever the caller reports
 * about key length (Loop 3 ruling on departure 1): the floor is decided by the
 * hub, and a direct Convex caller can omit that flag. Held as the hash, never
 * the key. A legacy row that already holds it may keep re-registering (U2)
 * until its release.
 */
export const RETIRED_SHARED_KEY_HASH =
  "7e9f8fd111802be56c379d597842e29b2cebd35ff2133d431a49fa556a18704e";

/**
 * The one chokepoint for writing keyStatus "owned" (ruling 3, F2): a row that
 * holds the retired shared key's hash is never owned, on any path, public or
 * internal. Every writer of "owned" asks this instead of writing the literal.
 */
export function ownedStatusFor(apiKeyHash: string): KeyStatus {
  return apiKeyHash === RETIRED_SHARED_KEY_HASH ? "legacy" : "owned";
}

/** classifyAtDeploy's rule: owned only if unshared and not the retired key. */
export function classifyAtDeployStatus(apiKeyHash: string, shared: boolean): KeyStatus {
  return shared ? "legacy" : ownedStatusFor(apiKeyHash);
}

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

  // The retired shared key is never acquired, whatever keyTooShort says.
  if (!holdsIt && presentedHash === RETIRED_SHARED_KEY_HASH) {
    return { kind: "refuse", status: 400, reason: "the retired shared key cannot be registered" };
  }
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
  if (newHash === RETIRED_SHARED_KEY_HASH) {
    return { kind: "refuse", status: 400, reason: "the retired shared key cannot be registered" };
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
  rows: { name: string; apiKeyHash?: string; keyStatus?: KeyStatus }[]
): { name: string } | null {
  if (rows.length === 0) return null;
  // The retired key authenticates nobody, even on a row a pre-fix
  // classifyAtDeploy (84694b9) marked owned (ruling 3, F2).
  if (rows.some((r) => r.apiKeyHash === RETIRED_SHARED_KEY_HASH)) return null;
  if (rows.some((r) => r.name !== rows[0].name)) return null;
  if (!rows.every(isOwned)) return null;
  return { name: rows[0].name };
}

export type KeyHashStatus = "owned" | "legacy" | "shared" | "unknown";

/** Why a hash does or does not authenticate. For log lines only, never auth. */
export function describeKeyHash(
  rows: { name: string; apiKeyHash?: string; keyStatus?: KeyStatus }[]
): KeyHashStatus {
  if (rows.length === 0) return "unknown";
  if (rows.some((r) => r.name !== rows[0].name)) return "shared";
  if (rows.some((r) => r.apiKeyHash === RETIRED_SHARED_KEY_HASH)) return "legacy";
  return rows.every(isOwned) ? "owned" : "legacy";
}
