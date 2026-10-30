param(
    # 2026-10-31 默认版本对齐主链：此前停在 1.0.6，导致安装包版本落后
    [string]$Version = "",
    [string]$InnoCompiler = "$env:LOCALAPPDATA/Programs/Inno Setup 6/ISCC.exe"
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
# 默认版本从 package.json 动态读取，避免安装包版本落后于主链
if ([string]::IsNullOrWhiteSpace($Version)) {
    $pkgJson = Join-Path $repoRoot "internal\site\package.json"
    $Version = (Get-Content -Raw -LiteralPath $pkgJson | ConvertFrom-Json).version
}
$releaseDir = Join-Path $repoRoot "build\releases\windows-installer"
$wails = Join-Path $env:USERPROFILE "go\bin\wails.exe"
$go = (Get-Command go -ErrorAction Stop).Source

New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
Remove-Item -LiteralPath (Join-Path $releaseDir "pulse-agent.exe"), (Join-Path $releaseDir "agent-config.exe") -Force -ErrorAction SilentlyContinue

Push-Location $repoRoot
try {
    $env:GOOS = "windows"
    $env:GOARCH = "amd64"
    & $go build -o (Join-Path $releaseDir "pulse-agent.exe") -ldflags "-w -s -X gutenacht.site/pulse.Version=$Version" ./internal/cmd/agent
    if ($LASTEXITCODE -ne 0) { throw "Windows Agent build failed" }

    if (-not (Test-Path $wails)) { throw "Wails CLI not found: $wails" }
    Push-Location (Join-Path $repoRoot "windows\agent-config")
    try {
        & $wails build -clean -platform windows/amd64 -ldflags "-X gutenacht.site/pulse.Version=$Version"
        if ($LASTEXITCODE -ne 0) { throw "Agent config build failed" }
    } finally { Pop-Location }
    $builtConfig = Join-Path $repoRoot "windows\agent-config\build\bin\agent-config.exe"
    if (-not (Test-Path $builtConfig)) { throw "Agent config artifact not found: $builtConfig" }
    Copy-Item -LiteralPath $builtConfig -Destination (Join-Path $releaseDir "agent-config.exe") -Force

    if (-not (Test-Path $InnoCompiler)) { throw "Inno Setup compiler not found: $InnoCompiler" }
    $env:PULSE_AGENT_VERSION = $Version
    & $InnoCompiler (Join-Path $repoRoot "windows\installer\pulse-agent.iss")
    if ($LASTEXITCODE -ne 0) { throw "Inno Setup build failed" }
    Write-Host "Windows Agent installer generated: $releaseDir"
} finally {
    Pop-Location
    Remove-Item Env:\GOOS -ErrorAction SilentlyContinue
    Remove-Item Env:\GOARCH -ErrorAction SilentlyContinue
    Remove-Item Env:\PULSE_AGENT_VERSION -ErrorAction SilentlyContinue
}
