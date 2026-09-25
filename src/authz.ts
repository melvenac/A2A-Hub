import type { Request, Response } from "express";
import { authMode, type AuthMode } from "./auth.js";

/**
 * T-066 (Loop 5): a key acts only as itself, and only in its own rooms.
 *
 * Every check here has the same shape: the caller is req.agentName (set by the
 * key guard), a request either passes or it does not, and a failure is
 *   strict: refused, and logged `[authz] REJECT ...`
 *   warn:   let through exactly as before, and logged `[authz] WOULD REJECT ...`
 * so a log read can see every mismatch before strict is turned on (D-012).
 * `[authz]` is kept apart from auth.ts's `[auth]` (is the key valid at all).
 *
 * A log line carries names and ids only. Anything the caller asserted is
 * sanitised first, so a key pasted into a field never reaches the log.
 */

export type Verdict = "ok" | "warn" | "reject";

export function verdict(allowed: boolean, mode: AuthMode = authMode): Verdict {
  if (allowed) return "ok";
  return mode === "strict" ? "reject" : "warn";
}

/** Whether an asserted name is the caller. An unknown caller (warn) matches nothing. */
export function isCaller(asserted: unknown, caller: string | null | undefined): boolean {
  return caller != null && caller !== "" && asserted === caller;
}

/** A caller-supplied value, made safe for a log line. */
export function sanitize(value: unknown): string {
  return String(value)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[A-Za-z0-9+/_=-]{32,}/g, "<masked>")
    .slice(0, 80);
}

/**
 * A session or task id for a log line: its first 8 characters. A Convex id is
 * 32 characters, the same length as the key-like runs `sanitize` masks and a
 * log reader rejects; a prefix still finds the room.
 */
export function shortId(id: unknown): string {
  return `${sanitize(String(id).slice(0, 8))}…`;
}

/** The route template (e.g. POST /a2a/session/:sessionId/message), never the raw path. */
export function routeOf(req: Request): string {
  const path = req.route?.path ? `${req.baseUrl ?? ""}${req.route.path}` : req.originalUrl.split("?")[0];
  return `${req.method} ${path}`;
}

/** The one `[authz]` line format. `route` is a template, never a raw path. */
export function authzLine(
  v: Exclude<Verdict, "ok">,
  what: string,
  route: string,
  caller: string | null | undefined
): string {
  const who = caller ? sanitize(caller) : "unknown";
  const base = `[authz] ${v === "reject" ? "REJECT" : "WOULD REJECT"} ${what} on ${route} caller=${who}`;
  return v === "reject" ? base : `${base} (AUTH_MODE=warn; set AUTH_MODE=strict to enforce)`;
}

/**
 * Logs one failed check where there is no Express response to refuse through
 * (the JSON-RPC executor and task store, and /read, whose refusal is markRead's
 * own). Returns the verdict so the caller can refuse in strict.
 */
export function note(
  what: string,
  route: string,
  caller: string | null | undefined,
  mode: AuthMode = authMode
): Exclude<Verdict, "ok"> {
  const v = verdict(false, mode) as Exclude<Verdict, "ok">;
  console.warn(authzLine(v, what, route, caller));
  return v;
}

export type Refusal = { status: number; error: string };

/**
 * Applies one check. Returns true when the handler should go on (allowed, or
 * warn), false when the response has already been sent (strict refusal).
 */
export function enforce(
  req: Request,
  res: Response,
  allowed: boolean,
  what: string,
  refusal: Refusal,
  mode: AuthMode = authMode
): boolean {
  const v = verdict(allowed, mode);
  if (v === "ok") return true;
  console.warn(authzLine(v, what, routeOf(req), req.agentName));
  if (v === "warn") return true;
  res.status(refusal.status).json({ error: refusal.error });
  return false;
}

/** A name the request asserts (from, :agentId, agentName, reader, ...) must be the caller. */
export function bindName(
  req: Request,
  res: Response,
  asserted: unknown,
  field: string,
  mode: AuthMode = authMode
): boolean {
  return enforce(
    req,
    res,
    isCaller(asserted, req.agentName),
    `${field}=${sanitize(asserted)}`,
    { status: 403, error: `${field} is not the caller` },
    mode
  );
}

/** The one answer for a session or task the caller may not see: it looks absent (Q2). */
export const SESSION_NOT_FOUND: Refusal = { status: 404, error: "session not found" };
export const TASK_NOT_FOUND: Refusal = { status: 404, error: "task not found" };
