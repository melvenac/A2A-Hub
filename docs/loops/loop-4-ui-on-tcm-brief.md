# Loop 4 brief: the chat UI served by tcm's hub (T-061)

Relay, session 17, 2026-09-24. Asked for by Aaron, same session: "Let's get the ui on tcm next
build. Can we prep that now?" Target version **v1.10.0** (a feature, so a minor bump).

## Why

The chat client (`client/`, Svelte + Vite) runs only as a dev server on `localhost:5173`, and it
points at the local hub (`client/src/App.svelte:7`). tcm's hub serves only the API. The
Dockerfile builds `src/` and `convex/` and nothing from `client/`. So Aaron has no way to read or
join tcm's rooms from a browser.

`https://hub.tarrantcountymakerspace.com` is **not** this. Aaron has said it is reserved for the
public hub (T-002). It is not tcm's address for testing or for local A2A traffic.

## Objective

**Opening one URL on tcm's tailnet address, `http://100.124.212.87:4000/...`, loads the chat
client from tcm's hub, and it talks to that same hub as the human peer `aaron`.** It must work
with no dev server, no second container, no new port, and no hub address typed by hand.

**Repair bundled: the client assumes the local stack's cast.** Line numbers are at `cef7517`,
read by Relay. Design §12 cited the seed post as `:149`; it is `:162`.
- The seed post is sent `from: "alice"` (`client/src/App.svelte:162`). Under `aaron`'s key on
  tcm, that puts a false sender into live rooms.
- New chats hard-code `alice` and `bob` as participants (`:153`, and the buttons at `:285` and
  `:287`). Neither runs on tcm.

After the repair, the page posts only as the name its key belongs to, and the peers it offers for a
new chat come from the hub it is talking to, not from hard-coded names. The design picks the source
(for example `/a2a/agents/live`).

## Scope

- **One artifact, one deploy.** The built client ships inside the hub image, and the hub serves
  it. The mechanism (static route, path, build stage) is Rivet's decision. The design must state
  the exact URL.
- **Same origin.** When the hub serves the page, the page's default hub is its own origin. The
  dev server (`npm run dev`, :5173) keeps working against `127.0.0.1:4000` as today.
- **`aaron` on tcm.** Design §12's H1–H4 are already in v1.9.0. On tcm the key is made by
  `hub-key.mjs init --as aaron --kind human` against `http://100.124.212.87:4000`, with the key
  file under that hub's key directory, and `copy` puts it on the clipboard. **That init is a live
  write to tcm, done on Aaron's word at its own step, after the v1.9.0 cutover's deploy act.**
  The browser name `aaron` is already Aaron's ruling (session 16).
- **CHANGELOG entry under v1.10.0; README says how to open the page on tcm and how to load the
  key.**

## Must still hold (preserve)

1. **Every API route is unchanged in response and status**, including `/health`,
   `/.well-known/agent-card.json` and every `/a2a/*` route. A path the page claims must not shadow
   one of them, now or by prefix.
2. **`scripts/hub-talk.mjs` is untouched.** Its contract is SIA's (D-003), so no change here.
3. **No Convex function changes** (`convex/` identical to `cef7517`, except `_generated` if
   codegen demands it, and then shown to be content-identical). This is what lets the deploy
   below fold into the cutover.
4. **The hub image still starts with the same command and listens only on 4000.** Nothing new
   is published on tcm, and the tracked `docker-compose.yml` Traefik labels and hostname are
   untouched (T-057 owns the compose change).
5. **CORS is unchanged**, and the dev-server path still works.
6. **No key is ever printed, logged, committed, or embedded in the built page.** The page starts
   without a key, and a request without a key gets the 401 it gets today.

## Out of scope

HTTPS, public exposure and the public hostname (T-002); PWA (T-029); session delete and bookmarks
(T-028); T-058's general class (`from` asserted by callers) beyond the one seed-post repair;
T-057.

## Acceptance (Gauge writes the criteria; these are the conditions)

- A. A fresh image of the candidate, run against a scratch Convex, serves the page at the stated
  URL. The page loads with no network call to any other origin. Its default hub is that origin.
- B. With a scratch `aaron` key pasted in, the page lists sessions, opens a room, posts, and the
  post's sender is `aaron`, including the first (seed) post of a new chat. The new-chat choices are
  exactly the hub's agents, and no hard-coded `alice` or `bob` remains in `client/src` (checked by a
  search validated on `cef7517`, where it hits). Without a key it shows the 401 state and sends
  nothing else.
- C. Preserve 1: the old and the new hub return identical status and body on every API route
  (the same skew-style comparison Loop 1 and Loop 3 used). Preserve 3: `git diff cef7517 --
  convex/` is empty, or its only content is shown equal.
- D. Preserve 6: a search of the built bundle and the image for key material finds none. The
  search is validated on a planted positive first.
- E. The dev server path still loads and talks to a local hub.

## Sequencing and authority

- **Design and build start now**, in Rivet's worktree, never in `~/Projects/A2A-Hub` (D-008,
  R2). QA runs in the QA tree. The SIA hold rules apply as in the handoff: a B Step 0 call from
  the SIA planner stops everything.
- **Deploy: the next tcm build.** That is the v1.9.0 cutover's deploy act (design §4.2). **If
  Loop 4 is accepted before SIA names the window, and preserve 3 holds, the deploy act ships
  v1.10.0 instead of v1.9.0.** The Convex push is then identical to v1.9.0's, so the cutover's
  checks still apply. It needs Aaron's word at that time. Otherwise v1.10.0 is the next deploy
  after the cutover. The cutover never waits for Loop 4.
- Merging, tagging, the deploy, and the `aaron` init on tcm each need Aaron's word for that act.
