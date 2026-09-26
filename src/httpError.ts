// Loop 6 O5: terse answers with NODE_ENV unset. The message never leaves the log.

import type { Response } from "express";

export function clientError(error: unknown): { status: number; error: string } {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  if (/ArgumentValidationError|does not match validator|ValidatorError/i.test(msg)) {
    return { status: 400, error: "bad request" };
  }
  return { status: 500, error: "internal error" };
}

export function respondInternal(res: Response, error: unknown): void {
  console.error(error);
  const pub = clientError(error);
  res.status(pub.status).json({ error: pub.error });
}
