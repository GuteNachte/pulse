$ErrorActionPreference = "Stop"
$installDir = "D:\Pulse Agent"
$target = Join-Path $installDir "bin\agent-config.exe"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$installer = Join-Path $repoRoot "build\releases\windows-installer\Pulse-Agent-1.0.11-test-Setup.exe"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logDir = Join-Path $repoRoot "build\installer-recovery-check"
$logPath = Join-Path $logDir ("rollback-real-" + $stamp + ".log")

if (-not (Test-Path $installer)) {
    Write-Output ("Installer not found: " + $installer)
    exit 2
}
Write-Output ("Installer found: " + $installer)

# 1. ensure no leftover config-program process
$proc = Get-Process agent-config -ErrorAction SilentlyContinue
if ($proc) {
    Write-Output ("agent-config process is running (pid " + $proc.Id + "); aborting to avoid interference")
    exit 2
}
Write-Output "No agent-config process running."

# 2. start detached lock holder: read allowed, write denied
$lockScript = Join-Path $env:TEMP "pulse-rollback-lock.ps1"
@"
`$fs = [System.IO.File]::Open('$target', [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
Start-Sleep -Seconds 600
`$fs.Dispose()
"@ | Set-Content $lockScript -Encoding UTF8
$holder = Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $lockScript) -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 2
if ($holder.HasExited) {
    Write-Output ("Lock holder exited unexpectedly with code " + $holder.ExitCode)
    exit 3
}
Write-Output ("Lock holder started, pid " + $holder.Id)

# 3. verify the lock denies writes (expect this open attempt to fail)
try {
    $probe = [System.IO.File]::Open($target, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::Read)
    $probe.Dispose()
    Write-Output "LOCK CHECK FAILED: write-open succeeded, lock is not effective"
    Stop-Process -Id $holder.Id -Force
    exit 4
} catch {
    Write-Output ("Lock verified: write access denied as expected (" + $_.Exception.GetType().Name + ")")
}

# 4. run silent overwrite install; UAC prompt will appear for the user
Write-Output "Starting silent overwrite install (expect failure during file replacement)..."
$p = Start-Process -FilePath $installer -ArgumentList @("/VERYSILENT", "/NORESTART", "/SUPPRESSMSGBOXES", "/NOCLOSEAPPLICATIONS", ("/LOG=" + $logPath)) -Wait -PassThru
Write-Output ("Installer exit code: " + $p.ExitCode)
Write-Output ("Installer log: " + $logPath)

# 5. release lock
Stop-Process -Id $holder.Id -Force -ErrorAction SilentlyContinue
Write-Output "Lock holder stopped."
Write-Output ("EXITCODE=" + $p.ExitCode)
