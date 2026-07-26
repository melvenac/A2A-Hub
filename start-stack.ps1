# start-stack.ps1 -- launch the full local A2A stack, each process in its own terminal window.
#
# Usage:  .\start-stack.ps1 [-SkipBuild]
#
# Windows opened (in order, with readiness waits between the load-bearing ones):
#   1. A2A Convex  -- npx convex dev --local  (backend on :3210)
#   2. A2A Hub     -- node --env-file=.env dist\src\index.js  (:4000)
#   3. A2A alice   -- wrapper daemon (persona auto-loads from personas\alice.md)
#   4. A2A bob     -- wrapper daemon (persona auto-loads from personas\bob.md)
#   5. A2A Client  -- Vite dev server for the chat client  (:5173)
#
# Each window is owned by you -- not a Claude Code subprocess -- so the stack
# survives agent sessions ending (CC-launched background processes die silently
# on this machine; that's why this script exists).
#
# NOTE: keep this file ASCII-only. PowerShell 5.1 reads BOM-less files as ANSI;
# multi-byte characters can decode into quote characters and break parsing.

param([switch]$SkipBuild)

$root = $PSScriptRoot

if (-not (Test-Path (Join-Path $root '.env'))) {
    Write-Host 'ERROR: .env not found in repo root. Copy .env.example and fill in keys.' -ForegroundColor Red
    exit 1
}

if (-not $SkipBuild) {
    Write-Host '==> Building (npm run build)...' -ForegroundColor Cyan
    Push-Location $root
    npm run build
    $buildExit = $LASTEXITCODE
    Pop-Location
    if ($buildExit -ne 0) {
        Write-Host 'Build failed -- fix errors and rerun.' -ForegroundColor Red
        exit 1
    }
}
if (-not (Test-Path (Join-Path $root 'dist\src\index.js'))) {
    Write-Host 'ERROR: dist\src\index.js missing. Run without -SkipBuild.' -ForegroundColor Red
    exit 1
}

function Start-StackWindow {
    param([string]$Title, [string]$WorkDir, [string]$Command)
    $inner = "`$Host.UI.RawUI.WindowTitle = '$Title'; Set-Location '$WorkDir'; $Command"
    Start-Process powershell -ArgumentList '-NoExit', '-Command', $inner
    Write-Host "==> $Title window opened" -ForegroundColor Green
}

function Test-PortBusy {
    param([int]$Port)
    # Probe both address families: convex and the hub bind 127.0.0.1, but vite
    # binds ::1 only. An IPv4-only probe never sees the client, so the
    # skip-if-running check misfires and a readiness wait would time out.
    foreach ($addr in @('127.0.0.1', '::1')) {
        $family = if ($addr -like '*:*') {
            [System.Net.Sockets.AddressFamily]::InterNetworkV6
        } else {
            [System.Net.Sockets.AddressFamily]::InterNetwork
        }
        $client = New-Object System.Net.Sockets.TcpClient($family)
        try {
            $client.Connect($addr, $Port)
            $client.Close()
            return $true
        } catch {
            $client.Close()
        }
    }
    return $false
}

function Test-DaemonRunning {
    param([string]$AgentName)
    $procs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue
    foreach ($p in $procs) {
        if ($p.CommandLine -match "daemon\.js --name $AgentName") { return $true }
    }
    return $false
}

function Wait-ForPort {
    param([int]$Port, [int]$TimeoutSec, [string]$What)
    Write-Host "==> Waiting for $What (port $Port, up to ${TimeoutSec}s)..." -ForegroundColor Cyan
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-PortBusy $Port) {
            Write-Host "==> $What is up" -ForegroundColor Green
            return
        }
        Start-Sleep -Seconds 2
    }
    Write-Host "WARNING: $What not responding after ${TimeoutSec}s -- continuing; check its window." -ForegroundColor Yellow
}

# Every piece skips itself if already running, so re-running this script after a
# partial failure only starts what's missing.

# 1. Convex local backend (first run may download the binary -- generous timeout)
if (Test-PortBusy 3210) {
    Write-Host '==> Convex already running on :3210 -- reusing it (note: convex function changes will not hot-deploy)' -ForegroundColor Yellow
} else {
    Start-StackWindow 'A2A Convex' $root 'npx convex dev --local --local-force-upgrade'
    Wait-ForPort -Port 3210 -TimeoutSec 120 -What 'Convex'
}

# 2. Hub (CONVEX_URL set explicitly -- local stack always talks to local Convex;
#    an env var set here beats .env because node's --env-file never overrides existing env)
if (Test-PortBusy 4000) {
    Write-Host '==> Hub already running on :4000 -- skipping' -ForegroundColor Yellow
} else {
    Start-StackWindow 'A2A Hub' $root '$env:CONVEX_URL = ''http://127.0.0.1:3210''; node --env-file=.env dist\src\index.js'
    Wait-ForPort -Port 4000 -TimeoutSec 60 -What 'Hub'
}

# 3. Agent daemons -- personas resolve from personas\<name>.md relative to repo root
foreach ($agent in @('alice', 'bob')) {
    if (Test-DaemonRunning $agent) {
        Write-Host "==> $agent daemon already running -- skipping" -ForegroundColor Yellow
    } else {
        Start-StackWindow "A2A $agent" $root "node --env-file=.env dist\src\wrapper\daemon.js --name $agent"
    }
}

# 4. Chat client (vite invoked via node directly -- npx PATH is unreliable here)
if (Test-PortBusy 5173) {
    Write-Host '==> Client already running on :5173 -- skipping' -ForegroundColor Yellow
} else {
    Start-StackWindow 'A2A Client' (Join-Path $root 'client') 'node node_modules\vite\bin\vite.js'
    Wait-ForPort -Port 5173 -TimeoutSec 60 -What 'Client'
}

Write-Host ''
Write-Host 'Stack launched.' -ForegroundColor Cyan
Write-Host '  Verify:      node scripts\verify-client-stack.mjs'
Write-Host '  Chat client: http://localhost:5173'
Write-Host '  Hub health:  http://localhost:4000/health'
