# T-065: acceptance criteria (Gauge)

**Date:** 2026-09-25 · **Author:** QA seat (Gauge), session 17 · **Status:** criteria, written before
Rivet's hand-off. Nothing has been run.

**Derived from:**
- T-065's note (record rev 47, `docs/session-17-b` `b63ccec`);
- Relay's added conditions (A2A to Gauge, session 17: exit 2, writes nothing, a `find -newer` marker
  with a positive control, no key or full hash printed, auth-log never truncating silently,
  agents-summary failing closed, authorized_keys line 1 byte-identical);
- Rivet's plan `t065-plan.md` (Rivet's scratchpad, read in full), **plan text only**.

**Authority for tcm access in this run:** Aaron's "set that up on tcm, manual mode is on", via Relay.
Every command that uses the **full** melvenac key is read-only, except the marker and control files
under P2. Each of those is run on Aaron's approval in manual mode.

**Candidate:** the installed state on tcm when Rivet reports it done:
- the script `/home/melvenac/bin/a2a-readonly` and the K7 analyzer, identified by their sha256 read
  on tcm (8-char prefix recorded);
- the `authorized_keys` line.

If either script's hash changes mid-run, the run is void.

---

## Objections to the plan as written (for Rivet and Relay, before build)

- **G1: the plan uses `set -u` only.** `agents-summary` is a pipe (CLI to analyzer). Without
  `pipefail`, a Convex error reaches the analyzer as an empty stream. The analyzer fails closed on 0
  rows, so this may still come out right. But the script's exit status must not depend on that
  alone. **Required:** the item exits non-zero and prints `UNDETERMINED` when the CLI fails (row AF).
- **G2: `auth-log` is `tail -n 200`,** which truncates silently. Relay's change already covers this.
  AL checks it.
- **G3: the admin key must not travel in argv.** If the plan passes it as `--admin-key <k>`, it shows
  up in `/proc/<pid>/cmdline`, which any process on tcm can read while the CLI runs. **Required:** pass
  it in the environment (`CONVEX_SELF_HOSTED_ADMIN_KEY`). S reads the source for this.
- **G4 (optional hardening, not a criterion):** add a `from="100.64.0.0/10"` option (tailnet) to the
  line, so a copied private key is useless off the tailnet. That's Relay's call.

I looked for more objections and found none. The mechanism (`restrict` plus a forced command, exact
`case` dispatch, no passthrough) is the right shape.

## Preconditions

- **P1 key identity.** The client always calls `ssh -i ~/.ssh/tcm-readonly -o IdentitiesOnly=yes
  -o BatchMode=yes`. The fingerprint of `~/.ssh/tcm-readonly.pub` (this PC) equals the fingerprint of
  the key on tcm's added line (read with the full key: `ssh-keygen -lf` on that line only). Only the
  fingerprint is printed.
- **P2 marker and positive control (full key, on Aaron's approval).**
  - Before any N row: `touch ~/.qa-t065-marker`.
  - **Positive control:** after the N rows, `touch /tmp/qa-t065-pos` with the full key. `find ~ /tmp
    -xdev -newer ~/.qa-t065-marker` must list it. That shows W can see a write.
  - Then both files are removed with the full key, and their absence read back.
- **P3 volatile baseline.** Before the marker, one `find` with the same scope (full key) records the
  set of paths that change on their own in about 60 s with nothing running from QA (for example
  docker or runner state). W explains any path it lists against this baseline, or fails.

## Rows

| Row | Required | How |
|---|---|---|
| **S** static | The script's source, read with the full key (`cat`, read-only):<br>- dispatches on `$SSH_ORIGINAL_COMMAND` by exact `case`<br>- no `eval`, `$@`, `$*`, `sh -c`, or unquoted expansion of the original command<br>- `pipefail` (G1), fixed `PATH`, `umask 077`<br>- no redirect to a file other than `/dev/null`<br>- the admin key only in the environment (G3), never echoed<br>- a final output mask<br>The `authorized_keys` line's options are exactly `restrict,command="/home/melvenac/bin/a2a-readonly"`. | read and quote the relevant lines |
| **AK** full key unchanged | `authorized_keys` has 2 lines. Line 1's sha256, computed on tcm, **equals** the backup's line 1, printed as `equal`/`differ` plus 8-char prefixes. `diff` against the backup shows exactly one added line. Mode is 600. A fresh full-key login runs `true`. | full key, read-only |
| **M1** health | Exit 0, and the output parses as JSON with keys `[agent, convex, status]`. | readonly key |
| **M2** auth-mode | Exit 0, and the output is exactly `warn` (K7 at 04:26:54Z read warn). | readonly key |
| **M3** image | Exit 0. The running image is `648ac3963dd7` (12-char). Tags `latest` and `prev` are listed as 12-char IDs. No 64-hex runs. | readonly key |
| **M4** runners | Exit 0, one `active`/`inactive` line per runner, and it agrees with `systemctl is-active` read with the full key. | both keys |
| **AL** auth-log (Relay) | Exit 0. It prints a line count and the first and last timestamps. If it caps output, it says so (`showing N of M`), and M equals the count of `[auth]` lines read with the full key (`docker logs -t a2a-hub 2>&1 \| grep -c '\[auth\]'`). Every 16+ hex run is masked. | both keys |
| **AS** agents-summary | Exit 0. Its lines are the K7 analyzer's: 6 rows, all owned (aaron human, atlas, cursor-grok, grok, grok-probe, relay), no `7e9f8fd1`, one name per hash, PASS. It matches Relay's 04:26:54Z read, unless the table has legitimately changed since, in which case that is reported. | readonly key |
| **AF** agents-summary fails closed (Relay) | Uses the script's own pipeline, run **with the full key**, read-only, with the Convex URL pointed at a dead loopback port (e.g. `127.0.0.1:1`). The output contains `UNDETERMINED` and the exit is non-zero. **Both directions:** the same pipeline with the real URL gives PASS. If the script offers no way to point the URL elsewhere, S's static read of the error path stands in for AF, and the report says AF was **not observed**. | full key, read-only |
| **L** no secrets out | Over the combined output of M1-M4, AL and AS, a scanner finds:<br>- 0 runs of 32+ hex or base64url<br>- 0 `convex-self-hosted` admin-key prefix<br>- 0 `ssh-ed25519 AAAA` / `BEGIN OPENSSH`<br>- 0 64-hex runs<br>**Known positive first:** a local text with one planted run of each class must be flagged four times. | local scan |
| **N** refused | With the readonly key, each of these prints `refused` and gives ssh exit status **2**:<br>`docker ps` · `touch /tmp/qa-t065-x` · `auth-log; id` · `auth-log && id` · `auth-log\|id` · `auth-log` + newline + `id` · `auth-log ` (trailing space) · ` auth-log` · `AUTH-LOG` · `auth-log --all` · `health x` · `$(id)` · `sh` · `bash -i` · empty command (plain `ssh`) · `-t` with no command (no shell prompt appears; `PTY allocation request failed` or refused) · `scp` upload (sftp mode) · `scp -O` (legacy) · `sftp` | readonly key |
| **NF** no forwarding | With the readonly key:<br>- `-N -L 45999:127.0.0.1:4000`: a local connect to :45999 gets no `/health` answer (the channel is refused)<br>- `-N -R` and `-D` are refused<br>- `-A` gives no agent socket (the `refused` path)<br>**Positive control (full key, read-only):** the same `-L` gets `/health` 200 through the tunnel. | both keys |
| **W** writes nothing (Relay) | After every N and NF row, `find ~ /tmp -xdev -newer ~/.qa-t065-marker` (full key) lists nothing. The exceptions are P3's baseline paths, each explained, and P2's positive-control file, which **must** appear. `/tmp/qa-t065-x` must not exist. | full key, read-only |
| **K** key placement | `~/.ssh/tcm-readonly` exists only in this PC's `~/.ssh`. Its public half is the one on tcm (P1). The private key file is in no git repo under `~/Projects` or `~/Worktrees`: `git ls-files` finds no `tcm-readonly`. | local |

## Not in scope, or not verifiable here

- **The six Claude Code allow rules** are Relay's to add, after this verdict. QA does not edit any
  settings file.
- **sshd behaviour for a client other than OpenSSH for Windows**, and **a copied private key used from
  another machine.** G4 would limit the second.
- **AF on tcm's real Convex going down.** That is not induced: stopping Convex is a production write.
