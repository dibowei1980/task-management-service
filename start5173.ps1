[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 > $null 2>&1

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot
$FrontendDir = Join-Path $ProjectRoot "task-dashboard"

Write-Host "=== TPM Frontend Start (port 5173) ===" -ForegroundColor Cyan

if (-not (Test-Path $FrontendDir)) {
    Write-Host "[ERROR] Directory not found: $FrontendDir" -ForegroundColor Red
    exit 1
}

function Test-PortInUse {
    param([int]$Port)
    try {
        $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        return ($null -ne $conn -and $conn.Count -gt 0)
    } catch {
        return $false
    }
}

if (Test-PortInUse -Port 5173) {
    Write-Host "[SKIP] Port 5173 is already in use" -ForegroundColor Yellow
    exit 0
}

$nodeModules = Join-Path $FrontendDir "node_modules"
if (-not (Test-Path $nodeModules)) {
    Write-Host "[INSTALL] npm install ..." -ForegroundColor Yellow
    Push-Location $FrontendDir
    npm install
    Pop-Location
}

Write-Host "[START] Starting Vite dev server ..." -ForegroundColor Yellow

Start-Job -ScriptBlock {
    param($Path)
    Set-Location $Path
    npm run dev -- --port 5173 2>&1
} -ArgumentList $FrontendDir | Out-Null

Write-Host "[READY] TPM Frontend started at http://localhost:5173" -ForegroundColor Green
