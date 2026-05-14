$port = 5173
$myPid = $PID

Write-Host "=== TPM Frontend Stop (port $port) ===" -ForegroundColor Cyan

try {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if (-not $conns -or $conns.Count -eq 0) {
        Write-Host "[SKIP] Port $port is not in use" -ForegroundColor Gray
        exit 0
    }

    foreach ($conn in $conns) {
        $targetPid = $conn.OwningProcess
        if ($targetPid -eq $myPid) {
            Write-Host "[SKIP] Ignoring own PID $targetPid" -ForegroundColor Gray
            continue
        }

        $proc = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
        Stop-Process -Id $targetPid -Force -ErrorAction SilentlyContinue

        if ($proc) {
            Write-Host "[STOPPED] $($proc.ProcessName) (PID $targetPid)" -ForegroundColor Green
        } else {
            Write-Host "[STOPPED] PID $targetPid" -ForegroundColor Green
        }
    }

    Start-Sleep -Milliseconds 500
    $left = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($left) {
        Write-Host "[WARN] Port $port still has residual processes" -ForegroundColor Yellow
    } else {
        Write-Host "[DONE] Port $port released" -ForegroundColor Green
    }
} catch {
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
}
