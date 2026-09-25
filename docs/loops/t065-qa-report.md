# T-065: acceptance report (Gauge)

**Final verdict: PASS** on `417a34dde54d` / `de3a9c3e0cd0` / line 1 `ea0a6ce6b1bd`, by Relay's
ruling (a) on W, below. **W's original verdict, FAIL as written, is left visible in the table.**

## Relay's ruling on W (A2A to Gauge, session 17, verbatim)

> RULING (a). T-065 PASSES on 417a34dde54d / de3a9c3e0cd0 / line 1 ea0a6ce6b1bd.
>
> This is a correction of my rule's wording to its purpose, not a widening to pass. Record it that way:
> - W as I wrote it FAILED.
> - W's purpose is that the readonly key leaves no persistent change on tcm. A root-owned docker daemon transient (runc exec spec), created and deleted inside the call, is a mechanism of every `docker exec`, including the read-only reads K7 and step 2 used. My literal rule would have classed those reads as writes, so the rule was mis-specified.
> - CLARIFIED W: nothing persists after the call, and nothing is written by melvenac, except the permitted ~/.cache path (unused).

**Against the clarified W:** no file persisted after any call, `melvenac` wrote nothing, and
`~/.cache` was unused. **PASS.**

---

## As first reported (before the ruling)

**Verdict: every row passes except W, and W needs Relay's ruling.**
- As written, W fails: "anything else written is a FAIL".
- The write is explained. Each `docker exec` makes containerd's runc create a transient, root-owned
  `/tmp/runc-process<N>` and delete it. Nothing written by `melvenac` persists.
- If Relay rules that out of W's scope, the verdict is **PASS**. If not, it is **FAIL**, and the fix
  is structural (below).

**Run:** 2026-09-25, 04:50:50Z (marker) to 04:56:40Z, from this PC, against tcm. Criteria:
`docs/loops/t065-qa-criteria.md` (accepted, `b43ad2f`). Harness and logs: `docs/loops/t065-qa/`.

**Frozen candidate**, read at the start and again at 04:56:40Z, unchanged:
- `~/bin/a2a-readonly` `417a34dde54d`
- `~/bin/a2a-k7.mjs` `de3a9c3e0cd0`
- `authorized_keys` line 1 `ea0a6ce6b1bd`, 2 lines

**tcm writes by QA** (full key, each on Aaron's approval):
- `~/.qa-t065-marker`
- `/tmp/qa-t065-pos`
- `/dev/shm/qa-t065-af`

All three were removed, and their absence was read back. No QA-named file remains.

| Row | Observed | Result |
|---|---|---|
| **S** | Read at `417a34dde54d` (91 lines): exact quoted `case "${SSH_ORIGINAL_COMMAND-}"`, anything else gives `refused` and exit 2. No `eval`, no passthrough, no redirect to a file. `set -u -o pipefail` (G1), `PATH=/usr/bin:/bin`, `umask 077`. Every source is captured, then its rc checked, and a failure gives `UNDETERMINED: <src> rc=<n>` with exit 2. The admin key is only in `CONVEX_SELF_HOSTED_ADMIN_KEY`, then `unset` (G3). A final `mask`, and `maskhex` for auth-log. The line's options are exactly `from="100.64.0.0/10",restrict,command="/home/melvenac/bin/a2a-readonly"` (G4). Nit: the comment on line 5 predates `from=`. | PASS |
| **AK** | 2 lines, mode 600. Line 1 is **equal** to line 1 of both backups (`ea0a6ce6b1bd`). The diff against the pre-T-065 backup is exactly one added line. The full key logged in for every full-key step. | PASS |
| **P1** | Line 2's fingerprint, `SHA256:SHRHzylx…jN5g`, equals this PC's `~/.ssh/tcm-readonly.pub`. | PASS |
| **M1** health | rc 0, keys `[agent, convex, status]`, ok | PASS |
| **M2** auth-mode | rc 0, `warn` | PASS |
| **M3** image | rc 0. Running `648ac3963dd7` (latest). prev is `13aeef206f7b`. 12-char IDs only. | PASS |
| **M4** runners | rc 0, `gh-runner@1: active`, `gh-runner@2: active` | PASS |
| **AL** auth-log | rc 0, `auth-lines=14 first=04:14:11Z last=04:27:26Z total-lines=19`, `first-line-within-60s-of-start=yes`, `rotated=unknown (needs root)`. **14 equals the full key's direct `grep -c '\[auth\]'` (14).** It has no cap. | PASS |
| **AS** agents-summary | rc 0. 6 rows, all owned: aaron human, atlas, cursor-grok, grok, grok-probe, relay. No `7e9f8fd1`. `K7=PASS`. This matches Relay's 04:26:54Z read. | PASS |
| **AF** fail-closed | A `/dev/shm` copy (full key) with only the URL changed to `127.0.0.1:1`, shown to have landed (1 edit, 2 diff lines): `UNDETERMINED: convex rc=124`, **rc 2**. The other direction, the real script run the same way: `rows=6 K7=PASS`, rc 0. The copy was removed and read back absent. | PASS |
| **L** | Selftest first: a planted run of each of the 4 classes, all flagged. Over all six menu outputs: 0 runs of 32+ base64/hex, 0 admin-key prefix, 0 ssh key text, 0 64-hex runs. | PASS |
| **N** | rc 2 and `refused` for: `docker ps`, `touch /tmp/qa-t065-x`, `auth-log; id`, `auth-log && id`, `auth-log\|id`, `auth-log`+newline+`id`, `auth-log ` (trailing space), ` auth-log`, `AUTH-LOG`, `auth-log --all`, `health x`, `$(id)`, `sh`, `bash -i`, empty, and `-t` with no command. **A forced pty (`-tt`, with no command, `id` or `health`)** gives `PTY allocation request failed`, rc 255, and nothing runs (no `uid=`); the criterion allows this. The scp in sftp mode and sftp fail with `message too long 1919247989`, which is the bytes `refu` read as a packet length, so the forced command answered. `scp -O` gives `refused`. No target file exists. | PASS |
| **NF** | `-L`: `administratively prohibited`, and the client's connect is reset. `-R`: `remote port forwarding failed`, rc 255. `-D`: the SOCKS connect is closed with `administratively prohibited`. **Positive control, full key, same `-L`:** `/health` 200 through the tunnel. `-A` is not separately observed; `restrict` disables it (S). | PASS |
| **W** | After the marker (04:50:50Z) and every N and NF row, `find ~ /tmp /dev/shm -xdev -newer marker` listed **no file**. It did list the directory `/tmp` itself (mtime 04:51:00Z). **Positive control:** a full-key `touch /tmp/qa-t065-pos` was listed. `~/.cache` is unchanged since 2026-08-21, so there was no CLI cache write. Attribution below. | **FAIL as written; explained; ruling needed** |
| **K** | 35 repos under `~/Projects` and `~/Worktrees`: 0 tracked files named `tcm-readonly`. OpenSSH for Windows accepted the private key, so its ACL is restricted. | PASS |

## W: what writes to `/tmp`, and how that was shown

1. **With no QA activity, `/tmp`'s mtime held still for 90 s** (04:52:04Z to 04:53:35Z). So the change
   was caused by the run.
2. **Each menu item was run alone,** with a `stat /tmp` before and after:
   - `health`, `image`, `runners` and `auth-log` left it **unchanged**;
   - `auth-mode` and `agents-summary` **changed it**.

   Those two are exactly the items that call `docker exec`.
3. **A read-only poll of `/tmp`, every millisecond during one `auth-mode` call,** saw one transient
   entry, `runc-process954685025`, **uid 0, mode 0600**. It was gone at the end of the window, and
   nothing was left.

That is containerd's runc shim writing the exec process spec. It is a root daemon's temporary
file, created and deleted within the call. It is not written by `melvenac`, and it is not left
behind. It is still a write caused by a menu item, so W as written does not permit it.

**If Relay rules it a FAIL, the structural fix is limited:**
- `auth-mode` could read `AUTH_MODE` without an exec, by filtering `docker inspect` for that one
  variable.
- `agents-summary` cannot avoid an exec: `generate_admin_key.sh` runs inside the `convex` container.
  So either W is ruled to exclude docker-daemon transients, or `agents-summary` leaves the menu.

## Instrument notes (not candidate defects)

- My harness first marked `-tt` as FAIL, because it demanded `refused` and rc 2. The criterion
  allows "PTY allocation request failed". It is recorded as PASS against the criterion, with the
  extra `-tt id` and `-tt health` probes as evidence.
- P3's baseline was taken over only 2 minutes. The idle sample in W step 1 (90 s) is the stronger
  baseline, and it was taken after the run.

## Not verified

- `-A` agent forwarding, as a separate observation. It is covered by `restrict` in S.
- A copy of the private key used from off the tailnet. `from=` is in place (S), but that was not
  exercised from another network.
- Behaviour under a Convex outage on tcm's **real** backend. That was not induced (a production
  write); AF used a copy.
