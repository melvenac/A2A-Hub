# Research: Buzz — a Nostr-native workspace where humans and agents share rooms

Date: 2026-08-07 · Session 13 · Sources: Linux Unplugged 677 (youtube `kJWrEuuS96U`), github.com/block/buzz @ `f53bbd115`

**Status: parked.** Aaron's call at end of Session 13 — "I will look at Buzz another day."
Nothing here has been adopted, rejected, or scheduled. This note exists so the evaluation
doesn't start from zero next time.

## Why this was looked at

A2A-Hub is a central coordination server for agent-to-agent communication. Buzz solves a
neighbouring problem with a materially different substrate, so it's a live design comparison
rather than a tool to install.

## Headline finding

Buzz has **no bot API**, and that is the whole architectural bet.

Every message, reaction, workflow step, review approval, and git event is a signed Nostr
event in one log — same shape, same identity model, same audit trail, whether the author is
a person or a process. Agents don't get a bolted-on integration surface; they get a keypair
and the same affordances as a human member.

Contrast with the hub's current model: a central API with registered peers, where
`X-Agent-Key` is presence-checked but never validated (PRD §8.1, still open). Buzz's
answer to "who is this actor and did they really say this" is a per-actor signature on
every event, verifiable by anyone, with no server to trust.

## Architecture

- **Wire protocol is NIP-01.** Six fields — `id`, `pubkey`, `kind`, `tags`, `content`,
  `sig` — over WebSocket, with subscription queries. Buzz layers 80+ custom event kinds on
  top. Adding a feature means allocating a `kind` integer, not versioning an API.
- **Identity is an npub/nsec keypair per actor.** Portable across apps (Chris reused his
  existing Nostr identity to sign in), cheap to mint for a new agent, and cryptographically
  attributable after the fact. Scoping is by identity and channel membership, not permission
  flags — "the same way you'd scope a teammate."
- **One relay per community, self-hostable.** Not the multi-relay Nostr norm. The relay also
  runs webhooks, cron/scheduled jobs, and git — it is not a vanilla Nostr relay.
- **Git on object storage.** S3-backed content-addressed packs plus a manifest JSON; no
  database holds git objects. A git credential helper signs a NIP-98-style Nostr event
  instead of supplying a password — that *is* the entire auth layer, no SSH keys, tokens,
  or OAuth. Standard smart-HTTP, so git itself is unaware. A push emits kind 3618 into the
  channel; patches/PRs/issues are Nostr events, making the channel timeline the code-review
  surface.
- **Shared compute mesh.** Members opt a GPU into a community pool; nodes publish a
  bookmark-set event tagged `buzz mesh status`, consumers query the relay and get a local
  OpenAI-compatible proxy endpoint. No API keys, no cloud bill.

## The integration lesson (most transferable part)

The show's hosts tried to bring an *existing* agent runtime (Hermes) into Buzz. What failed
and what worked is the useful signal:

| Approach | Result |
|---|---|
| ACP harness (Buzz launches Claude Code / Codex / open code) | works, but less useful than alternatives |
| Hosted-relay webhooks | never fired (cron did) — possibly disabled on hosted |
| **Sidecar bridge** | **worked** |

The bridge: a small service holding the bot's `nsec`, WebSocket to the relay, filter for
mentions, forward over HTTP to the agent runtime, then sign and publish the reply back as a
Nostr event. The runtime then treats Buzz as just another platform, identical to Telegram.

**No SDK was needed.** If an agent can speak the protocol, it is a first-class member. That
is the property A2A-Hub's own peer model does not currently have — peers are clients of the
hub, not participants in a shared log.

## Repo shape (cloned to `C:\Users\melve\Projects\buzz`)

Rust workspace, 29 crates, 2,177 commits, extremely active (commits landing during the
recording; latest at clone time was same-day). Desktop app is Tauri + React (~1,800 TS
files); separate mobile (Flutter), web, and admin-web packages.

Crates that map onto the above: `buzz-relay`, `buzz-relay-mesh`, `buzz-core`, `buzz-sdk`,
`buzz-agent`, `buzz-acp`, `buzz-persona`, `buzz-workflow`, `buzz-auth`, `buzz-audit`,
`buzz-conformance`, `git-credential-nostr`, `git-sign-nostr`.

Docs worth reading first, in order: `NOSTR.md` (event-kind catalog), `ARCHITECTURE.md`,
`VISION_AGENT.md` + `VISION_REMOTE_AGENTS.md` (closest to this project's problem space),
`docs/remote-agents.md` + `docs/bridge-channel-window.md` (the sidecar pattern, documented),
`docs/git-on-object-storage.md`.

Note the repo ships its own `CLAUDE.md` and `AGENTS.md`, which will **not** auto-load —
it's outside this project's working directory.

## What was NOT determined

- Whether any of this should influence A2A-Hub's design. Not discussed.
- Whether to run a relay at all. Attempted, blocked (see below), then parked.
- How Nostr's signed-event model would interact with the hub's existing Convex persistence.

## Deployment reality (learned the hard way)

Running a relay locally on Aaron's Windows box is **not viable**:

- No SQLite or in-memory fallback exists anywhere in the workspace. `crates/buzz-relay`
  builds a `deadpool_redis` pool and a `PubSubManager` at startup; config demands Postgres,
  Redis, and S3. The README's "minimal mode can simplify this later" confirms it isn't
  available yet.
- Docker is not installed; WSL's optional component is not enabled; Hermit (`bin/activate-hermit`)
  is bash-only and does not support native Windows. So the documented `just setup && just dev`
  path cannot run here at all.
- Rust 1.97.1 and pnpm 10.12.4 are fine; Node is v22.9.0 against a stated Node 24+ requirement
  (matters only for the desktop app, not the relay).

The viable path is `deploy/compose/` on a VPS — five prebuilt images
(`ghcr.io/block/buzz:main`, postgres:17-alpine, redis:7-alpine, minio + minio-init),
**nothing compiles on the server**. `run.sh` provides `start/restart/pull/upgrade/logs/
config/status/backup-hint` plus `add-member/remove-member/list-members` for closed-relay
membership. Note Typesense appears in the dev `.env.example` but is **not** in the VPS bundle.

Caveat for Aaron's VPS specifically: `compose.caddy.yml` binds `:80`/`:443` and uses
`ports: !reset []` to remove the relay's direct port when Caddy terminates TLS. If the box
already fronts services with Traefik, **don't set `BUZZ_COMPOSE_TLS`** — leave the relay's
`${BUZZ_HTTP_PORT}:3000` exposed on `buzz-net` and attach an existing Traefik router instead.

Secrets that must be generated once and kept stable across restarts:
`BUZZ_RELAY_PRIVATE_KEY` (64 hex), `BUZZ_GIT_HOOK_HMAC_SECRET`, Postgres/Redis/MinIO
passwords. `RELAY_OWNER_PUBKEY` is intentionally *not* `BUZZ_`-prefixed and must be a
64-char hex Nostr pubkey when closed-relay mode is on. `run.sh` refuses to start while any
`CHANGE_ME` remains. `BUZZ_AUTO_MIGRATE=true` is needed to bootstrap a fresh database.

The community URL is baked into `RELAY_URL`, `BUZZ_MEDIA_BASE_URL`, and `BUZZ_CORS_ORIGINS`
— the URL *is* the workspace identity, so changing it later is disruptive. Pick the
subdomain before first start.

`BUZZ_IMAGE` defaults to tracking `:main`; pin to `sha-<7>` or a semver tag if this becomes
anything other than a throwaway.
