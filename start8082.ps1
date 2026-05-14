param(
    [switch]$Build
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 > $null 2>&1

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendPath = Join-Path $ProjectRoot "task-management-service"
$EnvFile = Join-Path $BackendPath ".env"

if (Test-Path $EnvFile) {
    Get-Content $EnvFile -Encoding UTF8 | ForEach-Object {
        if ($_ -match '^([^#][^=]+)=(.*)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($name, $value, 'Process')
        }
    }
    Write-Host "Loaded environment from $EnvFile" -ForegroundColor Green
}

if ($Build) {
    Write-Host "Building backend..." -ForegroundColor Cyan
    Push-Location $BackendPath
    try {
        .\mvnw.cmd compile -q
        Write-Host "Compile completed" -ForegroundColor Green
    } finally {
        Pop-Location
    }
}

Write-Host "Starting backend on port 8082..." -ForegroundColor Cyan
Write-Host "Logs will appear below. Press Ctrl+C to stop." -ForegroundColor Gray
Write-Host ""

Push-Location $BackendPath
try {
    & mvn spring-boot:run "-Dspring-boot.run.profiles=sso"
} finally {
    Pop-Location
}
