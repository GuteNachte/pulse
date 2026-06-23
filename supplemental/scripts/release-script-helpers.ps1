$script:PulseReleaseScriptsRoot = Split-Path -Parent $PSCommandPath

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
