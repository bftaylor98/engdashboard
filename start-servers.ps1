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
      Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    }
  }

  Write-Host ("[port {0}] kill request sent" -f $Port) -ForegroundColor Red
}

$ports = @()
$ports += 3001
$ports += 5173..5177

Write-Host "Freeing ports (3001 and 5173-5177)..." -ForegroundColor Yellow
foreach ($p in $ports) {
  Stop-Port -Port $p
}

try {
  Write-Host "Starting servers: npm run dev" -ForegroundColor Green
  & npm run dev
} finally {
  Write-Host "Stopping any remaining processes on ports (3001 and 5173-5177)..." -ForegroundColor Yellow
  foreach ($p in $ports) {
    Stop-Port -Port $p
  }
  Write-Host "Done." -ForegroundColor Cyan
}

