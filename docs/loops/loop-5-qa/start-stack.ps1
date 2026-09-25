# The Loop 5 throwaway QA stack (loop-5-qa-criteria.md). Records every PID in $QaTmp\pids.txt and
# logs stdout/stderr separately (P9). Stop with ..\loop-3-qa\stop-stack.ps1 -PidFile $QaTmp\pids.txt
#   -Ports "3710,3711,3720,3721,4710,4711,4712,4713,4720,4721,4730,4740,5710,6790,6791"
#
#   Part   Port       Tree                 What
#   cvxN   3710/3711  qa3-cand (ebe7747)   scratch Convex, candidate functions (A-E, RG)
#   cvxO   3720/3721  qa3-old  (c4d2d1c)   scratch Convex, OLD functions; later receives the candidate
#                                          functions by `convex deploy` (the deploy act in miniature: F, BF)
#   nW     4710       candidate            hub, warn,   -> cvxN
#   nS     4711       candidate            hub, strict, -> cvxN
#   onW    4712       c4d2d1c              hub, warn,   -> cvxN  (B1's "old on the same data"; F on N)
#   onS    4713       c4d2d1c              hub, strict, -> cvxN
#   ooW    4720       c4d2d1c              hub, warn,   -> cvxO  (baseline, then F after the push)
#   ooS    4721       c4d2d1c              hub, strict, -> cvxO
#   noW    4730       candidate            hub, warn,   -> cvxO  (after the swap: BF3)
#   noS    4731       candidate            hub, strict, -> cvxO  (D1 cand-on-cand strict)
#   mut    4740       $MutTree             mutant hub, $MutMode, -> cvxN
#
# Hubs run `node --env-file=<qa .env> --import tsx src/index.ts --qa-port=<p>` from their tree (Loop 3's
# method); the marker lets T prove ownership. 3210/3211/4000 are never used.
param(
  [Parameter(Mandatory = $true)][string]$QaTmp,
  [Parameter(Mandatory = $true)][string]$Parts,
  [string]$Cand = "C:\Users\melve\Worktrees\qa3-cand",
  [string]$Old = "C:\Users\melve\Worktrees\qa3-old",
  [string]$EnvFile = "C:\Users\melve\Worktrees\a2a-qa\.env",
  [string]$MutTree = "",
  [string]$MutMode = "strict"
)
$ErrorActionPreference = 'Stop'
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
    @{ PORT = "$port"; CONVEX_URL = "http://127.0.0.1:$cvx"; AUTH_MODE = $mode; AGENT_KEY = $null; HUB_URL = "http://127.0.0.1:$port" } @($port)
}
function Cvx([string]$name, [string]$tree, [int]$cloud, [int]$site) {
  Launch $name $tree @("node_modules/convex/bin/main.js", "dev", "--local", "--local-cloud-port", "$cloud", "--local-site-port", "$site",
    "--typecheck", "disable", "--codegen", "disable") @{ CONVEX_AGENT_MODE = "anonymous" } @($cloud, $site)
}

foreach ($part in ($Parts -split '[,\s]+' | Where-Object { $_ })) {
  switch ($part) {
    "cvxN" { Cvx $part $Cand 3710 3711 }
    "cvxO" { Cvx $part $Old 3720 3721 }
    "nW"   { Hub $part $Cand 4710 3710 "warn" }
    "nS"   { Hub $part $Cand 4711 3710 "strict" }
    "onW"  { Hub $part $Old 4712 3710 "warn" }
    "onS"  { Hub $part $Old 4713 3710 "strict" }
    "ooW"  { Hub $part $Old 4720 3720 "warn" }
    "ooS"  { Hub $part $Old 4721 3720 "strict" }
    "noW"  { Hub $part $Cand 4730 3720 "warn" }
    "noS"  { Hub $part $Cand 4731 3720 "strict" }
    "mut"  { if (-not $MutTree) { throw "mut needs -MutTree" }; Hub $part $MutTree 4740 3710 $MutMode }
    default { throw "unknown part $part" }
  }
}
