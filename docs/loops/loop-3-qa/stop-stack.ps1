# Instrument T (loop-3-qa-criteria.md, P10): stop the throwaway Loop 3 QA stack by PID, then prove
# every QA port is free. For SIA full stops: the stack must be stopped, not idle.
# Usage: powershell -File stop-stack.ps1 [-PidFile <QA_TMP>\pids.txt] [-Ports "3510,3511,..."]
# Exit 0 only when every QA port is proven free. Exit 1 while any port is taken OR undetermined.
# Never touches the main stack: 3210/3211/4000 are refused as QA ports, and a listener is killed
# only if its command line (or its parent's) names that QA port.
param(
  [string]$PidFile = "",
  # One comma-separated string: `powershell -File` passes "4550,4551" as one argument, not an array.
  [string]$Ports = "3510,3511,3520,3521,3530,3531,4510,4511,4520,4521,4530,4531,4540,4550,6790,6791"
)
# A new variable: assigning the array back to the [string]-typed $Ports would join it again.
$PortList = @($Ports -split '[,\s]+' | Where-Object { $_ } | ForEach-Object { [int]$_ })
if ($PortList.Count -eq 0) { Write-Output "UNDETERMINED: no ports given"; exit 1 }
$main = @(3210, 3211, 4000)
foreach ($p in $PortList) { if ($main -contains $p) { Write-Output "refusing: $p is a main-stack port"; exit 1 } }

function CmdLine([int]$procId) {
  $p = Get-CimInstance Win32_Process -Filter "ProcessId = $procId" -ErrorAction SilentlyContinue
  if ($p) { return @($p.CommandLine, $p.ParentProcessId) } else { return @($null, $null) }
}
function Stop-QaPid([int]$procId, [string]$why) {
  & taskkill /F /T /PID $procId *> $null
  Write-Output "killed $procId ($why), rc $LASTEXITCODE"
}
# Connections on one port. "None found" is the only error that means free; any other error is
# undetermined, and undetermined is never reported as free (fail closed).
function Conns([int]$port) {
  try { return @{ ok = $true; conns = @(Get-NetTCPConnection -LocalPort $port -ErrorAction Stop) } }
  catch {
    if ($_.CategoryInfo.Category -eq 'ObjectNotFound') { return @{ ok = $true; conns = @() } }
    return @{ ok = $false; err = $_.Exception.Message }
  }
}

# 1. Recorded PIDs: each must still name a QA port on its command line before it is killed.
if ($PidFile -and (Test-Path $PidFile)) {
  foreach ($line in Get-Content $PidFile) {
    if ($line -notmatch '^\d+$') { continue }
    $cl = (CmdLine ([int]$line))[0]
    if (-not $cl) { Write-Output "recorded ${line}: already gone"; continue }
    if ($PortList | Where-Object { $cl -match "\b$_\b" }) { Stop-QaPid ([int]$line) "recorded" }
    else { Write-Output "recorded ${line}: command line names no QA port; NOT killed (PID reused?)" }
  }
}

# 2. Any listener still on a QA port whose own or parent's command line names that port.
foreach ($port in $PortList) {
  $r = Conns $port
  $live = $r.conns | Where-Object { $_.State -ne 'TimeWait' -and $_.OwningProcess -ne 0 }
  foreach ($owner in ($live | Select-Object -ExpandProperty OwningProcess -Unique)) {
    $cl, $parent = CmdLine $owner
    $pcl = if ($parent) { (CmdLine $parent)[0] } else { $null }
    if (("$cl $pcl") -match "\b$port\b") { Stop-QaPid $owner "listener on $port" }
    else { Write-Output "port $port held by $owner, whose command line does not name it; NOT killed" }
  }
}

# 3. Prove: every QA port free, any state but TimeWait, both address families.
Start-Sleep -Milliseconds 500
$taken = @()
foreach ($port in $PortList) {
  $r = Conns $port
  if (-not $r.ok) { $taken += "$port(undetermined: $($r.err))"; continue }
  $c = $r.conns | Where-Object { $_.State -ne 'TimeWait' }
  if ($c) { $taken += "$port($(($c | Select-Object -ExpandProperty OwningProcess -Unique) -join '/'))" }
}
$be = Get-Process convex-local-backend -ErrorAction SilentlyContinue | Where-Object {
  $cl = (CmdLine $_.Id)[0]; $cl -and ($PortList | Where-Object { $cl -match "\b$_\b" })
}
if ($be) { $taken += "convex-local-backend($(($be | Select-Object -ExpandProperty Id) -join '/'))" }
if ($taken.Count) { Write-Output "NOT STOPPED: $($taken -join ', ')"; exit 1 }
Write-Output "STOPPED: all $($PortList.Count) QA ports free ($($PortList -join ',')); no QA convex-local-backend"
exit 0
