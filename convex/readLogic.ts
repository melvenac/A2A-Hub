// Read receipts (T-049), split out so the rule is testable without Convex.
//
// A participant's read state is a high-water mark: "delivered through turn N".
// That is sound only because hub-talk prints contiguous ranges — the whole
// room (--inbox) or every peer turn above its cursor (--wait). A client that
// prints a subset must not post a mark.

export type ReadVia = "inbox" | "wait";

export interface NumberedTurn {
  turn: number;
  from: string;
  createdAt: number;
}

export interface Member {
  name: string;
  readThroughTurn?: number;
  readAt?: number;
  readVia?: ReadVia;
}

export interface ParticipantReadState {
  name: string;
  // null = no read has ever been recorded. Never rendered as turn 0: "never
  // read" and "read through turn N" are different facts.
  lastRead: null | { turn: number; at: number; via: ReadVia | null };
  unread: { turn: number; from: string; sentAt: number }[];
}

// The one numbering rule, shared with messages.list: a turn is the message's
// 1-based position in the room, in insertion order.
export function numberTurns<T>(messages: T[]): { message: T; turn: number }[] {
  return messages.map((message, i) => ({ message, turn: i + 1 }));
}

export function computeReadState(
  turns: NumberedTurn[],
  members: Member[],
): ParticipantReadState[] {
  return members.map((m) => {
    const mark = m.readThroughTurn ?? 0;
    return {
      name: m.name,
      lastRead:
        m.readThroughTurn === undefined
          ? null
          : { turn: m.readThroughTurn, at: m.readAt ?? 0, via: m.readVia ?? null },
      // A participant's own turn is never unread by them — by definition here,
      // not by moving their mark. Moving the mark on send would hide peer
      // turns that landed before it.
      unread: turns
        .filter((t) => t.from !== m.name && t.turn > mark)
        .map((t) => ({ turn: t.turn, from: t.from, sentAt: t.createdAt })),
    };
  });
}

/** Reject reasons for a mark, or null when it may be applied. */
export function validateMark(throughTurn: number, turnCount: number): string | null {
  if (!Number.isInteger(throughTurn) || throughTurn < 1) {
    return "throughTurn must be a positive integer";
  }
  // A mark past the end would pre-mark turns that do not exist yet as read.
  if (throughTurn > turnCount) {
    return `throughTurn ${throughTurn} is past the room's last turn (${turnCount})`;
  }
  return null;
}
