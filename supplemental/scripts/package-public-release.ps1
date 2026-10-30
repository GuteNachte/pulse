param(
    [Parameter(Mandatory)]
    [string]$Version,
    [Parameter(Mandatory)]
    [string]$HubImage,
    [Parameter(Mandatory)]
    [string]$AgentImage,
    [Parameter(Mandatory)]
    [string]$OutputDirectory,
    [string]$RepositoryRoot = "",
    [string]$WindowsAgentPath = "",
    [string]$AndroidApkPath = "",
    [string]$BuildTimestamp = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = if ([string]::IsNullOrWhiteSpace($RepositoryRoot)) {
    Resolve-Path (Join-Path $PSScriptRoot "..\..")
} else {
    Resolve-Path -LiteralPath $RepositoryRoot
}

. (Join-Path $PSScriptRoot "release-script-helpers.ps1")
$resolvedVersion = Resolve-PulseVersion -Version $Version
$Version = $resolvedVersion.FullVersion
$escapedVersion = [regex]::Escape($Version)

if ($HubImage -notmatch "^ghcr\.io/[a-z0-9_.-]+/pulse-hub:$escapedVersion$") {
    throw "HubImage must be a lowercase GHCR pulse-hub image tagged $Version."
}
if ($AgentImage -notmatch "^ghcr\.io/[a-z0-9_.-]+/pulse-agent:$escapedVersion$") {
    throw "AgentImage must be a lowercase GHCR pulse-agent image tagged $Version."
}

if ([string]::IsNullOrWhiteSpace($WindowsAgentPath)) {
    $WindowsAgentPath = Join-Path $repoRoot "build\releases\agent\$Version\pulse-agent_windows_amd64.exe"
} elseif (-not [System.IO.Path]::IsPathRooted($WindowsAgentPath)) {
    $WindowsAgentPath = Join-Path $repoRoot $WindowsAgentPath
}
if ([string]::IsNullOrWhiteSpace($AndroidApkPath)) {
    $AndroidApkPath = Join-Path $repoRoot "internal\site\android\app\build\outputs\apk\debug\app-debug.apk"
} elseif (-not [System.IO.Path]::IsPathRooted($AndroidApkPath)) {
    $AndroidApkPath = Join-Path $repoRoot $AndroidApkPath
}
if (-not [System.IO.Path]::IsPathRooted($OutputDirectory)) {
    $OutputDirectory = Join-Path $repoRoot $OutputDirectory
}

foreach ($required in @(
    @{ Path = $WindowsAgentPath; Label = "Windows Agent" },
    @{ Path = $AndroidApkPath; Label = "Android APK" },
    @{ Path = (Join-Path $repoRoot "supplemental\docker\hub\docker-compose.yml"); Label = "Hub Compose template" },
    @{ Path = (Join-Path $repoRoot "supplemental\docker\agent\docker-compose.yml"); Label = "Agent Compose template" },
    @{ Path = (Join-Path $repoRoot "LICENSE"); Label = "LICENSE" },
    @{ Path = (Join-Path $repoRoot "THIRD_PARTY_NOTICES.md"); Label = "third-party notices" }
)) {
    if (-not (Test-Path -LiteralPath $required.Path -PathType Leaf)) {
        throw "$($required.Label) is missing: $($required.Path)"
    }
}

$timestamp = if ([string]::IsNullOrWhiteSpace($BuildTimestamp)) {
    Get-ReleaseBuildTime
} else {
    try {
        ([DateTimeOffset]::Parse($BuildTimestamp)).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    } catch {
        throw "BuildTimestamp must be a valid ISO-8601 timestamp."
    }
}

$agentFileName = "pulse-agent-$Version.exe"
$androidFileName = "pulse-android-$Version.apk"
$allowedNames = @(
    $agentFileName,
    $androidFileName,
    "docker-compose.yml",
    "pulse-agent.yml",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
    "release-manifest.json",
    "SHA256SUMS"
)

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$unexpectedEntries = @(Get-ChildItem -LiteralPath $OutputDirectory -Force | Where-Object { $_.Name -notin $allowedNames })
if ($unexpectedEntries.Count -gt 0) {
    throw "OutputDirectory contains files outside the public release allowlist: $($unexpectedEntries.Name -join ', ')"
}

function Set-PublicComposeImages {
    param(
        [string]$SourcePath,
        [string]$DestinationPath,
        [bool]$IncludeHub
    )

    $content = Get-Content -Raw -LiteralPath $SourcePath
    $agentPattern = '(?m)^(?<prefix>\s*image:\s*)\S*/pulse-agent:\S+(?<suffix>\s*)$'
    $agentMatches = [regex]::Matches($content, $agentPattern)
    if ($agentMatches.Count -ne 1) {
        throw "Compose template $SourcePath expected one pulse-agent image, found $($agentMatches.Count)."
    }
    $content = [regex]::Replace($content, $agentPattern, ('${prefix}' + $AgentImage + '${suffix}'))

    $hubPattern = '(?m)^(?<prefix>\s*image:\s*)\S*/pulse-hub:\S+(?<suffix>\s*)$'
    $hubMatches = [regex]::Matches($content, $hubPattern)
    $expectedHubCount = if ($IncludeHub) { 1 } else { 0 }
    if ($hubMatches.Count -ne $expectedHubCount) {
        throw "Compose template $SourcePath expected $expectedHubCount pulse-hub image(s), found $($hubMatches.Count)."
    }
    if ($IncludeHub) {
        $content = [regex]::Replace($content, $hubPattern, ('${prefix}' + $HubImage + '${suffix}'))
    }

    [System.IO.File]::WriteAllText($DestinationPath, $content, [System.Text.UTF8Encoding]::new($false))
}

Copy-Item -LiteralPath $WindowsAgentPath -Destination (Join-Path $OutputDirectory $agentFileName) -Force
Copy-Item -LiteralPath $AndroidApkPath -Destination (Join-Path $OutputDirectory $androidFileName) -Force
Copy-Item -LiteralPath (Join-Path $repoRoot "LICENSE") -Destination (Join-Path $OutputDirectory "LICENSE") -Force
Copy-Item -LiteralPath (Join-Path $repoRoot "THIRD_PARTY_NOTICES.md") -Destination (Join-Path $OutputDirectory "THIRD_PARTY_NOTICES.md") -Force

Set-PublicComposeImages `
    -SourcePath (Join-Path $repoRoot "supplemental\docker\hub\docker-compose.yml") `
    -DestinationPath (Join-Path $OutputDirectory "docker-compose.yml") `
    -IncludeHub $true
Set-PublicComposeImages `
    -SourcePath (Join-Path $repoRoot "supplemental\docker\agent\docker-compose.yml") `
    -DestinationPath (Join-Path $OutputDirectory "pulse-agent.yml") `
    -IncludeHub $false

$artifactNames = @(
    $agentFileName,
    $androidFileName,
    "docker-compose.yml",
    "pulse-agent.yml",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md"
)
$artifacts = foreach ($name in $artifactNames) {
    $path = Join-Path $OutputDirectory $name
    $item = Get-Item -LiteralPath $path
    [ordered]@{
        name = $name
        size = $item.Length
        sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant()
    }
}

$manifest = [ordered]@{
    schema = "pulse.public.release.v1"
    version = $Version
    prerelease = $resolvedVersion.IsPrerelease
    build = [ordered]@{
        commit = Get-ReleaseBuildCommit -RepoRoot $repoRoot
        timestamp = $timestamp
    }
    images = [ordered]@{
        hub = $HubImage
        agent = $AgentImage
    }
    artifacts = @($artifacts)
}
$manifestPath = Join-Path $OutputDirectory "release-manifest.json"
$manifestJson = $manifest | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText($manifestPath, $manifestJson + "`n", [System.Text.UTF8Encoding]::new($false))

$checksumNames = @($artifactNames + "release-manifest.json") | Sort-Object
$checksumLines = foreach ($name in $checksumNames) {
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $OutputDirectory $name)).Hash.ToLowerInvariant()
    "$hash  $name"
}
[System.IO.File]::WriteAllText(
    (Join-Path $OutputDirectory "SHA256SUMS"),
    ($checksumLines -join "`n") + "`n",
    [System.Text.UTF8Encoding]::new($false)
)

Write-Host "Public release package prepared: $OutputDirectory"
