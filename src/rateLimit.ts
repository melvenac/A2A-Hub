// Loop 6 (T-005), ruling 2 addendum. In-process fixed window.
// One hub process. The build re-checks the live compose before relying on that.
//
// Per name per 60s: 10 * (3 * 65 + 30 * (3 + session_count)) at session_count 1.
//   65 = one hub-talk --wait process: start is 4 (register, heartbeat,
//   resolveSession, heartbeat at scripts/hub-talk.mjs:367-371) plus 30 polls
//   of heartbeat+read (scripts/hub-talk.mjs:469-471) = 4 + 60, about 65.
//   Three concurrent processes: 3 * 65. Daemon: 30 loops * (heartbeat + queue
//   + session list + one session's messages) = 30 * (3 + 1).
//   10 * (195 + 120) = 3150.
// Global per 60s: 10 * N, N = 9 (ruling 1). Shared by missing-key, unknown-key,
// new-name register, and /ui. A flood can deny those for the rest of the window.
// It cannot reach an existing name's hub-talk, which is on that name's bucket.

import type { Response } from "express";

export const WINDOW_MS = 60_000;
export const PER_KEY_LIMIT = 10 * (3 * 65 + 30 * (3 + 1));
export const GLOBAL_LIMIT = 10 * 9;
export const GLOBAL_BUCKET = "global";

type Window = { start: number; count: number };

const windows = new Map<string, Window>();

export function resetLimits(now = Date.now()): void {
  windows.clear();
  void now;
}

export function charge(
  bucket: string,
  limit: number,
  now = Date.now()
): { ok: true } | { ok: false; retryAfter: number } {
  const cur = windows.get(bucket);
  if (!cur || now - cur.start >= WINDOW_MS) {
    windows.set(bucket, { start: now, count: 1 });
    return { ok: true };
  }
  if (cur.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((cur.start + WINDOW_MS - now) / 1000));
    return { ok: false, retryAfter };
  }
  cur.count += 1;
  return { ok: true };
}

/** Sends 429 and returns true when the bucket is exhausted. */
export function limited(res: Response, bucket: string, limit: number): boolean {
  const result = charge(bucket, limit);
  if (result.ok) return false;
  res.setHeader("Retry-After", String(result.retryAfter));
  res.status(429).json({ error: "too many requests" });
  return true;
}
