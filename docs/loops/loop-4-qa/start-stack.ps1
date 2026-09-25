# The Loop 4 throwaway QA stack (loop-4-qa-criteria.md). Records every PID in $QaTmp\pids.txt and
# logs each process's stdout/stderr separately (P9). Stop with ..\loop-3-qa\stop-stack.ps1
# -PidFile $QaTmp\pids.txt -Ports "3610,3611,4610,4611,4612,4620,4621,4640,5610,6790,6791".
#
#   Part    Port       Tree                    What
#   cvx     3610/3611  qa3-cand (fdc6bfb)      scratch Convex, candidate functions (= cef7517's, C2)
#   newW    4610       replay fdc6bfb /app     hub, warn   (image CMD: node dist/src/index.js)
#   newS    4611       replay fdc6bfb /app     hub, strict
#   noUi    4612       replay fdc6bfb /app     hub, warn, UI_DIR -> a dir with no index.html (A5)
#   oldW    4620       replay cef7517 /app     hub, warn
#   oldS    4621       replay cef7517 /app     hub, strict
#   mut     4640       replay fdc6bfb /app     hub, warn, UI_DIR -> $MutDir (client mutants)
#
# Hubs run the image's CMD from the replay's /app with --env-file (compose's env_file) and a
# --qa-port marker the hub ignores, so T can prove ownership before a kill. 3210/3211/4000 never.
param(
  [Parameter(Mandatory = $true)][string]$QaTmp,
  [Parameter(Mandatory = $true)][string]$Parts,
  [string]$Cand = "C:\Users\melve\Worktrees\qa3-cand",
  [string]$EnvFile = "C:\Users\melve\Worktrees\a2a-qa\.env",
  [string]$MutDir = ""
)
$ErrorActionPreference = 'Stop'
$logs = Join-Path $QaTmp "logs"; New-Item -ItemType Directory -Force $logs | Out-Null
$pidFile = Join-Path $QaTmp "pids.txt"
$node = (Get-Command node).Source
$newApp = Join-Path $QaTmp "rep-new\app"
$oldApp = Join-Path $QaTmp "rep-old\app"

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
function Hub([string]$name, [string]$app, [int]$port, [string]$mode, [string]$uiDir) {
  $envs = @{ PORT = "$port"; CONVEX_URL = "http://127.0.0.1:3610"; AUTH_MODE = $mode; AGENT_KEY = $null; UI_DIR = $uiDir }
  Launch $name $app @("--env-file=$EnvFile", "dist/src/index.js", "--qa-port=$port") $envs @($port)
}

foreach ($part in ($Parts -split '[,\s]+' | Where-Object { $_ })) {
  switch ($part) {
    "cvx"  { Launch $part $Cand @("node_modules/convex/bin/main.js", "dev", "--local", "--local-cloud-port", "3610", "--local-site-port", "3611",
               "--typecheck", "disable", "--codegen", "disable") @{ CONVEX_AGENT_MODE = "anonymous" } @(3610, 3611) }
    "newW" { Hub $part $newApp 4610 "warn" $null }
    "newS" { Hub $part $newApp 4611 "strict" $null }
    "noUi" { Hub $part $newApp 4612 "warn" (Join-Path $QaTmp "empty-ui") }
    "oldW" { Hub $part $oldApp 4620 "warn" $null }
    "oldS" { Hub $part $oldApp 4621 "strict" $null }
    "mut"  { if (-not $MutDir) { throw "mut needs -MutDir" }; Hub $part $newApp 4640 "warn" $MutDir }
    default { throw "unknown part $part" }
  }
}
