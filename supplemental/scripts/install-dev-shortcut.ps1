param(
    [string]$DesktopPath = [Environment]::GetFolderPath("Desktop"),
    [string]$ShortcutName = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = [string](Resolve-Path (Join-Path $PSScriptRoot "..\.."))
$launcherPath = Join-Path $repoRoot "Start-Pulse-Dev.cmd"
if (-not (Test-Path -LiteralPath $launcherPath)) {
    throw "Pulse dev launcher not found: $launcherPath"
}
if ([string]::IsNullOrWhiteSpace($DesktopPath)) {
    throw "Desktop path is empty."
}
if ([string]::IsNullOrWhiteSpace($ShortcutName)) {
    $ShortcutName = "Pulse $([char]0x5f00)$([char]0x53d1)$([char]0x73af)$([char]0x5883)"
}

New-Item -ItemType Directory -Force -Path $DesktopPath | Out-Null
$shortcutPath = Join-Path $DesktopPath ($ShortcutName + ".lnk")
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $launcherPath
$shortcut.WorkingDirectory = $repoRoot
$shortcut.Description = "Start the Pulse Hub and Web development environment"
$shortcut.Save()

Write-Host "Pulse development shortcut created: $shortcutPath"
