$ErrorActionPreference = "Stop"
$installDir = "D:\Pulse Agent"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = "D:\Pulse-Backups"
$backupDir = Join-Path $backupRoot "pre-rollback-test-$stamp"

New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

# 1. hash manifest of current installation (saved inside the backup for self-contained restore)
$manifest = @()
Get-ChildItem $installDir -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($installDir.Length + 1)
    $hash = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
    $manifest += "$hash  $rel"
}
$manifestPath = Join-Path $backupDir "manifest.txt"
$manifest | Set-Content $manifestPath -Encoding UTF8
Write-Output ("Manifest entries: " + $manifest.Count + " -> " + $manifestPath)
Write-Output ("STAMP=" + $stamp)

# 2. full backup
Copy-Item -Recurse -Force -Path (Join-Path $installDir "*") -Destination $backupDir
Write-Output ("Backup copied to: " + $backupDir)

# 3. verify backup: re-hash backup files and compare with manifest
$mismatch = 0
$verified = 0
foreach ($line in $manifest) {
    $parts = $line -split "  ", 2
    if ($parts.Count -ne 2) { continue }
    $rel = $parts[1]
    $expected = $parts[0]
    $backupFile = Join-Path $backupDir $rel
    if (-not (Test-Path $backupFile)) {
        Write-Output ("MISSING in backup: " + $rel)
        $mismatch++
        continue
    }
    $actual = (Get-FileHash $backupFile -Algorithm SHA256).Hash
    if ($actual -ne $expected) {
        Write-Output ("HASH MISMATCH: " + $rel)
        $mismatch++
    } else {
        $verified++
    }
}
Write-Output ("Backup verified: " + $verified + " ok, " + $mismatch + " problems")

# 4. record key file hashes for later assertions
$keyFiles = @("bin\pulse-agent.exe", "bin\agent-config.exe", "data\paired.env")
foreach ($kf in $keyFiles) {
    $p = Join-Path $installDir $kf
    if (Test-Path $p) {
        Write-Output ("KEY " + $kf + " = " + (Get-FileHash $p -Algorithm SHA256).Hash)
    } else {
        Write-Output ("KEY " + $kf + " = NOT FOUND")
    }
}

# 5. record service state
$svc = Get-Service pulse-agent
Write-Output ("SERVICE " + $svc.Status.ToString() + " / " + $svc.StartType.ToString())
