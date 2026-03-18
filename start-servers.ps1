param()

$ErrorActionPreference = 'SilentlyContinue'

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

function Stop-Port {
  param(
    [Parameter(Mandatory = $true)]
    [int]$Port
  )

  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  $pids = @()
  if ($conns) {
    $pids = @($conns | Select-Object -ExpandProperty OwningProcess -Unique)
  }

  if (-not $pids -or $pids.Count -eq 0) {
    Write-Host ("[port {0}] not in use" -f $Port) -ForegroundColor DarkGray
    return
  }

  foreach ($pid in $pids) {
    if ($pid) {
      Write-Host ("[port {0}] stopping PID {1}..." -f $Port, $pid) -ForegroundColor Yellow
      & cmd /c "taskkill /F /PID $pid /T >nul 2>nul"
    }
  }

  Write-Host ("[port {0}] kill request sent" -f $Port) -ForegroundColor Red
}

function Test-PortFree {
  param(
    [Parameter(Mandatory = $true)]
    [int]$Port
  )

  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  return (-not $conns)
}

$ports = @()
$ports += 3001
$ports += 5173..5177

Write-Host "Freeing ports (3001 and 5173-5177)..." -ForegroundColor Yellow
foreach ($p in $ports) {
  Stop-Port -Port $p
}

Write-Host "Fallback: killing all node.exe processes..." -ForegroundColor Yellow
& cmd /c "taskkill /F /IM node.exe /T >nul 2>nul"

try {
  Write-Host "Waiting 2 seconds for ports to release..." -ForegroundColor DarkGray
  Start-Sleep -Seconds 2 -ErrorAction SilentlyContinue

  $maxAttempts = 5
  $attempt = 1
  while ($attempt -le $maxAttempts) {
    $blocked = @()
    foreach ($p in $ports) {
      if (-not (Test-PortFree -Port $p)) {
        $blocked += $p
      }
    }

    if ($blocked.Count -eq 0) {
      Write-Host "All ports are clear." -ForegroundColor Green
      break
    }

    Write-Host ("Ports still in use: {0} (attempt {1}/{2})" -f ($blocked -join ', '), $attempt, $maxAttempts) -ForegroundColor Yellow
    if ($attempt -ge $maxAttempts) {
      Write-Host "Ports did not clear after retries. Not starting servers." -ForegroundColor Red
      exit 1
    }

    Start-Sleep -Seconds 1 -ErrorAction SilentlyContinue
    $attempt++
  }

  Write-Host "Starting servers: npm run dev" -ForegroundColor Green
  & npm run dev
} finally {
  Write-Host "Stopping any remaining processes on ports (3001 and 5173-5177)..." -ForegroundColor Yellow
  foreach ($p in $ports) {
    Stop-Port -Port $p
  }
  Write-Host "Done." -ForegroundColor Cyan
}

