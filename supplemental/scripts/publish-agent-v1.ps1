param(
    [string]$Version = "1.0.6-beta.2",
    [string]$BuildDir = "build/releases/agent",
    [string]$DataDir = "pulse_data",
    [string]$LinuxImage = "",
    [switch]$SkipLinuxImageBuild,
    [switch]$SkipPush,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "release-script-helpers.ps1")

Assert-ReleaseSkipFlagsAllowed -Context "Agent" -DryRun $DryRun -Flags @{
    SkipPush = $SkipPush
    SkipLinuxImageBuild = $SkipLinuxImageBuild
}
$SkipPush = Resolve-ReleaseSkipPush -SkipPush $SkipPush -DryRun $DryRun

$source = Join-Path $BuildDir $Version
$target = Join-Path $DataDir "agent-releases/$Version"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
. (Join-Path $PSScriptRoot "agent-release-retention.ps1")
Assert-ReleaseVersionConsistency -Version $Version

if ([string]::IsNullOrWhiteSpace($LinuxImage)) {
    $LinuxImage = "registry.example.com/infra/pulse-agent:$Version"
}

if (-not (Test-Path $source)) {
    throw "Agent build directory not found: $source"
}

if (-not $SkipLinuxImageBuild) {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw "Docker is required to build Linux Docker agent image. Re-run with -SkipLinuxImageBuild only if the image already exists in your registry."
    }
    Push-Location $repoRoot
    try {
        docker buildx build --load --provenance=false --platform linux/amd64 -f internal/dockerfile_agent -t $LinuxImage --build-arg "AGENT_VERSION=$Version" .
        if ($LASTEXITCODE -ne 0) {
            throw "Docker agent image build failed with exit code $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }
}

if (-not $SkipPush) {
    docker push $LinuxImage
    if ($LASTEXITCODE -ne 0) {
        throw "Docker agent image push failed with exit code $LASTEXITCODE"
    }
}

New-Item -ItemType Directory -Force -Path $target | Out-Null

$files = @(
    "pulse-agent_windows_amd64.exe"
)

foreach ($file in $files) {
    $sourceFile = Join-Path $source $file
    if (-not (Test-Path $sourceFile)) {
        throw "Agent artifact not found: $sourceFile"
    }
    Copy-Item -LiteralPath $sourceFile -Destination (Join-Path $target $file) -Force
}

$manifestFiles = [ordered]@{}
foreach ($file in $files) {
    $targetFile = Join-Path $target $file
    $manifestFiles[$file] = [ordered]@{
        sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $targetFile).Hash.ToLowerInvariant()
        size = (Get-Item -LiteralPath $targetFile).Length
    }
}

$manifestImages = @()
if (-not $SkipPush) {
    $manifestImages += [ordered]@{
        platform = "linux"
        arch = "amd64"
        image = $LinuxImage
        notes = "Linux / NAS Docker agent $Version"
    }
}

$manifest = [ordered]@{
    version = $Version
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    files = $manifestFiles
    images = $manifestImages
}

$manifestJson = $manifest | ConvertTo-Json -Depth 5
$manifestTargets = @(
    (Join-Path $target "manifest.json"),
    (Join-Path $source "manifest.json")
)

foreach ($manifestPath in $manifestTargets) {
    $manifestDir = Split-Path -Parent $manifestPath
    New-Item -ItemType Directory -Force -Path $manifestDir | Out-Null
    [System.IO.File]::WriteAllText(
        (Resolve-Path -LiteralPath $manifestDir).Path + [System.IO.Path]::DirectorySeparatorChar + (Split-Path -Leaf $manifestPath),
        $manifestJson,
        [System.Text.UTF8Encoding]::new($false)
    )
}

Remove-AgentReleaseStaleFiles -Root (Join-Path $repoRoot $BuildDir)
Remove-AgentReleaseStaleFiles -Root (Join-Path $repoRoot (Join-Path $DataDir "agent-releases"))

if ($DryRun) {
    Write-Host "Agent $Version dry run files prepared at $target"
    Write-Host "Agent $Version dry run manifest prepared at $source"
} else {
    Write-Host "Agent $Version files published to $target"
    Write-Host "Agent $Version manifest published to $source"
}
if (-not $SkipPush) {
    Write-Host "Linux Docker image registered as $LinuxImage"
    Write-Host "Linux Docker image pushed: $LinuxImage"
} else {
    Write-Host "Linux Docker image was not registered because -SkipPush was used."
}

Prune-AgentReleaseDirectory -Root (Join-Path $repoRoot $BuildDir) -Limit 2
Prune-AgentReleaseDirectory -Root (Join-Path $repoRoot (Join-Path $DataDir "agent-releases")) -Limit 2

