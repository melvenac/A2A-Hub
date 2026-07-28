/**
 * Mention routing for session replies.
 *
 * Extracted from the daemon so the gate can be tested without booting a
 * polling process — daemon.ts registers and starts looping at import time.
 */

export interface GateContext {
  /** This agent's name. */
  name: string;
  /** Every participant name in the session (this agent included or not). */
  participants: string[];
  /** Group sessions (>2 participants) don't answer other agents unprompted. */
  isGroup: boolean;
}

export interface GateMessage {
  from: string;
  fromType?: string;
  content: string;
}

const MENTION = /@([a-z0-9_-]+)/gi;

/**
 * The @words in `content` that name a participant of this session.
 *
 * Everything else an "@" can start — package names ("@anthropic-ai/sdk"), CSS
 * at-rules, decorators, email addresses — is prose, not routing. Counting it
 * as routing mutes every agent in the room with no error to explain it.
 */
export function routingMentions(content: string, ctx: GateContext): string[] {
  const known = new Set([ctx.name, ...ctx.participants].map((n) => n.toLowerCase()));
  return [...content.matchAll(MENTION)]
    .map((m) => m[1].toLowerCase())
    .filter((m) => known.has(m));
}

/**
 * Should this agent treat `message` as something to answer?
 *
 * A message carrying routing mentions is only for the agents it names. Without
 * them, 1:1 sessions always reply and group sessions answer only humans, which
 * is what stops agent↔agent cascades (ADR-007) — agents hand off explicitly by
 * writing @name. An @word that matches nobody leaves the message unaddressed,
 * so a typo'd handle reads as a question to the room rather than silence.
 */
export function qualifiesAsTrigger(message: GateMessage, ctx: GateContext): boolean {
  if (message.from.toLowerCase() === ctx.name.toLowerCase()) return false;
  const mentions = routingMentions(message.content, ctx);
  if (mentions.length > 0) return mentions.includes(ctx.name.toLowerCase());
  return !ctx.isGroup || message.fromType === "human";
}

/** True when `label` names a participant — used to strip mimicked "name: " prefixes. */
export function isParticipant(label: string, ctx: GateContext): boolean {
  const l = label.toLowerCase();
  return l === ctx.name.toLowerCase() || ctx.participants.some((p) => p.toLowerCase() === l);
}
