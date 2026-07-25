param(
    [Parameter(Mandatory)]
    [string]$SourceRemote,
    [Parameter(Mandatory)]
    [string]$MirrorRemote,
    [string]$ConfirmMirrorUrl = "",
    [string]$RepositoryRoot = "",
    [switch]$Apply
)

$ErrorActionPreference = "Stop"

$repoRoot = if ([string]::IsNullOrWhiteSpace($RepositoryRoot)) {
    Resolve-Path (Join-Path $PSScriptRoot "..\..")
} else {
    Resolve-Path -LiteralPath $RepositoryRoot
}

function Invoke-GitCommand {
    param(
        [string[]]$Arguments,
        [switch]$AllowFailure
    )

    $output = & git -C $repoRoot @Arguments 2>&1 | Out-String
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0 -and -not $AllowFailure) {
        throw "git $($Arguments -join ' ') failed with exit code ${exitCode}:`n$output"
    }
    return [pscustomobject]@{ ExitCode = $exitCode; Output = $output.TrimEnd() }
}

$insideWorktree = Invoke-GitCommand @("rev-parse", "--is-inside-work-tree")
if ($insideWorktree.Output.Trim() -ne "true") {
    throw "RepositoryRoot is not a Git worktree: $repoRoot"
}

$status = Invoke-GitCommand @("status", "--porcelain", "--untracked-files=normal")
if (-not [string]::IsNullOrWhiteSpace($status.Output)) {
    throw "Repository has uncommitted or untracked files. Commit or remove them before mirror sync."
}

$auditReportPath = Join-Path $repoRoot "docs\public-readiness-report.md"
if (-not (Test-Path -LiteralPath $auditReportPath -PathType Leaf)) {
    throw "Public readiness report is missing: $auditReportPath"
}
$auditReport = Get-Content -Raw -LiteralPath $auditReportPath
if ($auditReport -notmatch '(?m)^Status: ready\s*$') {
    throw "Public readiness report is not ready. Mirror sync refused."
}

$sourceUrlResult = Invoke-GitCommand @("remote", "get-url", $SourceRemote) -AllowFailure
if ($sourceUrlResult.ExitCode -ne 0) {
    throw "SourceRemote must name a configured Git remote: $SourceRemote"
}
$mirrorUrlResult = Invoke-GitCommand @("remote", "get-url", $MirrorRemote) -AllowFailure
if ($mirrorUrlResult.ExitCode -ne 0) {
    throw "MirrorRemote must name a configured Git remote: $MirrorRemote"
}
$sourceUrl = $sourceUrlResult.Output.Trim()
$mirrorUrl = $mirrorUrlResult.Output.Trim()
if ([string]::Equals($sourceUrl, $mirrorUrl, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "SourceRemote and MirrorRemote resolve to the same URL."
}

if ($Apply) {
    if ([string]::IsNullOrWhiteSpace($ConfirmMirrorUrl)) {
        throw "-Apply requires -ConfirmMirrorUrl with the exact MirrorRemote URL."
    }
    if (-not [string]::Equals($ConfirmMirrorUrl.Trim(), $mirrorUrl, [System.StringComparison]::Ordinal)) {
        throw "ConfirmMirrorUrl does not exactly match MirrorRemote URL. Expected: $mirrorUrl"
    }
}

$headsNamespace = "refs/pulse-mirror/source/heads"
$tagsNamespace = "refs/pulse-mirror/source/tags"
Invoke-GitCommand @(
    "fetch",
    "--prune",
    $SourceRemote,
    "+refs/heads/*:${headsNamespace}/*",
    "+refs/tags/*:${tagsNamespace}/*"
) | Out-Null

$headRefs = @((Invoke-GitCommand @("for-each-ref", "--format=%(refname)", $headsNamespace)).Output -split "`r?`n" | Where-Object { $_ })
$tagRefs = @((Invoke-GitCommand @("for-each-ref", "--format=%(refname)", $tagsNamespace)).Output -split "`r?`n" | Where-Object { $_ })
if ($headRefs.Count -eq 0) {
    throw "SourceRemote has no branches to mirror."
}

Write-Host "Source: $SourceRemote -> $sourceUrl"
Write-Host "Mirror: $MirrorRemote -> $mirrorUrl"
Write-Host "Refs selected for mirror update:"
foreach ($ref in $headRefs) {
    $name = $ref.Substring("$headsNamespace/".Length)
    Write-Host "  $ref -> refs/heads/$name"
}
foreach ($ref in $tagRefs) {
    $name = $ref.Substring("$tagsNamespace/".Length)
    Write-Host "  $ref -> refs/tags/$name"
}

$refspecs = @(
    "+${headsNamespace}/*:refs/heads/*",
    "+${tagsNamespace}/*:refs/tags/*"
)
$preview = Invoke-GitCommand (@("push", "--dry-run", "--porcelain", "--prune", $MirrorRemote) + $refspecs)
if (-not [string]::IsNullOrWhiteSpace($preview.Output)) {
    Write-Host $preview.Output
}

if (-not $Apply) {
    Write-Host "[DRY RUN] No mirror refs were changed. Re-run with -Apply -ConfirmMirrorUrl '$mirrorUrl' after reviewing the ref list."
    exit 0
}

$result = Invoke-GitCommand (@("push", "--porcelain", "--prune", $MirrorRemote) + $refspecs)
if (-not [string]::IsNullOrWhiteSpace($result.Output)) {
    Write-Host $result.Output
}
Write-Host "[APPLIED] Mirrored public Git branches and tags to $mirrorUrl. GitHub Secrets, Actions environments, Issues, Discussions, Releases and Packages were not copied."
