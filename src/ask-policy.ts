export type AskPolicy = { allow: string[] };

/**
 * Absent policy = allow all (today's behaviour). Present policy is the opt-in.
 * A null/undefined asker is the unauthenticated warn-mode path — allow, same
 * as today. Do not treat an empty allow list as "absent".
 */
export function evaluateAsk(
  policy: AskPolicy | undefined | null,
  askerName: string | null | undefined
): "allow" | "deny" {
  if (!policy) return "allow";
  if (askerName == null || askerName === "") return "allow";
  return policy.allow.includes(askerName) ? "allow" : "deny";
}

export function askDeniedReason(askerName: string, targetName: string): string {
  return `askPolicy does not allow ${askerName} to ask ${targetName}`;
}
