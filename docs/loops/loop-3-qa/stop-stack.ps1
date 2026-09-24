# Instrument T (loop-3-qa-criteria.md, P10): stop the throwaway Loop 3 QA stack by PID, then prove
# every QA port is free. For SIA full stops: the stack must be stopped, not idle.
# Usage: powershell -File stop-stack.ps1 [-PidFile <QA_TMP>\pids.txt] [-Ports 3510,3511,...]
# Exit 0 only when every QA port is free in both address families. Exit 1 while any port is taken.
# Never touches the main stack: 3210/3211/4000 are refused as QA ports, and a listener is killed
# only if its command line (or its parent's) names that QA port.
param(
  [string]$PidFile = "",
  [int[]]$Ports = @(3510, 3511, 3520, 3521, 4510, 4511, 4520, 4521, 4530, 4531, 4550)
)
$main = @(3210, 3211, 4000)
foreach ($p in $Ports) { if ($main -contains $p) { Write-Output "refusing: $p is a main-stack port"; exit 1 } }

function CmdLine([int]$procId) {
  $p = Get-CimInstance Win32_Process -Filter "ProcessId = $procId" -ErrorAction SilentlyContinue
  if ($p) { return @($p.CommandLine, $p.ParentProcessId) } else { return @($null, $null) }
}
function Stop-QaPid([int]$procId, [string]$why) {
  & taskkill /F /T /PID $procId *> $null
  Write-Output "killed $procId ($why), rc $LASTEXITCODE"
}

# 1. Recorded PIDs: each must still name a QA port on its command line before it is killed.
if ($PidFile -and (Test-Path $PidFile)) {
  foreach ($line in Get-Content $PidFile) {
    if ($line -notmatch '^\d+$') { continue }
    $cl = (CmdLine ([int]$line))[0]
    if (-not $cl) { Write-Output "recorded ${line}: already gone"; continue }
    if ($Ports | Where-Object { $cl -match "\b$_\b" }) { Stop-QaPid ([int]$line) "recorded" }
    else { Write-Output "recorded ${line}: command line names no QA port; NOT killed (PID reused?)" }
  }
}

# 2. Any listener still on a QA port whose own or parent's command line names that port.
foreach ($port in $Ports) {
  $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
  foreach ($owner in ($conns | Select-Object -ExpandProperty OwningProcess -Unique)) {
    $cl, $parent = CmdLine $owner
    $pcl = if ($parent) { (CmdLine $parent)[0] } else { $null }
    if (("$cl $pcl") -match "\b$port\b") { Stop-QaPid $owner "listener on $port" }
    else { Write-Output "port $port held by $owner, whose command line does not name it; NOT killed" }
  }
}

# 3. Prove: every QA port free, any state, both address families.
Start-Sleep -Milliseconds 500
$taken = @()
foreach ($port in $Ports) {
  $c = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object { $_.State -ne 'TimeWait' }
  if ($c) { $taken += "$port($(($c | Select-Object -ExpandProperty OwningProcess -Unique) -join '/'))" }
}
$be = Get-Process convex-local-backend -ErrorAction SilentlyContinue | Where-Object {
  $cl = (CmdLine $_.Id)[0]; $cl -and ($Ports | Where-Object { $cl -match "\b$_\b" })
}
if ($be) { $taken += "convex-local-backend($(($be | Select-Object -ExpandProperty Id) -join '/'))" }
if ($taken.Count) { Write-Output "NOT STOPPED: $($taken -join ', ')"; exit 1 }
Write-Output "STOPPED: all $($Ports.Count) QA ports free ($($Ports -join ',')); no QA convex-local-backend"
exit 0
