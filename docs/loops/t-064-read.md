# T-064: tcm's [auth] log read after the T-003 cutover

Relay, session 18. Read 2026-09-26 ~00:50Z with the read-only key (V-007, item `auth-log`), about
20.6 hours after the 04:14:10Z container start. Recorded 00:52Z. The read was taken
early, not at ~04:30Z, on Aaron's information (session 18): the only non-Claude-Code agent on the
hub is grokbot. The Claude Code seats talk through Claude Code's built-in cross-session messages,
not the hub. grokbot's watcher runs 5 times a day, so the window holds several of its runs.

## Verdict: clean

- **Every `WOULD REJECT` line falls between 04:20:44Z and 04:20:51Z.** That is atlas partway
  through the cutover, using its legacy key before `MIGRATE atlas` at 04:22:59Z. None comes after
  that.
- **After 04:27:26Z there are no `[auth]` lines at all.** 04:27:26Z is Gauge's keyless T-062 probe.
  The whole container log is 19 lines.
- **Silence here means traffic on owned keys, not no traffic.** grokbot and melve-76 were created
  and exchanged 27+ turns after 04:27Z (T-068's note; case study
  `docs/case-studies/2026-09-25-grokbot-marketplace-watcher.md`). A request on an agent's own key
  writes no `[auth]` line. The positive side is shown by the 04:20Z lines: the instrument caught
  legacy use when it happened.
- **agents-summary (same read):** 8 rows, all `keyStatus=owned`. K7 PASS: oneRowPerName,
  oneNamePerHash, allOwned, devKeyHeldByNone, unparsableZero. Rows: aaron, atlas, cursor-grok,
  grok, grok-probe, grokbot, melve-76, relay. Hash prefixes are omitted here.
- **Limits:** rotation is `unknown` because listing `.1` needs root. With 19 lines against a 10 MB
  rotation size, rotation is not plausible. This read covers `[auth]` only; `[authz]` exists only
  after the Loop 5 deploy, and its soak is the next check (D-012).

## `auth-log` output, verbatim

```
auth-lines=14 first=2026-09-25T04:14:11.315401725Z last=2026-09-25T04:27:26.426818761Z total-lines=19
log-driver=json-file map[max-file:3 max-size:10m] started=2026-09-25T04:14:10.796854849Z first-line-within-60s-of-start=yes rotated=unknown(listing .1 needs root)
2026-09-25T04:20:07.219031232Z [auth] MIGRATE relay: legacy row replaced by a fresh owned row
2026-09-25T04:20:44.671862897Z [auth] WOULD REJECT legacy key on register atlas (AUTH_MODE=warn; migrate with hub-talk --init-key)
2026-09-25T04:20:44.752485421Z [auth] WOULD REJECT shared X-Agent-Key on POST /heartbeat/atlas (AUTH_MODE=warn; set AUTH_MODE=strict to enforce)
2026-09-25T04:20:44.802828512Z [auth] WOULD REJECT shared X-Agent-Key on POST /heartbeat/atlas (AUTH_MODE=warn; set AUTH_MODE=strict to enforce)
2026-09-25T04:20:44.867046428Z [auth] WOULD REJECT shared X-Agent-Key on GET <masked> (AUTH_MODE=warn; set AUTH_MODE=strict to enforce)
2026-09-25T04:20:44.896295766Z [auth] WOULD REJECT shared X-Agent-Key on POST <masked> (AUTH_MODE=warn; set AUTH_MODE=strict to enforce)
2026-09-25T04:20:44.896875184Z [auth] WOULD REJECT reader atlas for caller unknown on POST /read (AUTH_MODE=warn; set AUTH_MODE=strict to enforce)
2026-09-25T04:20:44.934905262Z [auth] WOULD REJECT shared X-Agent-Key on GET <masked> (AUTH_MODE=warn; set AUTH_MODE=strict to enforce)
2026-09-25T04:20:51.058150172Z [auth] WOULD REJECT legacy key on register atlas (AUTH_MODE=warn; migrate with hub-talk --init-key)
2026-09-25T04:20:51.161170377Z [auth] WOULD REJECT shared X-Agent-Key on POST /heartbeat/atlas (AUTH_MODE=warn; set AUTH_MODE=strict to enforce)
2026-09-25T04:20:51.215597063Z [auth] WOULD REJECT shared X-Agent-Key on POST /heartbeat/atlas (AUTH_MODE=warn; set AUTH_MODE=strict to enforce)
2026-09-25T04:20:51.272738151Z [auth] WOULD REJECT shared X-Agent-Key on POST <masked> (AUTH_MODE=warn; set AUTH_MODE=strict to enforce)
2026-09-25T04:22:59.441289972Z [auth] MIGRATE atlas: legacy row replaced by a fresh owned row
2026-09-25T04:23:05.511947341Z [auth] MIGRATE grok: legacy row replaced by a fresh owned row
```
