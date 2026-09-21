/**
 * Same window as GET /a2a/agents/live: lastSeen older than 45s is not live.
 * Instance staleness uses this number so a restart after the live cutoff is a
 * normal replacement, and a still-live process is the one that gets superseded.
 */
export const INSTANCE_LIVENESS_MS = 45_000;

export type HeartbeatDecision = "legacy" | "active" | "superseded";

/**
 * Heartbeat lease. Register (not heartbeat) is the takeover: a new instanceId
 * on register becomes active even when the current holder is fresh. Applying
 * newest-wins on every heartbeat would flip-flop two live daemons every POLL_MS.
 */
export function decideHeartbeat(input: {
  instanceId?: string;
  activeInstanceId?: string;
  lastHeartbeatAt?: number;
  now: number;
  windowMs?: number;
}): HeartbeatDecision {
  const { instanceId, activeInstanceId, lastHeartbeatAt, now } = input;
  const windowMs = input.windowMs ?? INSTANCE_LIVENESS_MS;
  if (!instanceId) return "legacy";
  if (!activeInstanceId || activeInstanceId === instanceId) return "active";
  const stale =
    lastHeartbeatAt === undefined || now - lastHeartbeatAt > windowMs;
  return stale ? "active" : "superseded";
}
