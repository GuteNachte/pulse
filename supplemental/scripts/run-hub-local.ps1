param(
    [string]$Image = "pulse-hub:1.0.6-beta.3",
    [string]$ContainerName = "pulse-hub",
    [string]$DataDir = "pulse_data",
    [int]$Port = 8090,
    [string]$HubVersion = "1.0.6-beta.3",
    [switch]$HostCheck,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "[local-hub] $Message"
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

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
. (Join-Path $PSScriptRoot "release-script-helpers.ps1")
. (Join-Path $PSScriptRoot "agent-release-retention.ps1")
. (Join-Path $PSScriptRoot "docker-image-retention.ps1")
$dataPath = Join-Path $repoRoot $DataDir
$dockerDataPath = (Resolve-Path $dataPath -ErrorAction SilentlyContinue)
$agentHubUrl = if (-not [string]::IsNullOrWhiteSpace($env:PULSE_HUB_AGENT_HUB_URL)) {
    $env:PULSE_HUB_AGENT_HUB_URL
} elseif (-not [string]::IsNullOrWhiteSpace($env:AGENT_HUB_URL)) {
    $env:AGENT_HUB_URL
} else {
    Get-DefaultAgentHubUrl -Port $Port
}

if (-not (Test-Path $dataPath)) {
    New-Item -ItemType Directory -Path $dataPath | Out-Null
}
$dockerDataPath = (Resolve-Path $dataPath).Path.Replace("\", "/")

if (-not $SkipBuild) {
    Prune-AgentReleaseDirectory -Root (Join-Path $repoRoot "build\releases\agent") -Limit 2
    $buildCommit = Get-ReleaseBuildCommit -RepoRoot $repoRoot
    $buildTime = Get-ReleaseBuildTime
    Write-Step "Building $Image"
    docker buildx build --load --provenance=false --platform linux/amd64 --build-arg "HUB_VERSION=$HubVersion" --build-arg "HUB_BUILD_COMMIT=$buildCommit" --build-arg "HUB_BUILD_TIME=$buildTime" -f internal/dockerfile_hub -t $Image .
    Prune-LocalDockerImageTags -Repository (Get-DockerImageRepository $Image) -Limit 2
}

if ($HostCheck) {
    $hostCheckName = "$ContainerName-host-check"
    $hostCheckData = Join-Path $repoRoot "build\host-check-data"
    if (Test-Path $hostCheckData) {
        Remove-Item -Recurse -Force -LiteralPath $hostCheckData
    }
    New-Item -ItemType Directory -Force -Path $hostCheckData | Out-Null
    $dockerHostCheckData = (Resolve-Path $hostCheckData).Path.Replace("\", "/")
    $existingHostCheck = docker ps -a --filter "name=^/$hostCheckName$" --format "{{.Names}}"
    if ($existingHostCheck -eq $hostCheckName) {
        docker rm -f $hostCheckName | Out-Null
    }
    $existingMain = docker ps -a --filter "name=^/$ContainerName$" --format "{{.Names}}"
    if ($existingMain -eq $ContainerName) {
        Write-Step "Temporarily removing $ContainerName so host networking can bind port 8090"
        docker rm -f $ContainerName | Out-Null
    }
    Write-Step "Running host-network check for release-equivalent networking"
    docker run -d `
        --name $hostCheckName `
        --network host `
        -e "PULSE_HUB_AGENT_HUB_URL=$agentHubUrl" `
        -v "${dockerHostCheckData}:/pulse_data" `
        $Image `
        serve --dir=/pulse_data --http=0.0.0.0:8090 | Out-Null
    try {
        Start-Sleep -Seconds 4
        docker exec $hostCheckName /pulse health --url http://127.0.0.1:8090 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Host-network health check failed."
        }
        Write-Step "Host-network check passed inside the container"
    } finally {
        docker rm -f $hostCheckName | Out-Null
        Remove-Item -Recurse -Force -LiteralPath $hostCheckData -ErrorAction SilentlyContinue
    }
    return
}

$existing = docker ps -a --filter "name=^/$ContainerName$" --format "{{.Names}}"
if ($existing -eq $ContainerName) {
    Write-Step "Removing existing container $ContainerName"
    docker rm -f $ContainerName | Out-Null
}
Write-Step "Starting $ContainerName on http://127.0.0.1:$Port"
docker run -d `
    --name $ContainerName `
    --restart unless-stopped `
    -p "127.0.0.1:${Port}:8090" `
    -e "PULSE_HUB_AGENT_HUB_URL=$agentHubUrl" `
    -v "${dockerDataPath}:/pulse_data" `
    $Image `
    serve --dir=/pulse_data --http=0.0.0.0:8090 | Out-Null

Write-Step "Waiting for health check"
Start-Sleep -Seconds 4

$publishedPort = docker port $ContainerName 8090
if (-not $publishedPort) {
    throw "Docker did not publish port 8090 for '$ContainerName'."
}

$health = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 10
if ($health.StatusCode -ne 200) {
    throw "Hub health check failed with status $($health.StatusCode)"
}

docker ps --filter "name=$ContainerName" --format "table {{.ID}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}\t{{.Names}}"
Write-Step "Ready: http://127.0.0.1:$Port"


