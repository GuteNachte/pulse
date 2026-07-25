$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "docker-image-retention.ps1")

$repository = Get-DockerImageRepository "registry.example.com/infra/pulse-hub:1.0.1"
$tag = Get-DockerImageTag "registry.example.com/infra/pulse-hub:1.0.1"
if ($repository -ne "registry.example.com/infra/pulse-hub" -or $tag -ne "1.0.1") {
    throw "Failed to parse registry image: repository=$repository tag=$tag"
}

$oldTags = @(Select-OldDockerImageTags -Tags @("1.0.0", "1.0.2", "1.0.1", "latest", "<none>") -Limit 2)
if (@($oldTags).Count -ne 1 -or $oldTags[0] -ne "1.0.0") {
    throw "Unexpected old tags: $($oldTags -join ', ')"
}

$oldPrefixedTags = @(Select-OldDockerImageTags -Tags @("v1.0.0", "1.0.2", "1.0.1") -Limit 2)
if (@($oldPrefixedTags).Count -ne 1 -or $oldPrefixedTags[0] -ne "v1.0.0") {
    throw "Unexpected old prefixed tags: $($oldPrefixedTags -join ', ')"
}

Write-Host "Docker image retention test passed."

