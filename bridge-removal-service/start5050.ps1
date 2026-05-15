<#
.SYNOPSIS
    启动 Bridge Removal Service (BRS)

.DESCRIPTION
    从 .env 文件加载环境变量，然后启动 Flask 服务。
    如果 .env 不存在，提示用户从 .env.example 复制。

.EXAMPLE
    .\start5050.ps1
    .\start5050.ps1 -EnvFile .\my-custom.env
#>

param(
    [string]$EnvFile = ".env"
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $ScriptDir

$EnvFilePath = Resolve-Path -Path $EnvFile -ErrorAction SilentlyContinue
if (-not $EnvFilePath) {
    $ExamplePath = Join-Path $ScriptDir ".env.example"
    if (Test-Path $ExamplePath) {
        Write-Host "[ERROR] 未找到 $EnvFile 文件" -ForegroundColor Red
        Write-Host "[HINT]  请先复制模板并填写配置：" -ForegroundColor Yellow
        Write-Host "        copy .env.example .env" -ForegroundColor Cyan
    } else {
        Write-Host "[ERROR] 未找到 $EnvFile 或 .env.example 文件" -ForegroundColor Red
    }
    Pop-Location
    exit 1
}

Write-Host "[BRS] 加载环境变量: $EnvFilePath" -ForegroundColor Green
Get-Content $EnvFilePath | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#")) {
        $parts = $line -split "=", 2
        if ($parts.Length -eq 2) {
            $key = $parts[0].Trim()
            $value = $parts[1].Trim()
            Set-Item -Path "env:$key" -Value $value
        }
    }
}

if (-not $env:BRIDGE_ADMIN_PASSWORD) {
    Write-Host "[WARN] BRIDGE_ADMIN_PASSWORD 未设置，将无法使用管理员账户登录" -ForegroundColor Yellow
    Write-Host "       请在 .env 文件中设置 BRIDGE_ADMIN_PASSWORD" -ForegroundColor Yellow
}

if (-not $env:BRIDGE_SECRET_KEY -or $env:BRIDGE_SECRET_KEY -eq "change-me-to-a-random-secret-key") {
    Write-Host "[WARN] BRIDGE_SECRET_KEY 使用了默认值，生产环境请更换为随机密钥" -ForegroundColor Yellow
}

if (-not $env:BRS_ALLOWED_ROOTS) {
    Write-Host "[INFO] BRS_ALLOWED_ROOTS 未设置，dom-file 端点仅允许访问 intermediate/ 目录" -ForegroundColor DarkGray
    Write-Host "       如需访问其他目录的 DOM 文件，请在 .env 中设置 BRS_ALLOWED_ROOTS（分号分隔）" -ForegroundColor DarkGray
}

$port = if ($env:BRIDGE_REMOVAL_PORT) { $env:BRIDGE_REMOVAL_PORT } else { "5050" }
Write-Host "[BRS] 启动服务 http://0.0.0.0:$port" -ForegroundColor Green
Write-Host "[BRS] 按 Ctrl+C 停止服务" -ForegroundColor Gray

try {
    python app.py
}
finally {
    Pop-Location
}
