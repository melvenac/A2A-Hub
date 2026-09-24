# The Loop 3 throwaway QA stack (loop-3-qa-criteria.md). Starts only what -Parts names, records
# every PID in $QaTmp\pids.txt, and logs each process's stdout and stderr to separate files (P9).
# Stop with stop-stack.ps1 -PidFile $QaTmp\pids.txt (P10).
#
#   Part       Port        Tree       What
#   cvxA       3510/3511   candidate  scratch Convex, candidate functions
#   cvxB       3520/3521   ea9d057    scratch Convex, ea9d057 functions (B2, N baselines)
#   hubW       4510        candidate  hub, AUTH_MODE=warn,   -> cvxA
#   hubS       4511        candidate  hub, AUTH_MODE=strict, -> cvxA
#   oldW       4520        ea9d057    hub, warn,   -> cvxA   (B2: old app on candidate functions)
#   oldS       4521        ea9d057    hub, strict, -> cvxA
#   base       4530        ea9d057    hub, warn,   -> cvxB   (baseline: old on old)
#   newOld     4531        candidate  hub, warn,   -> cvxB   (B2.5: new app on old functions)
#   proxy      4550        qa         fault proxy X -> 4510
#   mut        4540        m3 copy    M3 mutant hub (GET messages marks the caller), warn, -> cvxA
#   cvxE       3530/3531   esc copy   isolated scratch Convex, candidate functions (H3.2 escalation)
#   (cvxA's convex dev also opens its dashboard on 6790/6791; T proves those free too)
#
# Every hub command line carries --qa-port=<port> (the hub ignores argv), so T can prove it owns the
# process before it kills it. Main-stack ports are never used; the Convex ports are always explicit,
# because `convex dev --local` otherwise binds 3210.
param(
  [Parameter(Mandatory = $true)][string]$QaTmp,
  [Parameter(Mandatory = $true)][string]$Parts,
  [string]$Cand = "C:\Users\melve\Worktrees\qa3-cand",
  [string]$Old = "C:\Users\melve\Worktrees\qa3-old",
  [string]$Qa = "C:\Users\melve\Worktrees\a2a-qa",
  [string]$EnvFile = "C:\Users\melve\Worktrees\a2a-qa\.env",
  [string]$MutTree = "",
  [string]$EscTree = ""
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $QaTmp | Out-Null
$logs = Join-Path $QaTmp "logs"; New-Item -ItemType Directory -Force $logs | Out-Null
$pidFile = Join-Path $QaTmp "pids.txt"
$node = (Get-Command node).Source

function Free([int]$port) {
  try { $c = @(Get-NetTCPConnection -LocalPort $port -ErrorAction Stop | Where-Object { $_.State -ne 'TimeWait' }); return $c.Count -eq 0 }
  catch { if ($_.CategoryInfo.Category -eq 'ObjectNotFound') { return $true }; throw }
}
function Launch([string]$name, [string]$dir, [string[]]$argv, [hashtable]$envs, [int[]]$ports) {
  foreach ($p in $ports) { if (-not (Free $p)) { throw "port $p is taken; refusing to start $name" } }
  $saved = @{}
  foreach ($k in $envs.Keys) { $saved[$k] = [Environment]::GetEnvironmentVariable($k, 'Process'); [Environment]::SetEnvironmentVariable($k, $envs[$k], 'Process') }
  try {
    $p = Start-Process -FilePath $node -ArgumentList $argv -WorkingDirectory $dir -PassThru -WindowStyle Hidden `
      -RedirectStandardOutput (Join-Path $logs "$name.out.log") -RedirectStandardError (Join-Path $logs "$name.err.log")
  } finally { foreach ($k in $envs.Keys) { [Environment]::SetEnvironmentVariable($k, $saved[$k], 'Process') } }
  Add-Content $pidFile $p.Id
  Write-Output "$name pid $($p.Id) ports $($ports -join ',')"
}
function Hub([string]$name, [string]$tree, [int]$port, [int]$cvx, [string]$mode) {
  Launch $name $tree @("--env-file=$EnvFile", "--import", "tsx", "src/index.ts", "--qa-port=$port") `
    @{ PORT = "$port"; CONVEX_URL = "http://127.0.0.1:$cvx"; AUTH_MODE = $mode; AGENT_KEY = $null } @($port)
}
function Cvx([string]$name, [string]$tree, [int]$cloud, [int]$site) {
  Launch $name $tree @("node_modules/convex/bin/main.js", "dev", "--local", "--local-cloud-port", "$cloud", "--local-site-port", "$site",
    "--typecheck", "disable", "--codegen", "disable") @{ CONVEX_AGENT_MODE = "anonymous" } @($cloud, $site)
}

foreach ($part in ($Parts -split '[,\s]+' | Where-Object { $_ })) {
  switch ($part) {
    "cvxA"   { Cvx $part $Cand 3510 3511 }
    "cvxB"   { Cvx $part $Old 3520 3521 }
    "hubW"   { Hub $part $Cand 4510 3510 "warn" }
    "hubS"   { Hub $part $Cand 4511 3510 "strict" }
    "oldW"   { Hub $part $Old 4520 3510 "warn" }
    "oldS"   { Hub $part $Old 4521 3510 "strict" }
    "base"   { Hub $part $Old 4530 3520 "warn" }
    "newOld" { Hub $part $Cand 4531 3520 "warn" }
    "mut"    { if (-not $MutTree) { throw "mut needs -MutTree" }; Hub $part $MutTree 4540 3510 "warn" }
    "cvxE"   { if (-not $EscTree) { throw "cvxE needs -EscTree" }; Cvx $part $EscTree 3530 3531 }
    "proxy"  { Launch $part $Qa @("docs/loops/loop-1-qa/fault-proxy.mjs", "--qa-port=4550") @{ QA_PROXY_PORT = "4550"; QA_UPSTREAM = "http://127.0.0.1:4510" } @(4550) }
    default  { throw "unknown part $part" }
  }
}
