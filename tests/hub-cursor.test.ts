import { describe, it, expect, afterEach } from "vitest";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cursorFile,
  maxTurn,
  readCursor,
  takeAfter,
  withTurns,
  writeCursor,
} from "../scripts/hub-cursor.mjs";

const ME = "general";
const PEER = "atlas";
const sessions: string[] = [];

function room(id: string) {
  const sessionId = `${id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessions.push(sessionId);
  return sessionId;
}

afterEach(() => {
  for (const s of sessions.splice(0)) {
    rmSync(cursorFile(ME, s), { force: true });
  }
});

// The defect this file exists for: a --say used to advance the reader's
// cursor, so a peer turn that landed before the send was never delivered.
describe("read cursor", () => {
  it("peer turn, then ME says, then ME waits -> the peer turn is printed", () => {
    const sessionId = room("say-does-not-skip");

    // Peer speaks (turn 1). The reader has not read it yet, so no cursor.
    const afterPeerSpoke = [{ from: PEER, content: "turn 15 was dropped", createdAt: 1 }];

    // ME says. A send must leave the cursor alone — that is the whole fix, so
    // nothing is written here on purpose.
    const afterMeSaid = [
      ...afterPeerSpoke,
      { from: ME, content: "acknowledged", createdAt: 2 },
    ];

    // ME waits.
    const after = readCursor(ME, sessionId, 0);
    const pending = takeAfter(afterMeSaid, after, ME);

    expect(after).toBe(0);
    expect(pending).toHaveLength(1);
    expect(pending[0].from).toBe(PEER);
    expect(pending[0].content).toBe("turn 15 was dropped");
  });

  it("two peer turns, ME reads the inbox -> both printed and cursor is the last", () => {
    const sessionId = room("inbox-advances");

    const messages = [
      { from: PEER, content: "first", createdAt: 1 },
      { from: PEER, content: "second", createdAt: 2 },
    ];

    const unread = takeAfter(messages, readCursor(ME, sessionId, 0), ME);
    expect(unread.map((m) => m.content)).toEqual(["first", "second"]);

    writeCursor(ME, sessionId, maxTurn(unread));
    expect(readCursor(ME, sessionId, 0)).toBe(2);

    // A second read has nothing left to show, and the cursor holds.
    expect(takeAfter(messages, readCursor(ME, sessionId, 0), ME)).toHaveLength(0);
  });

  it("does not read a stale timestamp cursor as a turn number", () => {
    const sessionId = room("stale-since");

    // The old client wrote millisecond timestamps to a `.since` file. Read as
    // a turn number that would suppress every turn in the room, so the new
    // cursor must not pick it up.
    const stale = join(tmpdir(), `a2a-hub-talk-${ME}-${sessionId}.since`);
    writeFileSync(stale, String(Date.now()));

    try {
      expect(readCursor(ME, sessionId, 0)).toBe(0);
      const messages = [{ from: PEER, content: "still visible", createdAt: 1 }];
      expect(takeAfter(messages, readCursor(ME, sessionId, 0), ME)).toHaveLength(1);
    } finally {
      rmSync(stale, { force: true });
    }
  });

  it("numbers turns by position when the hub does not send them", () => {
    // A hub that has not been redeployed ignores `after` and returns the whole
    // room, so position is the absolute turn.
    const legacy = [
      { from: PEER, content: "a", createdAt: 1 },
      { from: ME, content: "b", createdAt: 2 },
      { from: PEER, content: "c", createdAt: 3 },
    ];
    expect(withTurns(legacy).map((m) => m.turn)).toEqual([1, 2, 3]);

    // An explicit turn from the hub wins.
    const served = [{ from: PEER, content: "a", createdAt: 1, turn: 15 }];
    expect(withTurns(served)[0].turn).toBe(15);
  });

  it("never returns the reader's own turns", () => {
    const messages = [
      { from: ME, content: "mine", createdAt: 1 },
      { from: PEER, content: "theirs", createdAt: 2 },
    ];
    expect(takeAfter(messages, 0, ME).map((m) => m.from)).toEqual([PEER]);
  });
});
