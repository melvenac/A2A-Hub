# Loop 4 ruling 1: design approved to build

Relay, session 17, 2026-09-24. On Rivet's design `docs/loops/loop-4-ui-on-tcm-design.md` (branch
`loop/4-ui` in the Rivet worktree, uncommitted at the time of reading, 172 lines, read in full).
Brief: `docs/loops/loop-4-ui-on-tcm-brief.md` (docs/session-17, 0d50771).

## What Relay checked, at cef7517

- The `/a2a` key guard is a prefix mount (`src/index.ts:119`), so `/ui` is outside it and the page
  loads without a key.
- `whoami` returns `{ name: req.agentName ?? null }` (`src/keys.ts:123-125`).
- `/a2a/agents/live` keeps rows with `lastSeen` inside `INSTANCE_LIVENESS_MS` = 45 000 ms
  (`src/index.ts:295-337`, `convex/instanceLogic.ts:6`). `listOnline` drops `kind: "human"`
  (`convex/agents.ts:394`).
- `.dockerignore`'s patterns (`node_modules`, `dist`) match only the root of the context, so
  `client/node_modules` would be copied into the image. The added lines are needed.

## Ruling: approved to build, with Q1–Q4 as recommended

- **Q1: yes.** The hands-off agent-to-agent demo (`startDemo`, `App.svelte:143-173`) goes. It can
  only work by posting as someone other than the key's owner, which the brief rules out.
- **Q2: live agents only.** Preserve 3 (no Convex change) outranks a fuller list. **Binding
  addition, R-L:** the panel says plainly that it lists only agents seen in the last 45 s. Existing
  sessions stay listed and joinable whoever is live.
  - The reason is what tcm looks like. SIA's seats talk through `hub-talk`, which heartbeats at
    start (`scripts/hub-talk.mjs:369-372`) and on every poll of `--wait` (`:470`). So a seat is
    live while it runs, and drops off 45 s after its turn ends if it ends without a `--wait`. The
    list is a snapshot, and a seat between turns will be missing from it. The page's main use on
    tcm is reading and joining existing rooms, which does not depend on liveness.
  - Relay's draft of this ruling said SIA's seats "may never count as live". That was asserted
    without reading `hub-talk.mjs`, and was corrected before this ruling went out.
  - A list of every registered agent is a follow-up task, not this loop.
- **Q3: `/ui/` only; `GET /` stays 404.** The URL to open is `http://100.124.212.87:4000/ui/`.
- **Q4: send nothing without a key.** Condition B's "shows the 401 state" is met by the
  key-needed state and no `/a2a` request. That is a clarification of the wording, not a widening:
  the condition's purpose (nothing sent without a key) is kept, and made stricter.

## Criterion wording, for Gauge

- B's "the new-chat choices are exactly the hub's agents" means **exactly `GET /a2a/agents/live`,
  minus `me` and `hub`**, at the moment the panel loads or is refreshed.
- R-L gets a row: the 45 s text is visible in the panel, and with no live agents the panel says so
  while the session list still loads.

## Unchanged

Everything else in the brief stands: preserve 1–6, conditions A–E, the fold-into-cutover rule
(only if accepted before SIA names the window, and `git diff cef7517 -- convex/` is empty), and
the rule that merging, tagging, the deploy, and `aaron`'s init on tcm each need Aaron's word.
