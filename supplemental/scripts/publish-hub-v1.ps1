param(
    [string]$Version = "1.0.6",
    [string]$Image = "",
    [switch]$SkipPush,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "release-script-helpers.ps1")

Assert-ReleaseSkipFlagsAllowed -Context "Hub" -DryRun $DryRun -Flags @{
    SkipPush = $SkipPush
}
$SkipPush = Resolve-ReleaseSkipPush -SkipPush $SkipPush -DryRun $DryRun

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
. (Join-Path $PSScriptRoot "agent-release-retention.ps1")
. (Join-Path $PSScriptRoot "docker-image-retention.ps1")
Assert-ReleaseVersionConsistency -Version $Version

if ([string]::IsNullOrWhiteSpace($Image)) {
    $Image = "registry.example.com/infra/pulse-hub:$Version"
}

$repository = Get-DockerImageRepository $Image

Push-Location $repoRoot
try {
    Prune-AgentReleaseDirectory -Root (Join-Path $repoRoot "build\releases\agent") -Limit 2
    $buildCommit = Get-ReleaseBuildCommit -RepoRoot $repoRoot
    $buildTime = Get-ReleaseBuildTime

    docker buildx build --load --provenance=false --platform linux/amd64 --build-arg "HUB_VERSION=$Version" --build-arg "HUB_BUILD_COMMIT=$buildCommit" --build-arg "HUB_BUILD_TIME=$buildTime" -f internal/dockerfile_hub -t $Image .
    if ($LASTEXITCODE -ne 0) {
        throw "Hub image build failed with exit code $LASTEXITCODE"
    }

    if (-not $SkipPush) {
        docker push $Image
        if ($LASTEXITCODE -ne 0) {
            throw "Hub image push failed with exit code $LASTEXITCODE"
        }
    }

    Prune-LocalDockerImageTags -Repository $repository -Limit 2
    if ($DryRun) {
        Write-Host "Hub $Version dry run image prepared: $Image"
    } else {
        Write-Host "Hub $Version image ready: $Image"
    }
} finally {
    Pop-Location
}

