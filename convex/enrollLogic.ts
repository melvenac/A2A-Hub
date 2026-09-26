// Loop 6 (T-067): pure enrollment decisions. No database, no plaintext code.

export const CODE_TTL_MS = 24 * 60 * 60 * 1000;

export const ENROLL_TEXT = {
  "no-code": "this name is new and needs an enrollment code from its owner",
  expired: "this enrollment code is expired",
  used: "this enrollment code is already used",
  "not-valid": "this enrollment code is not valid",
  "kind-human": "a register cannot create a human owner",
  "agent-issue": "only a human owner can issue an enrollment code",
} as const;

export type EnrollCondition = "expired" | "used" | "not-valid";

export type CodeView = {
  issuer: string;
  expiresAt: number;
  usedAt?: number;
};

/** A presented hash against the stored row. Missing, used, and expired stay distinct. */
export function judgeCode(
  row: CodeView | null | undefined,
  now: number
): "ok" | EnrollCondition {
  if (!row) return "not-valid";
  if (row.usedAt !== undefined) return "used";
  if (row.expiresAt <= now) return "expired";
  return "ok";
}

/** Drop kind human on a new row. An already-human row stays human, whatever card was sent. */
export function cardForStore(card: unknown, alreadyHuman: boolean): unknown {
  if (alreadyHuman) {
    const base = card && typeof card === "object" ? { ...(card as object) } : {};
    return { ...base, kind: "human" };
  }
  if (!card || typeof card !== "object") return card;
  const rec = card as { kind?: unknown };
  if (rec.kind !== "human") return card;
  const next = { ...rec };
  delete next.kind;
  return next;
}
