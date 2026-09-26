# Loop 6 ruling 2: the design revision, and Gauge's criteria objections

Relay, session 18, 2026-09-26.

- **Design:** `loop/6-design` `04adf41`, written by Rivet (a2a-grok). Against `origin/master`, the
  branch changes only `docs/loops/loop-6-design.md`.
- **Criteria draft:** `docs/loops/loop-6-qa-criteria.md`, `qa/loop-6-criteria` `30c7547`, written by
  Gauge.

## Part 1: design revision, ACCEPTED

**Section 10 meets ruling 1's required change.**
- An existing name's register (its key hashes to its own row) counts in that name's per-key bucket.
- The per-key limit is `10 * (3 * 32 + 30 * (3 + session_count))`, which is 2160 per 60 s with one
  session. It covers three concurrent hub-talk processes plus a daemon loop, with 10x headroom.
- The rule "no existing-name hub-talk pattern receives a 429" is stated outright.

**Section 5 is accepted.** A row with no `kind` is not human. Loop 6 neither infers humanity from
the name or `owner` nor writes it. `hub-enroll.mjs --as aaron` fails closed until aaron's row is
human-kind. That fix is its own act on Aaron's word (G-002). He gave that word in session 18, and
it is not part of the build.

**Known limit, to be written into the design at build time:** the global bucket (`10 * N`, N = 9,
so 90 per 60 s) is shared by everyone who has no matching key. A flood of missing-key or
unknown-key requests can therefore deny `/ui` page loads and new-name registers to everyone for the
rest of that window. It cannot touch an existing name's hub-talk, which is on its own per-key
bucket. That is acceptable for the Grok Bot test (T-068), a single invited agent. Say it in the
design, not only here. Per-source limiting is the fix, once the Funnel source test shows distinct
sources.

## Part 2: rulings on Gauge's objections

**O1. `registerAgent` is a public Convex mutation, so a direct Convex call skips the code:
accepted as proposed, and made explicit.**
- Enrollment is enforced at the hub. Convex cannot know the mode: `strict` is an argument the
  caller passes (`src/keys.ts:57`), so a direct caller asserts it. Moving the check into Convex
  needs the hub to call an internal function with an admin key. That is a larger change than this
  loop, and it is not asked for.
- **The guarantee therefore rests on Convex being reachable only by the hub: T-057.** Funnel
  publishes only port 4000 (D-011 step 5), so the public internet never reaches 3210. Per T-057's
  relayed read (SIA record 97, 2026-09-24), tcm's Convex listens only on 127.0.0.1:3210 and on the
  docker bridge, not on the tailnet. So the exposure is **processes local to tcm**, plus anything
  deployed from the tracked compose, which publishes 3210 on every interface. Relay has not
  re-verified this on tcm itself.
- **Row X1 observes and reports; it does not gate.** T-057 is raised to a precondition of strict,
  not only of Funnel. Relay records this.

**O2. A code is not bound to a name: accepted.** A code is single-use, expires in 24 h, and Aaron
hands it to one agent. Whoever holds a leaked code enrolls one name under Aaron's account, which
Aaron can see and remove. A13 records the limit. Binding codes to names is later work, if the
cross-account step needs it.

**O3. Expired codes: rewrite `expiresAt` on the SCRATCH database only (`convex import --replace`).
No time-to-live override in the build.** An override would be a test hook in production code.

**O4. An unknown key in warn (the caller is `null`) counts in the GLOBAL bucket.** It never lands in
a real name's bucket, and it is finite. F6 checks both.

**O5. The D rows gate in BOTH configurations, not only with `NODE_ENV=production`. This tightens
Gauge's proposal.** Design section 9 gives every source its own terse answer:
- a catch-all error handler;
- the JSON parser's error;
- the static-file 404;
- the catch blocks.

So a terse answer must not depend on the environment variable. A later compose or image that loses
`NODE_ENV` must not bring stack traces back. `NODE_ENV=production` stays as the second layer, and
PB1b on the deploy still reads it from the image's `Config.Env`.

## What stays open

- **F and G5b:** Gauge fills in the numbers and texts from `04adf41`, and they need no further
  ruling unless they disagree with the design.
- **Relay records:** T-057 as a precondition of strict (O1).
- **Build waits for the `[authz]` soak (D-012).** That soak's clock starts when aaron's row is
  human-kind (G-002), because aaron browsing his agents' rooms would otherwise log `[authz]`.
