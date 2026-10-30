param(
    [string]$DataDir = "pulse_data",
    [int]$HubPort = 8090,
    [string]$HubVersion = "",
    [switch]$Stop,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "[preview] $Message"
}

function Stop-PortProcess {
    param([int]$Port)
    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($connection in $connections) {
        $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
        if ($process) {
            Write-Step "Stopping $($process.ProcessName) on port $Port (pid $($process.Id))"
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            try {
                $process | Wait-Process -Timeout 5 -ErrorAction SilentlyContinue
            } catch {
            }
        }
    }
}

function Get-PreferredHubUrl {
    param([int]$Port)
    try {
        $udp = [System.Net.Sockets.UdpClient]::new()
        $udp.Connect("8.8.8.8", 80)
        $address = $udp.Client.LocalEndPoint.Address.ToString()
        $udp.Dispose()
        if ($address -and $address -ne "0.0.0.0") {
            return "http://${address}:$Port"
        }
    } catch {
    }
    return "http://127.0.0.1:$Port"
}

function Wait-PortFree {
    param(
        [int]$Port,
        [int]$TimeoutSeconds = 10
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ($true) {
        $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        if (-not $listener) {
            return $true
        }
        if ((Get-Date) -gt $deadline) {
            return $false
        }
        Start-Sleep -Milliseconds 300
    }
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$siteDir = Join-Path $repoRoot "internal\site"
$dataPath = Join-Path $repoRoot $DataDir
$previewDir = Join-Path $repoRoot "build\preview"
$logDir = Join-Path $repoRoot "build\preview-logs"
$previewExe = Join-Path $previewDir "pulse-hub-preview.exe"

if ([string]::IsNullOrWhiteSpace($HubVersion)) {
    $versionSource = Join-Path $repoRoot "pulse.go"
    $versionMatch = Select-String -Path $versionSource -Pattern 'var Version = "([^"]+)"' | Select-Object -First 1
    $HubVersion = if ($versionMatch) { $versionMatch.Matches[0].Groups[1].Value } else { "1.0.6" }
}

if ($Stop) {
    Stop-PortProcess -Port $HubPort
    Write-Step "Stopped production preview on port $HubPort"
    return
}

$goCommand = Get-Command go -ErrorAction SilentlyContinue
if (-not $goCommand) {
    throw "Go is not installed. Install Go first, then rerun this script."
}
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCommand) {
    throw "npm.cmd was not found. Install Node.js first, then rerun this script."
}

# 生产预览与开发环境共用 8090：先停掉开发 Hub 和 Vite，避免端口与 API 混用。
Stop-PortProcess -Port $HubPort
Stop-PortProcess -Port 5173
if (-not (Wait-PortFree -Port $HubPort -TimeoutSeconds 10)) {
    Stop-PortProcess -Port $HubPort
    if (-not (Wait-PortFree -Port $HubPort -TimeoutSeconds 5)) {
        throw "Port $HubPort is still in use. Stop the process holding it and retry."
    }
}

if (-not $SkipBuild) {
    Write-Step "Building production frontend"
    Push-Location $siteDir
    try {
        & $npmCommand.Source run build
        if ($LASTEXITCODE -ne 0) {
            throw "Frontend build failed."
        }
    } finally {
        Pop-Location
    }

    Write-Step "Building production Hub binary (embeds internal/site/dist)"
    New-Item -ItemType Directory -Force -Path $previewDir | Out-Null
    Push-Location $repoRoot
    try {
        & $goCommand.Source build -o $previewExe -ldflags "-w -s -X gutenacht.site/pulse.Version=$HubVersion" ./internal/cmd/hub
        if ($LASTEXITCODE -ne 0) {
            throw "Hub build failed."
        }
    } finally {
        Pop-Location
    }
} elseif (-not (Test-Path -LiteralPath $previewExe)) {
    throw "Preview binary not found at $previewExe. Run without -SkipBuild first."
}

New-Item -ItemType Directory -Force -Path $dataPath | Out-Null
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$env:PULSE_HUB_AGENT_HUB_URL = Get-PreferredHubUrl -Port $HubPort

Write-Step "Starting production preview Hub on http://127.0.0.1:$HubPort"
$previewProcess = Start-Process `
    -FilePath $previewExe `
    -ArgumentList @("serve", "--dir=$dataPath", "--http=0.0.0.0:$HubPort") `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDir "hub.out.log") `
    -RedirectStandardError (Join-Path $logDir "hub.err.log") `
    -PassThru

$deadline = (Get-Date).AddSeconds(90)
while ($true) {
    Start-Sleep -Seconds 1
    if ($previewProcess.HasExited) {
        Write-Step "Preview Hub exited before becoming healthy. Recent error log:"
        Get-Content (Join-Path $logDir "hub.err.log") -Tail 80 -ErrorAction SilentlyContinue
        throw "Production preview failed to start."
    }
    try {
        $health = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri "http://127.0.0.1:$HubPort/api/health"
        if ($health.StatusCode -eq 200) {
            break
        }
    } catch {
        if ((Get-Date) -gt $deadline) {
            Stop-Process -Id $previewProcess.Id -Force -ErrorAction SilentlyContinue
            Write-Step "Hub did not become healthy in time. Recent error log:"
            Get-Content (Join-Path $logDir "hub.err.log") -Tail 80 -ErrorAction SilentlyContinue
            throw "Production preview failed to start."
        }
    }
}

$listener = Get-NetTCPConnection -LocalPort $HubPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $listener -or $listener.OwningProcess -ne $previewProcess.Id) {
    Stop-Process -Id $previewProcess.Id -Force -ErrorAction SilentlyContinue
    throw "Port $HubPort is served by another process; production preview did not bind it."
}

Write-Step "Ready: http://localhost:$HubPort (production build, no Vite)"
Write-Step "Stop with: powershell -NoProfile -ExecutionPolicy Bypass -File supplemental/scripts/run-hub-preview.ps1 -Stop"
Write-Step "Back to development: run Start-Pulse-Dev.cmd"
Start-Process "http://localhost:$HubPort"
