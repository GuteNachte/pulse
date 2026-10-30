$ErrorActionPreference = "Stop"

$repoRoot = [string](Resolve-Path (Join-Path $PSScriptRoot "..\.."))
$launcherPath = Join-Path $repoRoot "Start-Pulse-Dev.cmd"
$installerPath = Join-Path $PSScriptRoot "install-dev-shortcut.ps1"
$devScriptPath = Join-Path $PSScriptRoot "run-hub-dev.ps1"

if (-not (Test-Path -LiteralPath $launcherPath)) {
    throw "Missing root dev launcher: $launcherPath"
}
if (-not (Test-Path -LiteralPath $installerPath)) {
    throw "Missing shortcut installer: $installerPath"
}

$devScript = Get-Content -LiteralPath $devScriptPath -Raw -Encoding UTF8
if (-not $devScript.Contains('docker info 2>$null | Out-Null')) {
    throw "The optional Docker readiness probe must not print native errors."
}

$launcher = Get-Content -LiteralPath $launcherPath -Raw -Encoding UTF8
foreach ($required in @(
    'cd /d "%~dp0"',
    'supplemental\scripts\run-hub-dev.ps1',
    'where pwsh.exe',
    'set "PULSE_POWERSHELL=pwsh.exe"',
    'set "PULSE_POWERSHELL=powershell.exe"',
    'if errorlevel 1',
    'start "" "http://localhost:5173"'
)) {
    if (-not $launcher.Contains($required)) {
        throw "Missing launcher contract: $required"
    }
}

$powershellIndex = $launcher.IndexOf('"%PULSE_POWERSHELL%" -NoProfile -ExecutionPolicy Bypass -File "%DEV_SCRIPT%"')
$errorIndex = $launcher.IndexOf('if errorlevel 1')
$browserIndex = $launcher.IndexOf('start "" "http://localhost:5173"')
if (-not ($powershellIndex -ge 0 -and $powershellIndex -lt $errorIndex -and $errorIndex -lt $browserIndex)) {
    throw "The browser must open only after the dev script succeeds."
}

$tempDesktop = Join-Path ([System.IO.Path]::GetTempPath()) ("pulse-shortcut-test-" + [Guid]::NewGuid())
New-Item -ItemType Directory -Path $tempDesktop | Out-Null
try {
    & $installerPath -DesktopPath $tempDesktop
    $shortcutName = "Pulse $([char]0x5f00)$([char]0x53d1)$([char]0x73af)$([char]0x5883)"
    $shortcutPath = Join-Path $tempDesktop ($shortcutName + ".lnk")
    if (-not (Test-Path -LiteralPath $shortcutPath)) {
        throw "Shortcut installer did not create: $shortcutPath"
    }

    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    if ($shortcut.TargetPath -ne $launcherPath) {
        throw "Shortcut target mismatch: $($shortcut.TargetPath)"
    }
    if ($shortcut.WorkingDirectory -ne $repoRoot) {
        throw "Shortcut working directory mismatch: $($shortcut.WorkingDirectory)"
    }
} finally {
    Remove-Item -LiteralPath $tempDesktop -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Pulse dev launcher test passed."
