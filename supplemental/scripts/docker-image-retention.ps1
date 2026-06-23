$ErrorActionPreference = "Stop"

function Get-DockerImageRepository {
    param([Parameter(Mandatory = $true)][string]$Image)

    $value = $Image.Trim()
    if ($value.Contains("@")) {
        $value = $value.Split("@", 2)[0]
    }
    $lastSlash = $value.LastIndexOf("/")
    $lastColon = $value.LastIndexOf(":")
    if ($lastColon -gt $lastSlash) {
        return $value.Substring(0, $lastColon)
    }
    return $value
}

function Get-DockerImageTag {
    param([Parameter(Mandatory = $true)][string]$Image)

    $value = $Image.Trim()
    if ($value.Contains("@")) {
        return ""
    }
    $lastSlash = $value.LastIndexOf("/")
    $lastColon = $value.LastIndexOf(":")
    if ($lastColon -gt $lastSlash) {
        return $value.Substring($lastColon + 1)
    }
    return ""
}

function Get-DockerImageVersionInfo {
    param([Parameter(Mandatory = $true)][string]$Tag)

    $normalized = $Tag.Trim().TrimStart("v", "V")
    $parsed = $null
    $isVersion = [System.Version]::TryParse($normalized, [ref]$parsed)

    [pscustomobject]@{
        Tag = $Tag
        IsVersion = $isVersion
        Parsed = if ($isVersion) { $parsed } else { [System.Version]::new(0, 0, 0, 0) }
    }
}

function Select-OldDockerImageTags {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Tags,

        [int]$Limit = 2
    )

    if ($Limit -le 0) {
        return @()
    }

    $ordered = $Tags |
        Where-Object { $_ -and $_ -ne "<none>" -and $_ -ne "latest" } |
        ForEach-Object { Get-DockerImageVersionInfo -Tag $_ } |
        Sort-Object `
            @{ Expression = "IsVersion"; Descending = $true }, `
            @{ Expression = "Parsed"; Descending = $true }, `
            @{ Expression = "Tag"; Descending = $true }

    if (@($ordered).Count -le $Limit) {
        return @()
    }

    return @($ordered | Select-Object -Skip $Limit | ForEach-Object { $_.Tag })
}

function Prune-LocalDockerImageTags {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Repository,

        [int]$Limit = 2
    )

    if ([string]::IsNullOrWhiteSpace($Repository) -or $Limit -le 0) {
        return
    }
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Host "Docker is not available; skip local image retention for $Repository"
        return
    }

    $tags = docker image ls $Repository --format "{{.Tag}}" 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $tags) {
        return
    }

    foreach ($tag in Select-OldDockerImageTags -Tags @($tags) -Limit $Limit) {
        $image = "${Repository}:$tag"
        docker image rm $image | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Pruned old Docker image: $image"
        }
    }
}
