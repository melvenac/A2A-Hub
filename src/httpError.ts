// Loop 6 O5: terse answers with NODE_ENV unset. The message never leaves the log.

import type { Response } from "express";

export function clientError(error: unknown): { status: number; error: string } {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  // hub-talk matches this sentence (scripts/hub-talk.mjs createLobby). It names
  // only the participant the caller sent. 404, not a hidden 500.
  const unknownPeer = msg.match(/Unknown peer: [^"\r\n]+/);
  if (unknownPeer) return { status: 404, error: unknownPeer[0].trim() };
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

/** After every route, including /ui. Unmatched paths are JSON, not HTML. */
export function mountTrailingNotFound(app: { use: Function }): void {
  app.use((_req: unknown, res: Response) => {
    res.status(404).json({ error: "not found" });
  });
}
