import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { mountUi } from "../src/ui.js";

let dist: string;

beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  dist = mkdtempSync(path.join(tmpdir(), "ui-mount-"));
  writeFileSync(path.join(dist, "index.html"), "<!doctype html><title>ui</title>");
  mkdirSync(path.join(dist, "assets"));
  writeFileSync(path.join(dist, "assets", "index-abc123.js"), "console.log(1)");
});

afterAll(() => {
  rmSync(dist, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function get(app: express.Express, p: string) {
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const { port } = server.address() as { port: number };
  try {
    const res = await fetch(`http://127.0.0.1:${port}${p}`, { redirect: "manual" });
    return { status: res.status, headers: res.headers, text: await res.text() };
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

/** The hub's shape in miniature: API routes first, then the UI mount. */
function hub(dir: string) {
  const app = express();
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/a2a/whoami", (_req, res) => res.json({ name: null }));
  const mounted = mountUi(app, dir);
  return { app, mounted };
}

describe("mountUi", () => {
  it("serves index.html at /ui/ with no-cache", async () => {
    const r = await get(hub(dist).app, "/ui/");
    expect(r.status).toBe(200);
    expect(r.text).toContain("<title>ui</title>");
    expect(r.headers.get("cache-control")).toBe("no-cache");
  });

  it("redirects /ui to /ui/", async () => {
    const r = await get(hub(dist).app, "/ui");
    expect(r.status).toBe(301);
    expect(r.headers.get("location")).toBe("/ui/");
  });

  it("caches hashed assets as immutable", async () => {
    const r = await get(hub(dist).app, "/ui/assets/index-abc123.js");
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("404s a missing file under /ui without falling through", async () => {
    const { app } = hub(dist);
    let reached = false;
    app.use((_req, res) => {
      reached = true;
      res.status(418).end();
    });
    const r = await get(app, "/ui/nope.js");
    expect(r.status).toBe(404);
    expect(reached).toBe(false);
  });

  it("leaves the API routes and / as they were", async () => {
    const { app } = hub(dist);
    expect((await get(app, "/health")).text).toBe('{"status":"ok"}');
    expect((await get(app, "/a2a/whoami")).text).toBe('{"name":null}');
    expect((await get(app, "/")).status).toBe(404);
    expect((await get(app, "/index.html")).status).toBe(404);
    expect((await get(app, "/assets/index-abc123.js")).status).toBe(404);
  });

  it("mounts nothing when the build is absent", async () => {
    const { app, mounted } = hub(path.join(dist, "missing"));
    expect(mounted).toBe(false);
    expect((await get(app, "/ui/")).status).toBe(404);
  });
});
