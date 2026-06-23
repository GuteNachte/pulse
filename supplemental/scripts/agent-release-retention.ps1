$ErrorActionPreference = "Stop"

function Get-AgentReleaseVersionInfo {
    param([System.IO.DirectoryInfo]$Directory)

    $name = $Directory.Name
    $normalized = $name.TrimStart("v", "V")
    $parsed = $null
    $isVersion = [System.Version]::TryParse($normalized, [ref]$parsed)

    [pscustomobject]@{
        Directory = $Directory
        Name = $name
        IsVersion = $isVersion
        Parsed = if ($isVersion) { $parsed } else { [System.Version]::new(0, 0, 0, 0) }
    }
}

function Prune-AgentReleaseDirectory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Root,

        [int]$Limit = 2
    )

    if ($Limit -le 0 -or [string]::IsNullOrWhiteSpace($Root) -or -not (Test-Path -LiteralPath $Root)) {
        return
    }

    $resolvedRoot = (Resolve-Path -LiteralPath $Root).Path
    $leaf = Split-Path -Leaf $resolvedRoot
    $parentLeaf = Split-Path -Leaf (Split-Path -Parent $resolvedRoot)
    if ($leaf -ne "agent" -and $leaf -ne "agent-releases") {
        throw "Refusing to prune unexpected Agent release root: $resolvedRoot"
    }
    if ($leaf -eq "agent" -and $parentLeaf -ne "releases") {
        throw "Refusing to prune unexpected build release root: $resolvedRoot"
    }

    $releaseDirs = Get-ChildItem -LiteralPath $resolvedRoot -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^[A-Za-z0-9._-]+$' } |
        ForEach-Object { Get-AgentReleaseVersionInfo -Directory $_ } |
        Sort-Object `
            @{ Expression = "IsVersion"; Descending = $true }, `
            @{ Expression = "Parsed"; Descending = $true }, `
            @{ Expression = "Name"; Descending = $true }

    if (@($releaseDirs).Count -le $Limit) {
        return
    }

    $releaseDirs |
        Select-Object -Skip $Limit |
        ForEach-Object {
            $target = $_.Directory.FullName
            $resolvedTarget = (Resolve-Path -LiteralPath $target).Path
            if (-not $resolvedTarget.StartsWith($resolvedRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
                throw "Refusing to prune path outside Agent release root: $resolvedTarget"
            }
            Remove-Item -Recurse -Force -LiteralPath $resolvedTarget
            Write-Host "Pruned old Agent release: $resolvedTarget"
        }
}

function Remove-AgentReleaseStaleFiles {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Root
    )

    if ([string]::IsNullOrWhiteSpace($Root) -or -not (Test-Path -LiteralPath $Root)) {
        return
    }

    $resolvedRoot = (Resolve-Path -LiteralPath $Root).Path
    $leaf = Split-Path -Leaf $resolvedRoot
    $parentLeaf = Split-Path -Leaf (Split-Path -Parent $resolvedRoot)
    if ($leaf -ne "agent" -and $leaf -ne "agent-releases") {
        throw "Refusing to clean unexpected Agent release root: $resolvedRoot"
    }
    if ($leaf -eq "agent" -and $parentLeaf -ne "releases") {
        throw "Refusing to clean unexpected build release root: $resolvedRoot"
    }

    $releaseDirs = Get-ChildItem -LiteralPath $resolvedRoot -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^[A-Za-z0-9._-]+$' }

    foreach ($releaseDir in $releaseDirs) {
        $manifestPath = Join-Path $releaseDir.FullName "manifest.json"
        if (-not (Test-Path -LiteralPath $manifestPath)) {
            continue
        }

        $manifest = $null
        try {
            $manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
        } catch {
            throw "Failed to parse Agent manifest ${manifestPath}: $($_.Exception.Message)"
        }

        $keepFiles = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
        [void]$keepFiles.Add("manifest.json")
        if ($manifest.files) {
            foreach ($fileName in $manifest.files.PSObject.Properties.Name) {
                [void]$keepFiles.Add($fileName)
            }
        }

        Get-ChildItem -LiteralPath $releaseDir.FullName -File -ErrorAction SilentlyContinue |
            Where-Object { -not $keepFiles.Contains($_.Name) } |
            ForEach-Object {
                Remove-Item -Force -LiteralPath $_.FullName
                Write-Host "Removed stale Agent release file: $($_.FullName)"
            }
    }
}
