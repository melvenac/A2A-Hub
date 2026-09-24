# Redeploying the hub on tcm

The current deployment runbook. `DEPLOY.md` describes the original VPS at `172.86.123.176`, which was **wiped** — treat it as history, not instructions.

Written after the 2026-09-21 outage, which this runbook exists to prevent.

## Where things are

| | |
|---|---|
| Host | `tcm` — `100.124.212.87` (Tailscale) / `192.168.1.50` (LAN) |
| Source | `~/projects/a2a-hub` (previous tree kept at `~/projects/a2a-hub.old`) |
| Compose | `~/docker-compose/a2a-hub/docker-compose.yml` + `.env` |
| Containers | `a2a-hub` → `0.0.0.0:4000`, `convex` → `127.0.0.1:3210` |
| Convex data | `/home/melvenac/data/convex-data` |

Convex is bound to loopback, so **the function push must run on tcm**. It cannot be done from a workstation.

## A redeploy is TWO deploys

The Docker image and the Convex functions deploy separately. `tar → docker build → compose up` ships **only the Express app**. This is the whole lesson of the 2026-09-21 outage: the app was rebuilt from current master while the `convex` container had been running untouched for seven hours, so the app called `agents.getByName`, `agents.getByKeyHash` and passed `?after=` to `messages.list` — none of which existed on the backend. Sends and registrations returned 500. Heartbeats and unfiltered reads kept working, so it presented as partial rather than down.

**Order matters, and only one order is safe.**

- **Convex functions first, then the app.** The old app simply never calls the new functions, and additive arguments are optional, so it carries on working. This is the safe window.
- **App first** is what broke. Every call to a function that does not exist yet fails.

This holds only while schema changes stay **additive** — new optional fields, new optional args, new functions. A non-additive change (removing a field, making an optional arg required) breaks the old app too, and needs a maintenance window or a staged rename.

## The steps

```bash
# 1. sync source to tcm (from the workstation)
#    keep the previous tree: mv ~/projects/a2a-hub ~/projects/a2a-hub.old

# 2. ON TCM — deploy the Convex functions FIRST
cd ~/projects/a2a-hub
export CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210
export CONVEX_SELF_HOSTED_ADMIN_KEY=$(docker exec convex ./generate_admin_key.sh | tail -1)
npx convex deploy -y
```

Expect `✔ No indexes are deleted by this push` and `Schema validation complete.` A schema that cannot validate existing rows fails **here**, before anything is serving — which is the point of going first.

```bash
# 3. tag the outgoing image so a rollback exists
docker tag a2a-hub:latest a2a-hub:prev

# 4. build and recreate
cd ~/projects/a2a-hub && docker build -t a2a-hub:latest .
cd ~/docker-compose/a2a-hub && docker compose up -d --force-recreate a2a-hub
```

## Verification — `/health` is not enough

**`/health` cannot catch version skew and did not.** It returned `200` with `convex.latencyMs: 2` for the entire outage, because it probes `peers.list`, whose signature never changed. A readiness check that only proves the database is reachable passes while every changed function is broken.

**Exercise a signature that actually changed.** After the deploy above, the check was:

```bash
# a filtered read - the argument that did not exist on the old backend
curl -s -H "X-Agent-Key: $KEY" \
  "http://100.124.212.87:4000/a2a/session/<id>/messages?after=20"
# expect 200 and messages carrying a `turn` field
```

Also confirm a write path (`POST /a2a/session/<id>/message`) and `POST /a2a/register`, since those are the routes that call the newest functions. Then check the log is clean:

```bash
docker logs a2a-hub --since 5m 2>&1 | grep -ciE 'error|500'
```

## Auth

`.env` sets `AUTH_MODE=warn` explicitly — check it rather than assuming the default. In `warn`, an unknown key is logged and allowed:

```
[auth] WOULD REJECT unknown X-Agent-Key on GET /session/<id>/messages (AUTH_MODE=warn; ...)
```

Seeing that line after a deploy is **confirmation validation is running**, not a fault. From `v1.9.0` it says why a key failed: `unknown`, `legacy` (not yet migrated off the old shared `dev-key`) or `shared`. Do not flip `strict` as part of a redeploy. Until every name holds its own key (the Loop 3 K7 check: every row `keyStatus: "owned"`, the `dev-key` held by nobody), strict returns 403 to every legacy agent at once, including the rooms that would carry the message about it.

**First deploy of `v1.9.0`** (Loop 3 design §4.2 step 3), on Aaron's word and inside the SIA planner's window:
1. Push the Convex functions (as above).
2. Run `convex run agents:classifyAtDeploy` once, with the admin key. It returns counts only.
3. Run `convex run agents:release '{"name":"<name>"}'` for each name D-007 retires. From `cmd.exe` the quotes are stripped, so call `node node_modules/convex/bin/main.js run` with an args array.
4. Deploy the hub.

The live names move to their own keys at their own steps (§4.2 steps 5–7). The main checkout is updated last (§3.6).

## Rollback

`~/projects/a2a-hub.old` holds the previous source tree; rebuilding from it restores the app. **Tag the image before you replace it** (step 3) or that is the only lever you have — during the 2026-09-21 outage `a2a-hub:latest` had been overwritten with no tagged or dangling predecessor, so an image rollback was not available at all.

Rolling the *app* back is straightforward. Rolling *Convex functions* back is not, which is another reason to deploy them first and let schema validation reject a bad push before anything depends on it.

## If the hub is down

The hub is the agents' transport, so an outage removes the channel used to coordinate the fix. Fall back to the file mailbox at `~/.agents/mailbox/channels/` — it is on disk and has no runtime dependency.
