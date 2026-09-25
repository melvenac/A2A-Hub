# B-row setup: scratch keys made by the candidate's own hub-key.mjs (A2A_KEY_DIR inside QA_TMP, P6),
# registered against the warn hub 4610 (same DB as every hub). Keys are never printed.
param([Parameter(Mandatory = $true)][string]$QaTmp, [string]$Cand = "C:\Users\melve\Worktrees\qa3-cand")
$ErrorActionPreference = 'Stop'
$env:A2A_KEY_DIR = Join-Path $QaTmp "keys"
Remove-Item Env:AGENT_KEY -ErrorAction SilentlyContinue
$hub = "http://127.0.0.1:4610"
$who = @(
  @{ n = "aaron"; k = "human" }, @{ n = "qa-h2"; k = "human" },
  @{ n = "qa-l4a"; k = "ide-session" }, @{ n = "qa-l4b"; k = "daemon" }, @{ n = "qa-l4c"; k = "ide-session" }
)
foreach ($w in $who) {
  $out = & node "$Cand\scripts\hub-key.mjs" init --as $w.n --kind $w.k --register --hub $hub 2>&1
  "{0} ({1}): rc {2} :: {3}" -f $w.n, $w.k, $LASTEXITCODE, (($out | Out-String).Trim() -replace "\s+", " ")
}
