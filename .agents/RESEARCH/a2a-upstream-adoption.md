# Research: What A2A-Hub can adopt from a2aproject upstream

Date: 2026-07-30 · Session 12 · Sources: a2a-protocol.org/latest, github.com/a2aproject

## Headline finding

`@a2a-js/sdk@0.3.13` is **already a dependency** and is used for exactly one thing:

```
src/agent-card.ts:1: import type { AgentCard } from "@a2a-js/sdk";
```

That's it. One type import. All 15 routes in `src/index.ts` (383 LOC) are hand-rolled REST
at `/a2a/*` — which is *not* the A2A wire protocol. The spec transports are JSON-RPC 2.0
(single endpoint), HTTP+JSON/REST, and gRPC. So the hub is A2A-shaped but not A2A-speaking,
and we are maintaining a transport layer the SDK ships for free.

## SDK surface we're not using

Verified from `node_modules/@a2a-js/sdk/dist/**/*.d.ts`:

| Export (from) | Replaces / fixes |
|---|---|
| `jsonRpcHandler`, `restHandler`, `agentCardHandler` (`/server/express`) | The 15 hand-rolled `/a2a/*` routes. Note `A2AExpressApp` exists but is **deprecated** — use the three middlewares directly. |
| `AgentExecutor` (`execute`, `cancelTask`) | `src/executor.ts` (70 LOC) — same shape, spec-defined |
| `DefaultRequestHandler`, `ResultManager` | Task lifecycle state machine we currently open-code |
| `TaskStore` (`save`/`load`, 2 methods) | Implement `ConvexTaskStore` — keeps Convex as the store, gets the lifecycle for free |
| `ExecutionEventBus`, `ExecutionEventQueue` | SSE streaming — kills the `/a2a/queue/:agentId` poll loop |
| `DefaultPushNotificationSender`, `PushNotificationStore` | Webhook delivery — kills polling in `src/wrapper/daemon.ts` |
| `ClientFactory`, `Client`, `JsonRpcTransport` (`/client`) | Hand-rolled HTTP in `daemon.ts` + `scripts/ask-agent.mjs` |
| `AgentCardResolver`, `createFromAgentCardUrl` | Peer discovery from a card URL instead of hub registration |
| `createAuthenticatingFetchWithRetry`, `AuthenticationHandler`, card `securitySchemes` | The **`X-Agent-Key` is never validated** debt |
| A2A `TaskState` terminal states (`completed`/`failed`/`input-required`) | The **DONE sentinel leak** — this *is* the "structured end-flag v2 fix" already noted in SUMMARY |

## Known debt → upstream fix

Four of the six open items in `SUMMARY.md` § Known Issues are solved by adopting the spec:

1. **DONE sentinel leaks** → `TaskState` terminal status. Deterministic, not string-matching.
2. **`X-Agent-Key` never validated** → card `securitySchemes` + `AuthenticationHandler`.
3. **Two daemons claim one peer name and race** → task `contextId` + `TaskStore` ownership;
   the SDK's result manager is the single writer, so cross-process dedupe stops being per-process.
4. **`agents.register` duplicates rows** → agent cards are resolved from a URL, not registered
   into a table. Registration becomes optional.

## Sibling repos worth pulling in

| Repo | Lang | ★ | Use |
|---|---|---|---|
| `a2a-inspector` | TS | 458 | Point it at the hub — validates agent card + protocol compliance. Immediate signal on how far off we are. |
| `a2a-tck` | Python | 44 | Technology Compatibility Kit — conformance suite. Turn compliance into a CI gate. |
| `a2a-samples` | Jupyter/multi | 1709 | Reference servers/clients + framework integrations (LangGraph, CrewAI, Semantic Kernel). |
| `a2a-itk` | Python | 4 | Integration Testing Kit for SDKs. |
| `A2A` (spec repo) | — | 25.1k | JSON schema for the protocol types — usable as a validation fixture. |
| `a2a-gateway` | — | 0 | Hooks A2A agents to other comms channels. Overlaps our mailbox idea. |

## What A2A does *not* give us — still ours to build

A2A is transport + task lifecycle + discovery. The hub's actual value is everything above that line:

- `src/classifier.ts` — root-cause classification
- `src/memory.ts` + `convex/experiences.ts` — persistent cross-session memory
- `src/repo-fixer.ts`, `src/wrapper/repo-reply.ts` — repo-resident peers with citations
- `src/escalation.ts`, personas, the chat client
- Sessions (named, multi-peer, extendable) — **not** an A2A primitive. A2A has `contextId`
  grouping tasks; rename/extend/list stay hub-specific admin routes outside the A2A surface.

Per the docs, A2A and MCP are complementary, not competing: MCP = agent→tools,
A2A = agent→agent. Our MCP servers (GitNexus, open-brain, context-mode) are unaffected.

## Measured baseline (2026-07-30, hub live on :4000, Convex 7ms)

Ran `scripts/a2a-compliance-probe.mjs` against the running stack. **PASS 2 / FAIL 4 / WARN 2.**

| # | Check | Result |
|---|---|---|
| 1 | `/.well-known/agent-card.json` serves, all 9 required fields present | **PASS** |
| 2 | `preferredTransport` absent → every client assumes `JSONRPC` | WARN |
| 2 | `card.url` host is `sandbox.tarrantcountymakerspace.com` — the wiped VPS, not this hub | WARN |
| 3 | `POST /a2a` with a JSON-RPC `message/send` → **HTTP 404 `Cannot POST /a2a`** | **FAIL** |
| 4 | `capabilities.streaming: true` but `message/stream` → 404 text/html | **FAIL** |
| 5 | Bogus `X-Agent-Key` → **HTTP 200** on a guarded route | **FAIL** |
| 6 | Stock `ClientFactory` + `JsonRpcTransportFactory` client → 404 on `message/send` | **FAIL** |

The card is *structurally* valid — it type-checks against the SDK's `AgentCard` and has every
required field. What it isn't is *true*. It advertises a JSON-RPC endpoint that 404s, streaming
that doesn't exist, and an auth scheme that returns 200 for a bogus key. A stock A2A client
cannot exchange a single message with this hub today. That is the baseline.

Worth separating two things: the transport gap (#3, #4, #6 are all one root cause — no JSON-RPC
handler is mounted) and the honesty gap (the card asserts capabilities nothing implements).
The honesty gap is nearly free to close and is arguably the more urgent of the two, because a
card that lies is worse than one that admits a narrow surface — a peer that trusts it fails
confusingly rather than cleanly.

## Recommended sequencing

1. **Measure first** — run `a2a-inspector` against the running hub. Get a compliance baseline
   before changing anything. Cheap, zero risk.
2. **Client side first** — swap `daemon.ts` + `ask-agent.mjs` to `ClientFactory`. Lowest blast
   radius; the hub keeps its current routes while we learn the SDK.
3. **`ConvexTaskStore`** — implement `TaskStore` over the existing Convex tables (2 methods).
4. **Mount `jsonRpcHandler`** alongside the legacy `/a2a/*` routes. Dual-stack, not a cutover.
5. **Port `executor.ts` → `AgentExecutor`**, publish real `TaskState` events. DONE sentinel dies here.
6. **`a2a-tck` in CI**, then retire the legacy routes.

Steps 1–2 are reversible and answer "is this worth it" before any hub surgery.

## Progress — steps 1 & 2 done (v1.7.0, 2026-07-31)

Re-probed against the live stack: **PASS 3 / FAIL 2 / WARN 2** (from 2 / 4 / 2).

- Card honesty fixed — `streaming` claim dropped, `url` points at this process, `protocolVersion` matches the SDK. The streaming FAIL is gone because the claim is gone, not because SSE appeared.
- `X-Agent-Key` now validated against the stored hash; one prefix middleware replaced eleven pasted checks. `AUTH_MODE=warn` by default.
- **Measured:** 20s of live daemon polling produced zero rejections, and all three daemons showed `lastSeen` < 1s — so they are passing auth, not idle. `AUTH_MODE=strict` looks safe for the current stack.
- Test 3 moved 404 → 401, which is the middleware proving it runs on the `/a2a` prefix.

### Step 3 done too — PASS 6 / FAIL 0 / WARN 1

`jsonRpcHandler` mounted at `/a2a/jsonrpc`; card points there; `HubAgentExecutor` +
`ConvexTaskStore` behind it. A stock SDK client sends a message and gets a spec `Task` back.
`message/stream` returns `text/event-stream` with `submitted → working → completed`.
Legacy `/a2a/*` untouched — all three daemons kept heartbeating across the switch.

The one remaining WARN is `AUTH_MODE=warn` behaving as designed.

Two things worth carrying forward:

- The SDK **enforced our own card's** `streaming: false`, refusing `message/stream` with
  `-32004` until the capability was honestly declared. Card honesty is load-bearing, not
  cosmetic — the runtime reads it.
- `tasks/get` returns `history: []` even though the streamed initial task carries the user
  message. The `ResultManager` appears to own history and to discard what the executor
  publishes. Not a compliance failure and not investigated further; worth knowing before
  anything depends on task history.

Both former failures had the same root cause — no JSON-RPC handler mounted — and both
cleared together. Aaron's answers scoped that step: interop with third-party agents is a real
goal (so compliance is worth paying for), topology stays undecided pending use cases, and the
session model is deferred until `contextId` has been exercised.

**Correction to the topology framing above:** Aaron leans "hub is one A2A server, peers are
clients," but also wants the hub to call out to a peer with better memory when it can't answer.
That second half is a client role, so the end state is the broker — reached from use cases
rather than chosen up front. It does not need deciding yet: delegation can ride the existing
queue and only becomes an A2A client call when a peer is genuinely external.

Worth recording: "answers from accumulated memory, delegates when it can't" is A2A task
delegation almost verbatim. The spec has a primitive for the thing the hub already wants to be.

## Aside: "what does gitnexus have to do with A2A-Hub?"

Nothing. Two unrelated things share a name, which is worth writing down because the collision
is genuinely confusing:

- **GitNexus the MCP server** — code-intelligence tooling this repo happens to be indexed in.
  Build-time only; no hub runtime involvement.
- **`gitnexus` the hub peer** — an arbitrary `--name` string. `grep` finds it in `src/` only
  inside doc comments, as the example argument on `daemon.ts:14`. It is a generic repo peer
  that was pointed at the GitNexus checkout because that was a convenient test codebase.

Renaming the example peer in those comments (say, to `acme-repo`) would cost nothing and
remove the collision.

## Caveats

- Impact analysis not yet run. `src/index.ts` and `src/executor.ts` are high-fan-in;
  per project rules, run `impact({target, direction:"upstream"})` before editing either.
- I read the SDK's `.d.ts` surface, not its runtime behaviour. Version pin is `"latest"` in
  `package.json` — resolve that to an exact version before depending on this API shape.
- Route *bodies* in `src/index.ts` were not read in detail; the mapping above is by route
  name and SDK capability, so per-route semantics need checking during step 4.
