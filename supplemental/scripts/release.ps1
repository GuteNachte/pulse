#Requires -Version 5.1
<#
.SYNOPSIS
    Pulse 发布向导：把「开发完成之后」到「用户可用」的整条发布链固化成一条命令。

.DESCRIPTION
    步骤编排（复用既有已验证脚本，不重写构建逻辑）：

      0. 前置检查：main 分支、工作树干净、gitleaks 在 PATH（历史泄露扫描依赖）
      1. 版本号全仓改写         set-pulse-version.ps1（自动提交）
      2. 本地验证四件套         npm check / typecheck / test / build + go vet + go test（可 -SkipVerify）
      3. 公开泄露审计           audit-public-repository.ps1（可 -SkipAudit）
      4. Windows Agent exe      build-agent-v1.ps1
      5. Linux Agent 镜像       publish-agent-v1.ps1（默认 ghcr.io/gutenachte/pulse-agent:<v>）
      6. Hub 镜像               publish-hub-v1.ps1（默认 ghcr.io/gutenachte/pulse-hub:<v>，内嵌 exe）
      7. 发布产物验证           verify-release-v1.ps1（镜像/manifest/sha256/版本一致性）
      8. agent_releases 同步    POST 本机 Hub /api/pulse/agent-releases/sync（失败不阻塞）
      9. 公开离线包             package-public-release.ps1（exe + compose + SHA256SUMS）
     10. 版本记录双写门禁       release-history.json 顶层版本必须等于 -Version，否则中止
     11. 发布（仅 -Publish）    git tag v<版本> + 推 github（main+tag）+ gh release create 上传附件 + 推 origin

    不带 -Publish 时只做本地构建与验证，结尾打印待执行的发布命令——
    遵守项目规则：发布动作（tag / push / Release）必须由用户显式触发。

.PARAMETER Version
    要发布的版本号，例如 1.0.9。

.PARAMETER Publish
    执行最终发布阶段（tag / push / GitHub Release）。缺省只做本地构建与验证。

.PARAMETER DryRun
    只打印将执行的步骤，不做任何修改。

.PARAMETER SkipVerify
    跳过步骤 2 本地验证四件套（不推荐）。

.PARAMETER SkipAudit
    跳过步骤 3 公开泄露审计（不推荐）。

.PARAMETER SkipOfflinePackage
    跳过步骤 9 公开离线包。

.PARAMETER SkipInstaller
    跳过 Windows Inno Setup 安装包（检测到 ISCC 时默认会构建）。

.PARAMETER HubUrl
    agent_releases 同步使用的本机 Hub 地址，默认 http://127.0.0.1:8090。

.EXAMPLE
    pwsh -File supplemental/scripts/release.ps1 -Version 1.0.9
    本地完整构建与验证，结尾打印发布命令。

.EXAMPLE
    pwsh -File supplemental/scripts/release.ps1 -Version 1.0.9 -Publish
    本地构建验证后直接打 tag、推送并创建 GitHub Release。
#>
param(
    [Parameter(Mandatory)]
    [string]$Version,
    [switch]$Publish,
    [switch]$DryRun,
    [switch]$SkipVerify,
    [switch]$SkipAudit,
    [switch]$SkipOfflinePackage,
    [switch]$SkipInstaller,
    [string]$HubUrl = "http://127.0.0.1:8090"
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $repoRoot

function Write-Step { param([string]$Message) Write-Host "`n[release] $Message" -ForegroundColor Cyan }
function Write-Warn2 { param([string]$Message) Write-Host "[release] $Message" -ForegroundColor Yellow }

$rawVersion = $Version.TrimStart("v")
$tag = "v$rawVersion"
$ghcrHub = "ghcr.io/gutenachte/pulse-hub:$rawVersion"
$ghcrAgent = "ghcr.io/gutenachte/pulse-agent:$rawVersion"
$hubApiAuth = $null

Write-Step "Pulse $rawVersion 发布向导（Publish=$Publish DryRun=$DryRun）"

# ---------- 步骤 0：前置检查 ----------
Write-Step "0/11 前置检查"
if ($DryRun) {
    Write-Warn2 "DryRun：跳过全部修改与构建，只校验参数与打印计划。"
    Write-Host "  计划版本: $rawVersion"
    Write-Host "  计划镜像: $ghcrHub / $ghcrAgent"
    Write-Host "  计划标签: $tag"
    Write-Host "  计划发布: $(if ($Publish) { 'tag + push github/origin + gh release create（含附件）' } else { '仅本地构建与验证，结尾打印发布命令' })"
    return
}

$branch = git branch --show-current
if ($branch -ne "main") { throw "必须在 main 分支上发布（当前：$branch）。" }
$dirty = git status --porcelain
if ($dirty) { throw "工作树不干净，请先提交或暂存：`n$dirty" }

$gitleaks = Get-Command gitleaks -ErrorAction SilentlyContinue
if (-not $gitleaks) {
    Write-Warn2 "gitleaks 不在 PATH，公开审计将跳过历史泄露扫描（安装：winget install Gitleaks.Gitleaks）"
}

$gh = Get-Command gh -ErrorAction SilentlyContinue
if ($Publish -and -not $gh) { throw "-Publish 需要 GitHub CLI（gh），未在 PATH 找到。" }
if ($Publish) {
    $ghAuth = gh auth status 2>&1 | Out-String
    if ($ghAuth -notmatch "Logged in") { throw "-Publish 需要 gh 已登录（gh auth login）。" }
}

# ---------- 步骤 1：版本号全仓改写 ----------
Write-Step "1/11 版本号全仓改写 → $rawVersion"
pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "set-pulse-version.ps1") -Version $rawVersion
$versionDirty = git status --porcelain
if ($versionDirty) {
    git add -A
    git commit -q -m "build: 版本号升级 $rawVersion（release.ps1）"
    Write-Host "  已提交版本号改动。"
} else {
    Write-Host "  版本号无变化（可能已是 $rawVersion）。"
}

# ---------- 步骤 2：本地验证 ----------
if ($SkipVerify) {
    Write-Warn2 "2/11 跳过本地验证（-SkipVerify）"
} else {
    Write-Step "2/11 本地验证（web 四件套 + Go）"
    Push-Location (Join-Path $repoRoot "internal\site")
    try {
        npm.cmd run check -- --max-diagnostics=200
        if ($LASTEXITCODE -ne 0) { throw "biome check 失败" }
        npm.cmd run typecheck
        if ($LASTEXITCODE -ne 0) { throw "typecheck 失败" }
        npm.cmd run test
        if ($LASTEXITCODE -ne 0) { throw "web 测试失败" }
        npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw "web 构建失败" }
    } finally {
        Pop-Location
    }
    go vet -tags=testing ./...
    if ($LASTEXITCODE -ne 0) { throw "go vet 失败" }
    # hub 包在慢盘上约 30 分钟，这里只跑除 hub 外的包（hub 包由 CI go-hub job 覆盖）
    $pkgs = (go list ./... | Where-Object { $_ -notmatch "/internal/hub$" }) -join " "
    go test -tags=testing -count=1 -timeout=900s $pkgs
    if ($LASTEXITCODE -ne 0) { throw "Go 测试失败" }
}

# ---------- 步骤 3：公开泄露审计 ----------
if ($SkipAudit) {
    Write-Warn2 "3/11 跳过公开泄露审计（-SkipAudit）"
} else {
    Write-Step "3/11 公开泄露审计"
    pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "audit-public-repository.ps1")
    if ($LASTEXITCODE -ne 0) { throw "公开审计未通过，禁止发布。" }
}

# ---------- 步骤 4：Windows Agent exe ----------
Write-Step "4/11 构建 Windows Agent exe"
pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "build-agent-v1.ps1") -Version $rawVersion
if ($LASTEXITCODE -ne 0) { throw "Windows Agent 构建失败。" }
$exePath = Join-Path $repoRoot "build\releases\agent\$rawVersion\pulse-agent_windows_amd64.exe"
if (-not (Test-Path $exePath)) { throw "未找到构建产物：$exePath" }

# ---------- 步骤 5：Linux Agent 镜像 ----------
Write-Step "5/11 发布 Linux Agent 镜像 → $ghcrAgent"
pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "publish-agent-v1.ps1") -Version $rawVersion -LinuxImage $ghcrAgent
if ($LASTEXITCODE -ne 0) { throw "Agent 镜像发布失败。" }

# ---------- 步骤 6：Hub 镜像 ----------
Write-Step "6/11 发布 Hub 镜像 → $ghcrHub"
pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "publish-hub-v1.ps1") -Version $rawVersion -Image $ghcrHub
if ($LASTEXITCODE -ne 0) { throw "Hub 镜像发布失败。" }

# ---------- 步骤 7：发布产物验证 ----------
Write-Step "7/11 发布产物验证"
$verifyArgs = @("-Version", $rawVersion, "-HubImage", $ghcrHub, "-LinuxAgentImage", $ghcrAgent)
$androidPaused = $env:PULSE_RELEASE_ANDROID_PAUSED -eq "1"
if ($androidPaused) {
    $verifyArgs += "-SkipAndroidApk"
    Write-Warn2 "Android 处于暂停期（PULSE_RELEASE_ANDROID_PAUSED=1），跳过 APK 验证。"
}
pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "verify-release-v1.ps1") @verifyArgs
if ($LASTEXITCODE -ne 0) { throw "发布产物验证失败。" }

# ---------- 步骤 8：agent_releases 同步 ----------
Write-Step "8/11 同步 agent_releases（本机 Hub：$HubUrl）"
try {
    $resp = Invoke-RestMethod -Uri "$HubUrl/api/pulse/agent-releases/sync" -Method Post -TimeoutSec 15
    Write-Host "  同步成功，发现 $($resp.count) 个本地版本。"
} catch {
    Write-Warn2 "同步失败（本机 Hub 未运行？）：$($_.Exception.Message)"
    Write-Warn2 "发布后请在 设置 → Agent管理 手动点「刷新版本」，否则无法发起受控升级。"
}

# ---------- 步骤 9：公开离线包 ----------
$offlineDir = ""
if ($SkipOfflinePackage) {
    Write-Warn2 "9/11 跳过公开离线包（-SkipOfflinePackage）"
} else {
    Write-Step "9/11 生成公开离线包"
    $offlineDir = Join-Path $repoRoot "build\releases\public-package\$rawVersion"
    pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "package-public-release.ps1") `
        -Version $rawVersion `
        -HubImage $ghcrHub `
        -AgentImage $ghcrAgent `
        -OutputDirectory $offlineDir `
        -WindowsAgentPath $exePath
    if ($LASTEXITCODE -ne 0) { throw "离线包生成失败。" }
    Write-Host "  离线包目录：$offlineDir"
}

# ---------- 步骤 9b：Windows 安装包（可选） ----------
$installerPath = ""
if ($SkipInstaller) {
    Write-Warn2 "9b 跳过 Windows 安装包（-SkipInstaller）"
} else {
    $iscc = "$env:LOCALAPPDATA/Programs/Inno Setup 6/ISCC.exe"
    if (Test-Path $iscc) {
        Write-Step "9b 构建 Windows 安装包（Inno Setup）"
        pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "build-windows-agent-installer.ps1") -Version $rawVersion -InnoCompiler $iscc
        if ($LASTEXITCODE -ne 0) {
            Write-Warn2 "安装包构建失败，继续发布（安装包为可选交付物）。"
        } else {
            $installerPath = Join-Path $repoRoot "build\releases\windows-installer\pulse-agent-setup-$rawVersion.exe"
            if (-not (Test-Path $installerPath)) {
                $candidate = Get-ChildItem (Join-Path $repoRoot "build\releases\windows-installer") -Filter "*.exe" |
                    Sort-Object LastWriteTime -Descending | Select-Object -First 1
                if ($candidate) { $installerPath = $candidate.FullName }
            }
        }
    } else {
        Write-Warn2 "未检测到 Inno Setup（$iscc），跳过 Windows 安装包。"
    }
}

# ---------- 步骤 10：版本记录双写门禁 ----------
Write-Step "10/11 版本记录双写门禁"
$historyPath = Join-Path $repoRoot "internal\site\src\components\routes\settings\release-history.json"
$history = Get-Content -Raw -LiteralPath $historyPath | ConvertFrom-Json
if ($history[0].version -ne $rawVersion) {
    throw (@"
版本记录双写未完成：release-history.json 顶层版本是 '$($history[0].version)'，不等于待发布版本 '$rawVersion'。
请先手工完成：
  1. docs/release-notes-next.md 追加本次「版本发布」条目
  2. 把上一版本条目从 release-history.json 移入 release-history-archive.json
  3. 在 release-history.json 写入 $rawVersion 的新记录（四端分节）
  4. 提交后重新运行本脚本
"@)
}
$historyDirty = git status --porcelain
if ($historyDirty) {
    git add -A
    git commit -q -m "docs(release): $rawVersion 版本记录与文档更新"
    Write-Host "  已提交版本记录与文档改动。"
}

# ---------- 步骤 11：发布 ----------
$releaseNotesFile = Join-Path $env:TEMP "pulse-release-notes-$rawVersion.md"
$history[0].sections | ForEach-Object {
    $_.items | ForEach-Object { "- $_" }
} | Set-Content -LiteralPath $releaseNotesFile -Encoding UTF8
$notesHeader = "# Pulse $rawVersion`n`n> 发布日期 $(Get-Date -Format yyyy-MM-dd) · Hub / Web / Agent / Android 同版本`n`n"
Get-Content $releaseNotesFile | ForEach-Object { $_ } | Set-Content $releaseNotesFile
($notesHeader + (Get-Content -Raw $releaseNotesFile)) | Set-Content -LiteralPath $releaseNotesFile -Encoding UTF8

if (-not $Publish) {
    Write-Step "11/11 本地发布准备完成（未发布）"
    Write-Host @"

全部本地步骤已通过。确认发布时执行：

  pwsh -NoProfile -ExecutionPolicy Bypass -File supplemental/scripts/release.ps1 -Version $rawVersion -Publish

（将执行：git tag $tag → push github main+tag → gh release create 上传附件 → push origin main）
"@ -ForegroundColor Green
    return
}

Write-Step "11/11 发布：tag + push + GitHub Release"

$existingTag = git tag -l $tag
if ($existingTag -eq $tag) { throw "标签 $tag 已存在，如需重发请先删除（git tag -d $tag && git push github :refs/tags/$tag）。" }

git tag -a $tag -m "Pulse $rawVersion"
if ($LASTEXITCODE -ne 0) { throw "打标签失败。" }

git push github main
git push github $tag
if ($LASTEXITCODE -ne 0) { throw "推送 github 失败。" }

$releaseArgs = @(
    "release", "create", $tag,
    "--repo", "GuteNachte/pulse",
    "--target", "main",
    "--title", "Pulse $rawVersion",
    "--notes-file", $releaseNotesFile,
    "--latest"
)
if (Test-Path $exePath) { $releaseArgs += $exePath }
if ($offlineDir -and (Test-Path $offlineDir)) {
    Get-ChildItem $offlineDir -File | ForEach-Object { $releaseArgs += $_.FullName }
}
if ($installerPath -and (Test-Path $installerPath)) { $releaseArgs += $installerPath }

gh @releaseArgs
if ($LASTEXITCODE -ne 0) { throw "GitHub Release 创建失败。" }

git push origin main
if ($LASTEXITCODE -ne 0) { Write-Warn2 "推 origin（内网 Git）失败，可稍后手动补推，不影响 GitHub 发布。" }

Write-Step "Pulse $rawVersion 发布完成"
Write-Host "  Release: https://github.com/GuteNachte/pulse/releases/tag/$tag"
Write-Host "  镜像:    $ghcrHub / $ghcrAgent"
Write-Host "  后续:    各部署实例 docker compose pull && docker compose up -d；Agent 从设置页受控升级。"
