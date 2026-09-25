import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";

// The chat client (client/, built by the Dockerfile's `client` stage) served by
// the hub itself, so tcm's hub is one URL with no dev server (Loop 4, T-061).
// It lives under /ui and nowhere else: /ui is not a prefix of any API route and
// none of them is a prefix of /ui, and it sits outside the /a2a key guard so
// the page loads keyless. fallthrough:false means a missing file under /ui is
// a 404 here and never reaches another handler.
export const UI_PREFIX = "/ui";

/** Mounts the built client at /ui. Returns false (and mounts nothing) when the
 *  build is absent, so a hub built without the client behaves as before. */
export function mountUi(app: express.Express, dir: string): boolean {
  const root = path.resolve(dir);
  if (!existsSync(path.join(root, "index.html"))) {
    console.log(`UI: no build at ${root} — /ui not served`);
    return false;
  }
  app.use(
    UI_PREFIX,
    express.static(root, {
      index: "index.html",
      fallthrough: false,
      setHeaders(res, filePath) {
        // Vite hashes everything under assets/, so it can be cached for good;
        // index.html must be revalidated or a redeploy is never picked up.
        if (filePath.startsWith(path.join(root, "assets") + path.sep)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    })
  );
  console.log(`UI: serving ${root} at ${UI_PREFIX}/`);
  return true;
}
