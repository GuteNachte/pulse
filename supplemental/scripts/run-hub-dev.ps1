param(
    [string]$DataDir = "pulse_data",
    [int]$HubPort = 8090,
    [int]$VitePort = 5173,
    [string]$HubVersion = "1.0.6-beta.5",
    [string]$GoProxy = "https://goproxy.cn,direct",
    [switch]$Restart,
    [switch]$Stop
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "[dev-hub] $Message"
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

function Sync-AgentReleases {
    param(
        [string]$RepoRoot,
        [string]$DataPath
    )
    $source = Join-Path $RepoRoot "build\releases\agent"
    if (-not (Test-Path $source)) {
        Write-Step "Agent release source not found; run supplemental\scripts\build-agent-v1.ps1 before installing agents"
        return
    }
    $sourceManifest = Join-Path $source "manifest.json"
    $target = Join-Path $DataPath "agent-releases"
    $targetManifest = Join-Path $target "manifest.json"
    if ((Test-Path $sourceManifest) -and (Test-Path $targetManifest)) {
        try {
            $sourceHash = (Get-FileHash -LiteralPath $sourceManifest -Algorithm SHA256).Hash
            $targetHash = (Get-FileHash -LiteralPath $targetManifest -Algorithm SHA256).Hash
            if ($sourceHash -eq $targetHash) {
                Write-Step "Local Agent releases already synced"
                return
            }
        } catch {
        }
    }
    Prune-AgentReleaseDirectory -Root $source -Limit 2
    Remove-AgentReleaseStaleFiles -Root $source
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    Copy-Item -Recurse -Force -Path (Join-Path $source "*") -Destination $target
    Prune-AgentReleaseDirectory -Root $target -Limit 2
    Remove-AgentReleaseStaleFiles -Root $target
    Write-Step "Synced local Agent releases to $target"
}

function Quote-PowerShellSingleQuoted {
    param([string]$Value)
    "'" + ($Value -replace "'", "''") + "'"
}

function Write-LauncherScript {
    param(
        [string]$ScriptPath,
        [string]$FilePath,
        [string[]]$ArgumentList,
        [string]$WorkingDirectory,
        [string]$StandardOutputPath,
        [string]$StandardErrorPath,
        [hashtable]$EnvironmentVariables = @{}
    )
    $argumentsLiteral = "@(" + (($ArgumentList | ForEach-Object { Quote-PowerShellSingleQuoted $_ }) -join ", ") + ")"
    $environmentLines = ""
    foreach ($key in $EnvironmentVariables.Keys) {
        $environmentLines += "`$psi.EnvironmentVariables[$(Quote-PowerShellSingleQuoted $key)] = $(Quote-PowerShellSingleQuoted ([string]$EnvironmentVariables[$key]))`r`n"
    }
    $script = @"
`$ErrorActionPreference = "Stop"
`$psi = [System.Diagnostics.ProcessStartInfo]::new()
`$psi.FileName = $(Quote-PowerShellSingleQuoted $FilePath)
`$psi.Arguments = ($argumentsLiteral | ForEach-Object {
    if (`$_ -match '[\s"]') { '"' + (`$_ -replace '"', '\"') + '"' } else { `$_ }
}) -join ' '
`$psi.WorkingDirectory = $(Quote-PowerShellSingleQuoted $WorkingDirectory)
`$psi.UseShellExecute = `$false
`$psi.CreateNoWindow = `$true
`$psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
`$psi.RedirectStandardOutput = `$true
`$psi.RedirectStandardError = `$true
$environmentLines`$process = [System.Diagnostics.Process]::Start(`$psi)
if (-not `$process) { throw "Failed to start $(Split-Path -Leaf $FilePath)" }
Register-ObjectEvent -InputObject `$process -EventName OutputDataReceived -Action {
    if (`$EventArgs.Data) {
        Add-Content -LiteralPath $(Quote-PowerShellSingleQuoted $StandardOutputPath) -Value `$EventArgs.Data
    }
} | Out-Null
Register-ObjectEvent -InputObject `$process -EventName ErrorDataReceived -Action {
    if (`$EventArgs.Data) {
        Add-Content -LiteralPath $(Quote-PowerShellSingleQuoted $StandardErrorPath) -Value `$EventArgs.Data
    }
} | Out-Null
`$process.BeginOutputReadLine()
`$process.BeginErrorReadLine()
Start-Sleep -Milliseconds 300
`$process.WaitForExit()
"@
    Set-Content -LiteralPath $ScriptPath -Value $script -Encoding UTF8
}

function Reset-DevLogFile {
    param([string]$Path)

    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
    for ($attempt = 1; $attempt -le 10; $attempt++) {
        try {
            if (Test-Path -LiteralPath $Path) {
                Clear-Content -LiteralPath $Path -ErrorAction Stop
            } else {
                New-Item -ItemType File -Force -Path $Path -ErrorAction Stop | Out-Null
            }
            return
        } catch {
            if ($attempt -eq 10) {
                Write-Step "Could not clear log file $Path; continuing with append mode"
                return
            }
            Start-Sleep -Milliseconds 200
        }
    }
}

function Start-DevProcess {
    param(
        [string]$FilePath,
        [string[]]$ArgumentList,
        [string]$WorkingDirectory,
        [string]$StandardOutputPath,
        [string]$StandardErrorPath,
        [string]$LauncherPath,
        [hashtable]$EnvironmentVariables = @{}
    )
    Write-LauncherScript `
        -ScriptPath $LauncherPath `
        -FilePath $FilePath `
        -ArgumentList $ArgumentList `
        -WorkingDirectory $WorkingDirectory `
        -StandardOutputPath $StandardOutputPath `
        -StandardErrorPath $StandardErrorPath `
        -EnvironmentVariables $EnvironmentVariables
    Reset-DevLogFile -Path $StandardOutputPath
    Reset-DevLogFile -Path $StandardErrorPath
    $process = Start-Process `
        -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $LauncherPath) `
        -WorkingDirectory (Split-Path -Parent $LauncherPath) `
        -WindowStyle Hidden `
        -PassThru
    if (-not $process) {
        throw "Failed to start dev launcher: $LauncherPath"
    }
    return $process.Id
}

function Wait-Port {
    param(
        [int]$Port,
        [int]$TimeoutSeconds = 60
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        if ($listener) {
            return $true
        }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)
    return $false
}

function Get-DefaultAgentHubUrl {
    param([int]$Port)
    $udp = $null
    try {
        $udp = [System.Net.Sockets.UdpClient]::new()
        $udp.Connect("8.8.8.8", 80)
        $endpoint = [System.Net.IPEndPoint]$udp.Client.LocalEndPoint
        if ($endpoint.Address -and (Test-AgentHubIPv4Address $endpoint.Address)) {
            return "http://$($endpoint.Address.IPAddressToString):$Port"
        }
    } catch {
    } finally {
        if ($udp) {
            $udp.Dispose()
        }
    }
    $lanAddress = Get-PreferredAgentHubIPv4Address
    if ($lanAddress) {
        return "http://${lanAddress}:$Port"
    }
    return "http://127.0.0.1:$Port"
}

function Get-PreferredAgentHubIPv4Address {
    $configs = Get-NetIPConfiguration |
        Where-Object { $_.IPv4Address -and $_.NetAdapter.Status -eq "Up" } |
        Sort-Object @{ Expression = { if ($_.IPv4DefaultGateway) { 0 } else { 1 } } }, InterfaceAlias
    foreach ($config in $configs) {
        foreach ($address in $config.IPv4Address) {
            if (Test-AgentHubIPv4Address $address.IPAddress) {
                return $address.IPAddress
            }
        }
    }
    return $null
}

function Test-AgentHubIPv4Address {
    param([object]$Address)
    $parsed = $null
    if (-not [System.Net.IPAddress]::TryParse([string]$Address, [ref]$parsed)) {
        return $false
    }
    if ($parsed.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) {
        return $false
    }
    if ([System.Net.IPAddress]::IsLoopback($parsed)) {
        return $false
    }
    $bytes = $parsed.GetAddressBytes()
    if ($bytes[0] -eq 0 -or $bytes[0] -ge 224) {
        return $false
    }
    if ($bytes[0] -eq 169 -and $bytes[1] -eq 254) {
        return $false
    }
    if ($bytes[0] -eq 198 -and ($bytes[1] -eq 18 -or $bytes[1] -eq 19)) {
        return $false
    }
    return (
        $bytes[0] -eq 10 -or
        ($bytes[0] -eq 172 -and $bytes[1] -ge 16 -and $bytes[1] -le 31) -or
        ($bytes[0] -eq 192 -and $bytes[1] -eq 168)
    )
}

function Stop-ProjectDevWrappers {
    param([string]$RepoRoot)
    $escapedRepo = [Regex]::Escape($RepoRoot)
    $patterns = @(
        "$escapedRepo\\internal\\site.*\bnpm-cli\.js\b.*\bdev\b",
        "$escapedRepo\\internal\\site.*\bvite\.js\b",
        "\bgo\.exe\b.*\brun\b.*\./internal/cmd/hub\b",
        "$escapedRepo\\build\\dev\\hub-dev\.exe\b"
    )
    $processes = Get-CimInstance Win32_Process | Where-Object {
        $commandLine = $_.CommandLine
        if (-not $commandLine) {
            return $false
        }
        foreach ($pattern in $patterns) {
            if ($commandLine -match $pattern) {
                return $true
            }
        }
        return $false
    }
    foreach ($process in $processes) {
        Write-Step "Stopping stale dev process $($process.Name) (pid $($process.ProcessId))"
        Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
. (Join-Path $PSScriptRoot "release-script-helpers.ps1")
. (Join-Path $PSScriptRoot "agent-release-retention.ps1")
$siteDir = Join-Path $repoRoot "internal\site"
$dataPath = Join-Path $repoRoot $DataDir
$logDir = Join-Path $repoRoot "build\dev-logs"
$devBinDir = Join-Path $repoRoot "build\dev"
$hubExePath = Join-Path $devBinDir "hub-dev.exe"
$goPath = "C:\Program Files\Go\bin\go.exe"

if (-not (Test-Path $goPath)) {
    $goCommand = Get-Command go -ErrorAction SilentlyContinue
    if (-not $goCommand) {
        throw "Go is not installed. Install Go first, then rerun this script."
    }
    $goPath = $goCommand.Source
}

if (-not (Test-Path $dataPath)) {
    New-Item -ItemType Directory -Force -Path $dataPath | Out-Null
}
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
New-Item -ItemType Directory -Force -Path $devBinDir | Out-Null
Sync-AgentReleases -RepoRoot $repoRoot -DataPath $dataPath

Write-Step "Using Go: $goPath"
& $goPath env -w "GOPROXY=$GoProxy" | Out-Null

$agentHubUrl = if (-not [string]::IsNullOrWhiteSpace($env:PULSE_HUB_AGENT_HUB_URL)) {
    $env:PULSE_HUB_AGENT_HUB_URL
} elseif (-not [string]::IsNullOrWhiteSpace($env:AGENT_HUB_URL)) {
    $env:AGENT_HUB_URL
} else {
    Get-DefaultAgentHubUrl -Port $HubPort
}
$env:PULSE_HUB_AGENT_HUB_URL = $agentHubUrl
$lanAddress = Get-PreferredAgentHubIPv4Address
Write-Step "Agent Hub URL: $agentHubUrl"

if ($Restart) {
    Stop-PortProcess -Port $HubPort
    Stop-PortProcess -Port $VitePort
}

if ($Stop) {
    Stop-PortProcess -Port $HubPort
    Stop-PortProcess -Port $VitePort
    Write-Step "Stopped local dev services"
    return
}

    $docker = Get-Command docker -ErrorAction SilentlyContinue
    if ($docker) {
        try {
            docker info 2>$null | Out-Null
            $existing = docker ps -a --filter "name=^/pulse-hub$" --format "{{.Names}}" 2>$null
            if ($existing -eq "pulse-hub") {
                Write-Step "Removing local Docker container 'pulse-hub' so port $HubPort stays clean"
                docker rm -f pulse-hub | Out-Null
            }
        } catch {
            Write-Step "Docker is not ready; skipping Docker cleanup and continuing with source dev server"
        }
    }

$viteListening = Get-NetTCPConnection -LocalPort $VitePort -State Listen -ErrorAction SilentlyContinue
if (-not $viteListening) {
    Write-Step "Starting Vite on all IPv4 interfaces (port $VitePort)"
    $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
    $viteCli = Join-Path $siteDir "node_modules\vite\bin\vite.js"
    if (-not (Test-Path $viteCli)) {
        throw "Vite CLI not found. Run npm install in internal\site first."
    }
    Start-DevProcess `
        -FilePath $nodePath `
        -ArgumentList @($viteCli, "--host", "0.0.0.0", "--port", "$VitePort") `
        -WorkingDirectory $siteDir `
        -StandardOutputPath (Join-Path $logDir "vite.out.log") `
        -StandardErrorPath (Join-Path $logDir "vite.err.log") `
        -LauncherPath (Join-Path $devBinDir "launch-vite.ps1") | Out-Null
} else {
    Write-Step "Vite is already listening on port $VitePort"
}

if (-not (Wait-Port -Port $VitePort -TimeoutSeconds 60)) {
    throw "Vite did not start listening on port $VitePort."
}

$hubListening = Get-NetTCPConnection -LocalPort $HubPort -State Listen -ErrorAction SilentlyContinue
if (-not $hubListening) {
    Write-Step "Building Hub dev binary"
    $buildCommit = Get-ReleaseBuildCommit -RepoRoot $repoRoot
    $buildTime = Get-ReleaseBuildTime
    & $goPath build -tags development -o $hubExePath -ldflags "-w -s -X gutenacht.site/pulse.Version=$HubVersion -X gutenacht.site/pulse.BuildCommit=$buildCommit -X gutenacht.site/pulse.BuildTime=$buildTime" ./internal/cmd/hub
    Write-Step "Starting Hub dev server on http://127.0.0.1:$HubPort"
    Start-DevProcess `
        -FilePath $hubExePath `
        -ArgumentList @("serve", "--dir=$DataDir", "--http=0.0.0.0:$HubPort") `
        -WorkingDirectory $repoRoot `
        -StandardOutputPath (Join-Path $logDir "hub.out.log") `
        -StandardErrorPath (Join-Path $logDir "hub.err.log") `
        -LauncherPath (Join-Path $devBinDir "launch-hub.ps1") `
        -EnvironmentVariables @{
            PULSE_HUB_AGENT_HUB_URL = $agentHubUrl
            PULSE_DEV_LOCAL_AGENT_AS_HUB = "true"
        } | Out-Null
} else {
    Write-Step "Hub is already listening on port $HubPort"
}

Write-Step "Waiting for Hub health check"
$deadline = (Get-Date).AddSeconds(90)
do {
    Start-Sleep -Seconds 2
    try {
        $health = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri "http://127.0.0.1:$HubPort/api/health"
        if ($health.StatusCode -eq 200) {
            Write-Step "Ready:"
            Write-Step "  Local UI:  http://localhost:$VitePort"
            if ($lanAddress) {
                Write-Step "  LAN UI:    http://${lanAddress}:$VitePort"
                Write-Step "  LAN Hub:   http://${lanAddress}:$HubPort"
            }
            Write-Step "  Local Hub: http://127.0.0.1:$HubPort"
            return
        }
    } catch {
        if ((Get-Date) -gt $deadline) {
            Write-Step "Hub did not become healthy in time. Recent error log:"
            Get-Content (Join-Path $logDir "hub.err.log") -Tail 80 -ErrorAction SilentlyContinue
            throw "Hub health check failed."
        }
    }
} while ($true)


