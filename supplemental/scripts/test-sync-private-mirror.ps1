$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "sync-private-mirror.ps1"
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("pulse-mirror-test-" + [guid]::NewGuid().ToString("N"))
$seedRoot = Join-Path $tempRoot "seed"
$sourceBare = Join-Path $tempRoot "public-source.git"
$mirrorBare = Join-Path $tempRoot "private-mirror.git"
$workRoot = Join-Path $tempRoot "work"

function Invoke-Git {
    param([string]$WorkingDirectory, [string[]]$Arguments)
    $output = & git -C $WorkingDirectory @Arguments 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        throw "git $($Arguments -join ' ') failed:`n$output"
    }
    return $output
}

function Invoke-MirrorScript {
    param([string[]]$Arguments)
    $output = & pwsh -NoProfile -File $scriptPath @Arguments 2>&1 | Out-String
    return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = $output }
}

function Assert-RefExists {
    param([string]$Repository, [string]$Ref, [bool]$Expected)
    & git -C $Repository show-ref --verify --quiet $Ref
    $exists = $LASTEXITCODE -eq 0
    if ($exists -ne $Expected) {
        throw "Ref $Ref in $Repository expected existence '$Expected' but found '$exists'."
    }
}

try {
    if (-not (Test-Path -LiteralPath $scriptPath)) {
        throw "Private mirror sync script does not exist: $scriptPath"
    }

    New-Item -ItemType Directory -Path $seedRoot -Force | Out-Null
    Invoke-Git $seedRoot @("init", "-b", "main") | Out-Null
    Invoke-Git $seedRoot @("config", "user.name", "Pulse Test") | Out-Null
    Invoke-Git $seedRoot @("config", "user.email", "pulse-test@example.invalid") | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $seedRoot "docs") | Out-Null
    [System.IO.File]::WriteAllText((Join-Path $seedRoot "README.md"), "Pulse mirror fixture`n", [System.Text.UTF8Encoding]::new($false))
    [System.IO.File]::WriteAllText((Join-Path $seedRoot "docs\public-readiness-report.md"), "# Audit`n`nStatus: ready`n", [System.Text.UTF8Encoding]::new($false))
    Invoke-Git $seedRoot @("add", ".") | Out-Null
    Invoke-Git $seedRoot @("commit", "-m", "initial") | Out-Null
    Invoke-Git $seedRoot @("tag", "v1.0.6-beta.1") | Out-Null
    & git clone --bare $seedRoot $sourceBare *> $null
    if ($LASTEXITCODE -ne 0) { throw "Failed to create source bare repository." }
    & git init --bare $mirrorBare *> $null
    if ($LASTEXITCODE -ne 0) { throw "Failed to create mirror bare repository." }
    & git clone $sourceBare $workRoot *> $null
    if ($LASTEXITCODE -ne 0) { throw "Failed to clone mirror test work repository." }
    Invoke-Git $workRoot @("config", "user.name", "Pulse Test") | Out-Null
    Invoke-Git $workRoot @("config", "user.email", "pulse-test@example.invalid") | Out-Null
    Invoke-Git $workRoot @("remote", "add", "mirror", $mirrorBare) | Out-Null

    $baseArgs = @("-RepositoryRoot", $workRoot, "-SourceRemote", "origin", "-MirrorRemote", "mirror")
    $dryRun = Invoke-MirrorScript $baseArgs
    if ($dryRun.ExitCode -ne 0) { throw "Default mirror dry run failed:`n$($dryRun.Output)" }
    if (-not $dryRun.Output.Contains("[DRY RUN]")) { throw "Default mirror run did not identify itself as dry run." }
    if (-not $dryRun.Output.Contains("refs/heads/main") -or -not $dryRun.Output.Contains("refs/tags/v1.0.6-beta.1")) {
        throw "Dry run did not display the exact branch and tag refs."
    }
    Assert-RefExists $mirrorBare "refs/heads/main" $false
    Assert-RefExists $mirrorBare "refs/tags/v1.0.6-beta.1" $false

    $wrongConfirmation = Invoke-MirrorScript ($baseArgs + @("-Apply", "-ConfirmMirrorUrl", "$mirrorBare-wrong"))
    if ($wrongConfirmation.ExitCode -eq 0) { throw "Mirror apply accepted an incorrect confirmation URL." }
    Assert-RefExists $mirrorBare "refs/heads/main" $false

    $apply = Invoke-MirrorScript ($baseArgs + @("-Apply", "-ConfirmMirrorUrl", $mirrorBare))
    if ($apply.ExitCode -ne 0) { throw "Mirror apply failed:`n$($apply.Output)" }
    if (-not $apply.Output.Contains("[APPLIED]")) { throw "Mirror apply did not report applied state." }
    Assert-RefExists $mirrorBare "refs/heads/main" $true
    Assert-RefExists $mirrorBare "refs/tags/v1.0.6-beta.1" $true

    [System.IO.File]::WriteAllText((Join-Path $workRoot "uncommitted.txt"), "dirty", [System.Text.UTF8Encoding]::new($false))
    $dirty = Invoke-MirrorScript $baseArgs
    if ($dirty.ExitCode -eq 0) { throw "Mirror sync accepted an uncommitted worktree." }
    Remove-Item -LiteralPath (Join-Path $workRoot "uncommitted.txt")

    [System.IO.File]::WriteAllText((Join-Path $workRoot "docs\public-readiness-report.md"), "# Audit`n`nStatus: blocked`n", [System.Text.UTF8Encoding]::new($false))
    Invoke-Git $workRoot @("add", "docs/public-readiness-report.md") | Out-Null
    Invoke-Git $workRoot @("commit", "-m", "block audit") | Out-Null
    $blocked = Invoke-MirrorScript $baseArgs
    if ($blocked.ExitCode -eq 0) { throw "Mirror sync accepted a repository whose audit status is not ready." }

    Write-Host "Private mirror sync contract passed."
} finally {
    $resolvedTemp = [System.IO.Path]::GetFullPath($tempRoot)
    $tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    if ($resolvedTemp.StartsWith($tempBase, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedTemp)) {
        Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
    }
}
