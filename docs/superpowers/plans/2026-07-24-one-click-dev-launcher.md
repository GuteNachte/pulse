# Pulse One-Click Development Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Pulse Windows 开发环境增加根目录双击启动器，并在当前用户桌面生成可重复安装的快捷方式。

**Architecture:** 根目录 CMD 只负责定位仓库、优先选择 PowerShell 7（兼容回退到 Windows PowerShell 5.1）、调用现有 `run-hub-dev.ps1` 并在成功后打开浏览器；Hub、Vite、数据目录和健康检查仍由标准 PowerShell 脚本负责。独立 PowerShell 安装器使用 Windows Shell 创建 `.lnk`，支持自定义桌面目录以便自动化验证。

**Tech Stack:** Windows CMD、PowerShell 5.1、WScript Shell COM、现有 Pulse Hub/Vite 开发脚本

---

### Task 1: 建立一键启动契约测试

**Files:**
- Create: `supplemental/scripts/test-dev-launcher.ps1`
- Test: `supplemental/scripts/test-dev-launcher.ps1`

- [x] **Step 1: 写失败测试**

测试读取根目录启动器，并在临时目录实际创建和读取快捷方式：

```powershell
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$launcherPath = Join-Path $repoRoot "Start-Pulse-Dev.cmd"
$installerPath = Join-Path $PSScriptRoot "install-dev-shortcut.ps1"

if (-not (Test-Path -LiteralPath $launcherPath)) { throw "Missing root dev launcher." }
if (-not (Test-Path -LiteralPath $installerPath)) { throw "Missing shortcut installer." }

$launcher = Get-Content -LiteralPath $launcherPath -Raw -Encoding UTF8
foreach ($required in @(
    'cd /d "%~dp0"',
    'supplemental\scripts\run-hub-dev.ps1',
    'if errorlevel 1',
    'start "" "http://localhost:5173"'
)) {
    if (-not $launcher.Contains($required)) { throw "Missing launcher contract: $required" }
}

$tempDesktop = Join-Path ([System.IO.Path]::GetTempPath()) ("pulse-shortcut-test-" + [Guid]::NewGuid())
New-Item -ItemType Directory -Path $tempDesktop | Out-Null
try {
    & $installerPath -DesktopPath $tempDesktop
    $shortcutPath = Join-Path $tempDesktop "Pulse 开发环境.lnk"
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    if ($shortcut.TargetPath -ne $launcherPath) { throw "Shortcut target mismatch." }
    if ($shortcut.WorkingDirectory -ne [string]$repoRoot) { throw "Shortcut working directory mismatch." }
} finally {
    Remove-Item -LiteralPath $tempDesktop -Recurse -Force -ErrorAction SilentlyContinue
}
```

- [x] **Step 2: 运行测试并确认因功能缺失而失败**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\test-dev-launcher.ps1`

Expected: FAIL with `Missing root dev launcher.`

### Task 2: 实现根目录启动器与快捷方式安装器

**Files:**
- Create: `Start-Pulse-Dev.cmd`
- Create: `supplemental/scripts/install-dev-shortcut.ps1`
- Test: `supplemental/scripts/test-dev-launcher.ps1`

- [x] **Step 1: 实现最小根目录启动器**

```batch
@echo off
setlocal
cd /d "%~dp0"
set "DEV_SCRIPT=%~dp0supplemental\scripts\run-hub-dev.ps1"
if not exist "%DEV_SCRIPT%" (
    echo Pulse development script was not found: %DEV_SCRIPT%
    pause
    exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%DEV_SCRIPT%"
if errorlevel 1 (
    echo.
    echo Pulse development environment failed to start.
    pause
    exit /b 1
)
start "" "http://localhost:5173"
exit /b 0
```

- [x] **Step 2: 实现可重复执行的快捷方式安装器**

```powershell
param(
    [string]$DesktopPath = [Environment]::GetFolderPath("Desktop"),
    [string]$ShortcutName = "Pulse 开发环境"
)
$ErrorActionPreference = "Stop"
$repoRoot = [string](Resolve-Path (Join-Path $PSScriptRoot "..\.."))
$launcherPath = Join-Path $repoRoot "Start-Pulse-Dev.cmd"
if (-not (Test-Path -LiteralPath $launcherPath)) { throw "Pulse dev launcher not found: $launcherPath" }
New-Item -ItemType Directory -Force -Path $DesktopPath | Out-Null
$shortcutPath = Join-Path $DesktopPath ($ShortcutName + ".lnk")
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $launcherPath
$shortcut.WorkingDirectory = $repoRoot
$shortcut.Description = "启动 Pulse Hub 与 Web 开发环境"
$shortcut.Save()
Write-Host "Pulse development shortcut created: $shortcutPath"
```

- [x] **Step 3: 运行契约测试并确认通过**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\test-dev-launcher.ps1`

Expected: PASS with `Pulse dev launcher test passed.`

### Task 3: 同步开发入口与版本记录

**Files:**
- Modify: `readme.md`
- Modify: `docs/dev-startup-checklist.md`
- Modify: `docs/local-dev-runbook.md`
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [x] **Step 1: 将日常启动入口改为一键启动器**

README、启动清单和运行手册新增：

```text
双击项目根目录 Start-Pulse-Dev.cmd；首次需要桌面入口时运行 install-dev-shortcut.ps1。
```

保留 `run-hub-dev.ps1 -Restart` 和 `-Stop` 作为维护命令。

- [x] **Step 2: 追加 1.0.6 Web / Hub 更新记录**

在开发记录和关于页 Web / Hub 首项加入：

```text
新增 Windows 开发环境一键启动入口：根目录启动器自动启动或复用 Hub 与 Vite，健康检查成功后打开 Web；桌面快捷方式可重复生成，启动失败会保留真实错误，不再出现只有页面外壳却没有资产数据的假启动。
```

- [x] **Step 3: 运行脚本测试、前端类型检查与构建**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\test-dev-launcher.ps1`

Run: `npm.cmd --prefix internal/site run typecheck`

Run: `npm.cmd --prefix internal/site run build`

Expected: all commands exit `0`.

### Task 4: 创建桌面快捷方式并验证真实启动

**Files:**
- Create outside repository: `%USERPROFILE%\Desktop\Pulse 开发环境.lnk`

- [x] **Step 1: 在当前用户桌面安装快捷方式**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\install-dev-shortcut.ps1`

Expected: 输出实际 `.lnk` 路径。

- [x] **Step 2: 检查快捷方式属性**

使用 `WScript.Shell.CreateShortcut()` 读取 `.lnk`，确认 `TargetPath` 为仓库根目录 `Start-Pulse-Dev.cmd`，`WorkingDirectory` 为仓库根目录。

- [x] **Step 3: 验证服务已运行时重复启动**

Run: `cmd.exe /c Start-Pulse-Dev.cmd`

Expected: exit `0`，`http://127.0.0.1:8090/api/health` 返回 `200`，`5173` 与 `8090` 均有监听，既有服务进程未被强制重启。
