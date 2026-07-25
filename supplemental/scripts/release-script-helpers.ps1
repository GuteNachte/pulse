$script:PulseReleaseScriptsRoot = Split-Path -Parent $PSCommandPath

function Resolve-PulseVersion {
    param([Parameter(Mandatory)][string]$Version)

    $match = [regex]::Match(
        $Version,
        '^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?<suffix>-(?:alpha|beta|rc)\.[1-9]\d*)?$'
    )
    if (-not $match.Success) {
        throw "Version '$Version' must be an explicit semantic version such as 1.0.6 or 1.0.6-beta.1."
    }

    $major = [int]$match.Groups["major"].Value
    $minor = [int]$match.Groups["minor"].Value
    $patch = [int]$match.Groups["patch"].Value
    $baseVersion = "$major.$minor.$patch"

    return [pscustomobject][ordered]@{
        BaseVersion = $baseVersion
        FullVersion = $Version
        AndroidVersionCode = ($major * 10000) + ($minor * 100) + $patch
        IsPrerelease = $match.Groups["suffix"].Success
    }
}

function Assert-ReleaseVersionConsistency {
    param([string]$Version)

    $global:LASTEXITCODE = 0
    & (Join-Path $script:PulseReleaseScriptsRoot "check-version-consistency.ps1") -Version $Version
    $exitCode = $global:LASTEXITCODE
    if (-not $? -or $exitCode -ne 0) {
        throw "Version consistency check failed with exit code $exitCode"
    }
}

function Get-EnabledReleaseSkipFlags {
    param([hashtable]$Flags)

    $enabled = @()
    foreach ($name in $Flags.Keys) {
        if ($Flags[$name]) {
            $enabled += "-$name"
        }
    }
    return $enabled
}

function Assert-ReleaseSkipFlagsAllowed {
    param(
        [string]$Context,
        [hashtable]$Flags,
        [bool]$DryRun
    )

    $skipFlags = @(Get-EnabledReleaseSkipFlags -Flags $Flags)
    if ($skipFlags.Count -gt 0 -and -not $DryRun) {
        throw "Skip flags are only allowed with -DryRun. Refusing incomplete $Context release: $($skipFlags -join ', ')"
    }
}

function Resolve-ReleaseSkipPush {
    param(
        [bool]$SkipPush,
        [bool]$DryRun
    )

    return ($SkipPush -or $DryRun)
}

function Get-ReleaseBuildCommit {
    param([string]$RepoRoot)

    try {
        $commit = git -C $RepoRoot rev-parse --short=12 HEAD 2>$null
        if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($commit)) {
            return $commit.Trim()
        }
    } catch {
    }
    return "unknown"
}

function Get-ReleaseBuildTime {
    return (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
}
