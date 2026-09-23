import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { spawn } from "node:child_process";
import { rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// hub-talk against a stub hub that has read receipts (T-049) and records every
// request, so the tests can check what hub-talk posted, in what order, and
// that nothing it does to receipts changes an exit code. T-051's --peer
// behaviour is here too, because it needs the same request log.

const SCRIPT = fileURLToPath(new URL("../scripts/hub-talk.mjs", import.meta.url));
const ME = "rcpt-test-reader";
const PEER = "rcpt-test-peer";
const UNREGISTERED = "rcpt-never-registered";
const LOBBY_ID = "rcpt-lobby";

type Turn = { from: string; content: string; createdAt: number };
type Logged = { method: string; path: string; body: any; stdoutSoFar: string };

let room: Turn[] = [];
let log: Logged[] = [];
let readStatus = 200;
let readsBody: any = { turnCount: 0, participants: [] };
let lobbyExists = false;
let server: Server;
let hubUrl = "";
let liveStdout = "";
const sessions: string[] = [];

function cursorPath(sessionId: string) {
  return join(tmpdir(), `a2a-hub-talk-${ME}-${sessionId}.after`);
}

function newSession() {
  const id = `rcpt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessions.push(id);
  return id;
}

// spawn rather than execFile so each logged request can record how much of
// hub-talk's stdout had arrived when the request did.
function run(args: string[], timeoutMs = 20_000) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    liveStdout = "";
    let stderr = "";
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      env: { ...process.env, HUB_URL: hubUrl },
    });
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on("data", (c) => (liveStdout += c));
    child.stderr.on("data", (c) => (stderr += c));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout: liveStdout, stderr });
    });
  });
}

const posts = (suffix: string) =>
  log.filter((r) => r.method === "POST" && r.path.endsWith(suffix));

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const body = raw ? JSON.parse(raw) : undefined;
      log.push({ method: req.method ?? "", path: url.pathname, body, stdoutSoFar: liveStdout });
      res.setHeader("Content-Type", "application/json");
      const send = (status: number, payload: unknown) => {
        res.statusCode = status;
        res.end(JSON.stringify(payload));
      };

      if (req.method === "POST" && url.pathname.endsWith("/read")) {
        if (readStatus === 404) return send(404, {}); // a hub without the route
        if (readStatus !== 200) return send(readStatus, { error: "Could not find function" });
        return send(200, { ok: true, readThroughTurn: body?.throughTurn, advanced: true });
      }
      if (req.method === "GET" && url.pathname.endsWith("/reads")) {
        return send(200, readsBody);
      }
      if (url.pathname.endsWith("/messages")) {
        const after = Number(url.searchParams.get("after") ?? 0);
        const messages = room
          .map((m, i) => ({ ...m, turn: i + 1 }))
          .filter((m) => m.turn > after);
        return send(200, { messages });
      }
      if (req.method === "POST" && url.pathname.endsWith("/message")) {
        room.push({ from: body.from, content: body.content, createdAt: Date.now() });
        return send(200, { ok: true, turn: room.length });
      }
      if (url.pathname.endsWith(`/peer/${ME}/sessions`)) {
        const sessionsForMe = lobbyExists
          ? [{
              _id: LOBBY_ID, title: "cursor-to-cursor", isActive: true,
              turnCount: 0, maxTurns: 500, createdAt: 1,
              participants: [{ name: ME }, { name: PEER }],
            }]
          : [];
        return send(200, { sessions: sessionsForMe });
      }
      if (req.method === "POST" && url.pathname === "/a2a/session") {
        const unknown = (body?.participants ?? []).find((n: string) => n === UNREGISTERED);
        if (unknown) return send(500, { error: `Unknown peer: ${unknown}` });
        return send(200, { ok: true, sessionId: LOBBY_ID });
      }
      send(200, {});
    });
  });

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address() as any;
  hubUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => server?.close());

afterEach(() => {
  room = [];
  log = [];
  readStatus = 200;
  readsBody = { turnCount: 0, participants: [] };
  lobbyExists = false;
  for (const s of sessions.splice(0)) rmSync(cursorPath(s), { force: true });
  rmSync(cursorPath(LOBBY_ID), { force: true });
});

describe("hub-talk read receipts", () => {
  it("--wait marks what it printed, via wait, and only after printing it", async () => {
    const session = newSession();
    room = [
      { from: PEER, content: "first peer turn", createdAt: 1 },
      { from: ME, content: "my turn", createdAt: 2 },
      { from: PEER, content: "second peer turn", createdAt: 3 },
    ];
    const result = await run(["--as", ME, "--session", session, "--wait", "--wait-timeout", "5"]);
    expect(result.code).toBe(0);

    const marks = posts("/read");
    expect(marks).toHaveLength(1);
    expect(marks[0].path).toBe(`/a2a/session/${session}/read`);
    expect(marks[0].body).toEqual({ reader: ME, throughTurn: 3, via: "wait" });
    // The turn was already on stdout when the mark reached the hub.
    expect(marks[0].stdoutSoFar).toContain("second peer turn");
  });

  it("--inbox marks the whole room via inbox and still leaves the local cursor alone", async () => {
    const session = newSession();
    room = [
      { from: PEER, content: "peer one", createdAt: 1 },
      { from: PEER, content: "peer two", createdAt: 2 },
    ];
    const result = await run(["--as", ME, "--session", session, "--inbox"]);
    expect(result.code).toBe(0);
    expect(result.stderr).toContain("cursor unchanged");
    expect(existsSync(cursorPath(session))).toBe(false);

    const marks = posts("/read");
    expect(marks).toHaveLength(1);
    expect(marks[0].body).toEqual({ reader: ME, throughTurn: 2, via: "inbox" });
    expect(marks[0].stdoutSoFar).toContain("peer two");
  });

  it("an existing cursor is left byte-identical by --inbox", async () => {
    const session = newSession();
    room = [{ from: PEER, content: "peer one", createdAt: 1 }];
    writeFileSync(cursorPath(session), "0");
    await run(["--as", ME, "--session", session, "--inbox"]);
    expect(readFileSync(cursorPath(session), "utf8")).toBe("0");
  });

  it("--say posts no mark: a send is not a read", async () => {
    const session = newSession();
    room = [{ from: PEER, content: "unread peer turn", createdAt: 1 }];
    const result = await run(["--as", ME, "--session", session, "--say", "hello"]);
    expect(result.code).toBe(0);
    expect(posts("/read")).toHaveLength(0);
  });

  it("an empty room posts no mark", async () => {
    const session = newSession();
    await run(["--as", ME, "--session", session, "--inbox"]);
    expect(posts("/read")).toHaveLength(0);
  });

  for (const status of [404, 500]) {
    it(`a hub answering ${status} on /read changes no exit code and says so`, async () => {
      readStatus = status;
      const session = newSession();
      room = [{ from: PEER, content: "a turn", createdAt: 1 }];

      const waited = await run(["--as", ME, "--session", session, "--wait", "--wait-timeout", "5"]);
      expect(waited.code).toBe(0);
      expect(waited.stdout).toContain("a turn");
      expect(waited.stderr).toContain("read receipt not recorded");

      const inbox = await run(["--as", ME, "--session", session, "--inbox"]);
      expect(inbox.code).toBe(0);
      expect(inbox.stderr).toContain("read receipt not recorded");

      const timedOut = await run(["--as", ME, "--session", session, "--wait", "--wait-timeout", "3"]);
      expect(timedOut.code).toBe(2);
    });
  }

  it("--wait timing out lists the caller's turns someone has not been shown, then exits 2", async () => {
    const session = newSession();
    room = [{ from: ME, content: "turn nobody read", createdAt: Date.UTC(2026, 8, 23, 8, 1, 42) }];
    readsBody = {
      turnCount: 1,
      participants: [
        { name: ME, lastRead: null, unread: [] },
        {
          name: PEER,
          lastRead: null,
          unread: [{ turn: 1, from: ME, sentAt: Date.UTC(2026, 8, 23, 8, 1, 42) }],
        },
      ],
    };
    const result = await run(["--as", ME, "--session", session, "--wait", "--wait-timeout", "3"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain(
      `turn 1 (yours): unread by ${PEER} since 2026-09-23T08:01:42Z — never read this room`,
    );
  });

  it("--inbox lists the caller's unread turns too", async () => {
    const session = newSession();
    room = [{ from: ME, content: "mine", createdAt: 1 }];
    readsBody = {
      turnCount: 1,
      participants: [
        {
          name: PEER,
          lastRead: { turn: 0, at: 0, via: "wait" },
          unread: [{ turn: 1, from: ME, sentAt: 1 }],
        },
      ],
    };
    const result = await run(["--as", ME, "--session", session, "--inbox"]);
    expect(result.code).toBe(0);
    expect(result.stderr).toContain(`unread by ${PEER}`);
    expect(result.stderr).toContain("read through turn 0");
  });
});

describe("hub-talk --peer (T-051)", () => {
  it("never registers the named peer, only the caller", async () => {
    lobbyExists = true;
    const result = await run(["--as", ME, "--peer", PEER, "--say", "hi"]);
    expect(result.code).toBe(0);
    const registered = posts("/a2a/register").map((r) => r.body?.name);
    expect(registered).toContain(ME);
    expect(registered).not.toContain(PEER);
  });

  it("with no room yet, still registers only the caller when the peer is known", async () => {
    const result = await run(["--as", ME, "--peer", PEER, "--say", "hi"]);
    expect(result.code).toBe(0);
    expect(posts("/a2a/register").map((r) => r.body?.name)).not.toContain(PEER);
  });

  it("an unregistered peer exits 1, names the fix, and registers nothing for it", async () => {
    const result = await run(["--as", ME, "--peer", UNREGISTERED, "--say", "hi"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`peer ${UNREGISTERED} is not registered on this hub`);
    expect(result.stderr).toContain(`hub-talk --as ${UNREGISTERED}`);
    expect(posts("/a2a/register").map((r) => r.body?.name)).not.toContain(UNREGISTERED);
    expect(posts("/message")).toHaveLength(0);
  });
});
