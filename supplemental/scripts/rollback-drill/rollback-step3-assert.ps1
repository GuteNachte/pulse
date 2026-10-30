param(
    [Parameter(Mandatory = $true)]
    [string]$ManifestPath,
    [Parameter(Mandatory = $true)]
    [string]$InstallLog
)
$ErrorActionPreference = "Continue"
$installDir = "D:\Pulse Agent"

$expected = @{}
foreach ($line in Get-Content $manifestPath -Encoding UTF8) {
    $parts = $line -split "  ", 2
    if ($parts.Count -eq 2) { $expected[$parts[1]] = $parts[0] }
}

Write-Output "===== 1. program files restored to old versions ====="
foreach ($kf in @("bin\pulse-agent.exe", "bin\agent-config.exe")) {
    $p = Join-Path $installDir $kf
    if (-not (Test-Path $p)) { Write-Output ("FAIL: missing " + $kf); continue }
    $h = (Get-FileHash $p -Algorithm SHA256).Hash
    if ($expected.ContainsKey($kf) -and $h -eq $expected[$kf]) {
        Write-Output ("PASS: " + $kf + " hash matches old version")
    } else {
        Write-Output ("FAIL: " + $kf + " hash " + $h)
    }
}

Write-Output "===== 2. connection config untouched ====="
foreach ($kf in @($expected.Keys | Where-Object { $_ -like "data*" })) {
    $p = Join-Path $installDir $kf
    if (-not (Test-Path $p)) { Write-Output ("FAIL: missing " + $kf); continue }
    $h = (Get-FileHash $p -Algorithm SHA256).Hash
    if ($h -eq $expected[$kf]) { Write-Output ("PASS: " + $kf + " unchanged") }
    else { Write-Output ("FAIL: " + $kf + " changed") }
}

Write-Output "===== 3. service state ====="
$svc = Get-Service pulse-agent
Write-Output ("SERVICE " + $svc.Status.ToString() + " / " + $svc.StartType.ToString())
Start-Sleep -Seconds 5
$svc2 = Get-Service pulse-agent
Write-Output ("SERVICE after 5s: " + $svc2.Status.ToString())

Write-Output "===== 4. installer log evidence ====="
$patterns = "Rollback backup prepared", "Rolling back", "restore", "Restore", "agent-config", "error", "Error", "abort", "Abort", "Deinitializing"
Get-Content $installLog | ForEach-Object {
    foreach ($pat in $patterns) {
        if ($_ -match $pat) { Write-Output $_; break }
    }
}
