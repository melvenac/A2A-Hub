import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import { execFile } from "node:child_process";
import { respondInternal } from "../src/httpError.js";
import { rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../scripts/hub-talk.mjs", import.meta.url));
// A throwaway key for the mock hub (T-003: hub-talk has no default key).
const TEST_KEY = "test-key-for-the-mock-hub-000000000000";
const ME = "cli-test-reader";
const PEER = "cli-test-peer";

// Turns the stub hub serves. Deliberately without a `turn` field, so these
// runs also exercise the position fallback used against an un-redeployed hub.
let room: Array<{ from: string; content: string; createdAt: number }> = [];
let server: Server;
let hubUrl = "";
const sessions: string[] = [];

function cursorPath(sessionId: string) {
  return join(tmpdir(), `a2a-hub-talk-${ME}-${sessionId}.after`);
}

function newSession() {
  const id = `cli-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessions.push(id);
  return id;
}

function run(args: string[], timeoutMs = 20_000) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    execFile(
      process.execPath,
      [SCRIPT, ...args],
      { env: { ...process.env, HUB_URL: hubUrl, AGENT_KEY: TEST_KEY }, timeout: timeoutMs },
      (error: any, stdout, stderr) => {
        resolve({ code: error?.code ?? 0, stdout, stderr });
      },
    );
  });
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    res.setHeader("Content-Type", "application/json");

    if (url.pathname.endsWith("/messages")) {
      const after = Number(url.searchParams.get("after") ?? 0);
      const messages = room
        .map((m, i) => ({ ...m, turn: i + 1 }))
        .filter((m) => m.turn > after)
        // Strip the turn back off: this stub stands in for a hub that does
        // not send one.
        .map(({ turn, ...rest }) => rest);
      res.end(JSON.stringify({ messages }));
      return;
    }

    // Only the send route appends a turn. This stub stands in for a hub
    // without read receipts, so POST .../read falls through like any unknown
    // route instead of being mistaken for a message.
    if (req.method === "POST" && url.pathname.endsWith("/message")) {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const { from, content } = JSON.parse(body || "{}");
        room.push({ from, content, createdAt: Date.now() });
        res.end(JSON.stringify({ ok: true, turn: room.length }));
      });
      return;
    }

    res.end("{}");
  });

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address() as any;
  hubUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => server?.close());

afterEach(() => {
  room = [];
  for (const s of sessions.splice(0)) rmSync(cursorPath(s), { force: true });
});

// Each case spawns node and some wait out a 3s --wait-timeout: ~4.2s at
// 2eb7928 against vitest's 5s default, which flaked under load. Sized for
// the work, not the default.
describe("hub-talk cli", { timeout: 20_000 }, () => {
  it("--inbox reports without consuming: the cursor is untouched", async () => {
    const session = newSession();
    room = [{ from: PEER, content: "a peer turn", createdAt: 1 }];

    const first = await run(["--as", ME, "--session", session, "--inbox"]);
    expect(first.code).toBe(0);
    expect(first.stdout).toContain("a peer turn");
    expect(first.stderr).toContain("cursor unchanged");
    expect(existsSync(cursorPath(session))).toBe(false);

    // The diagnostic is repeatable — it did not destroy the evidence.
    const second = await run(["--as", ME, "--session", session, "--inbox"]);
    expect(second.stdout).toContain("a peer turn");
  });

  it("--say does not advance the cursor past an unread peer turn", async () => {
    const session = newSession();
    room = [{ from: PEER, content: "arrived before my send", createdAt: 1 }];

    const said = await run(["--as", ME, "--session", session, "--say", "my reply"]);
    expect(said.code).toBe(0);
    expect(said.stderr).toContain("sent turn 2");
    expect(existsSync(cursorPath(session))).toBe(false);

    // The peer turn that landed before the send is still delivered.
    const waited = await run([
      "--as", ME, "--session", session, "--wait", "--wait-timeout", "5",
    ]);
    expect(waited.code).toBe(0);
    expect(waited.stdout).toContain("arrived before my send");
  });

  it("--wait prints a peer turn, advances the cursor, then times out with rc 2", async () => {
    const session = newSession();
    room = [{ from: PEER, content: "only turn", createdAt: 1 }];

    const first = await run([
      "--as", ME, "--session", session, "--wait", "--wait-timeout", "5",
    ]);
    expect(first.code).toBe(0);
    expect(first.stdout).toContain("only turn");
    expect(readFileSync(cursorPath(session), "utf8")).toBe("1");

    // Nothing new: wait again and get a clean timeout rather than a replay.
    const second = await run([
      "--as", ME, "--session", session, "--wait", "--wait-timeout", "3",
    ]);
    expect(second.code).toBe(2);
    expect(second.stdout).not.toContain("only turn");
  });

  it("--invite without --init-key exits 1 before a request", async () => {
    const result = await run(["--as", ME, "--invite", "some-code", "--inbox"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--invite is only valid with --init-key");
  });

  it("--wait on an empty room times out with rc 2", async () => {
    const session = newSession();
    const result = await run([
      "--as", ME, "--session", session, "--wait", "--wait-timeout", "3",
    ]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("wait timeout");
  });
});

describe("hub-talk --peer against an unregistered name", () => {
  it("exits 1 and prints the fix-it line", async () => {
    const app = express();
    app.use(express.json());
    app.post("/a2a/register", (_req, res) => {
      res.json({ ok: true });
    });
    app.get("/a2a/peer/:name/sessions", (_req, res) => {
      res.json({ sessions: [] });
    });
    app.post("/a2a/session", (_req, res) => {
      respondInternal(
        res,
        new Error(
          "Unknown peer: UNREGISTERED (not registered on this hub; if its register was refused, create it with hub-talk --init-key)"
        )
      );
    });
    const server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const { port } = server.address() as { port: number };
    try {
      const result = await new Promise<{ code: number; stderr: string }>((resolve) => {
        execFile(
          process.execPath,
          [SCRIPT, "--as", ME, "--peer", "UNREGISTERED", "--say", "hi"],
          {
            env: {
              ...process.env,
              HUB_URL: `http://127.0.0.1:${port}`,
              AGENT_KEY: TEST_KEY,
            },
            timeout: 20_000,
          },
          (error: any, _stdout, stderr) => {
            resolve({ code: error?.code ?? 0, stderr });
          }
        );
      });
      expect(result.code).toBe(1);
      expect(result.stderr).toContain(
        "peer UNREGISTERED is not registered on this hub — it must run hub-talk --as UNREGISTERED once"
      );
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
