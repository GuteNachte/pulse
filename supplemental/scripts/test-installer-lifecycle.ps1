param(
    [string]$Compiler = "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
    [switch]$Rebuild
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-NoReparseAncestor([string]$Path) {
    $current = [IO.Path]::GetFullPath($Path)
    while ($current) {
        $item = $null
        try {
            $item = Get-Item -LiteralPath $current -Force -ErrorAction Stop
        } catch [System.Management.Automation.ItemNotFoundException] {
            # Missing output directories are allowed; still inspect their parents.
        }
        if ($null -ne $item -and ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "Refusing linked test path: $current"
        }
        if ($null -ne $item -and -not $item.PSIsContainer) {
            throw "Expected test directory: $current"
        }
        $current = [IO.Path]::GetDirectoryName($current)
    }
}

 $repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
 $output = Join-Path $repo 'build\installer-recovery-check'
# Check before compilation writes output, not only after the experiment.
Assert-NoReparseAncestor $output
 $testExe = Join-Path $output 'Pulse-Rollback-Lifecycle-Test.exe'
if ($Rebuild) {
    & $Compiler (Join-Path $repo 'windows\installer\rollback-lifecycle-test.iss')
    if ($LASTEXITCODE -ne 0) { throw 'Lifecycle compilation failed' }
    Assert-NoReparseAncestor $output
} elseif (-not (Test-Path -LiteralPath $testExe -PathType Leaf)) {
    throw 'Compiled lifecycle test is missing. Run again with -Rebuild.'
}
 $exeItem = Get-Item -LiteralPath $testExe -Force
if ($exeItem.PSIsContainer -or ($exeItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Expected an ordinary test executable' }
 $log = Join-Path $output ('lifecycle-check-' + [guid]::NewGuid().ToString('N') + '.log')
 $process = Start-Process -FilePath $testExe -ArgumentList ('/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /LOG="' + $log + '"') -WindowStyle Hidden -PassThru
if (-not $process.WaitForExit(60000)) { throw "Experiment still running; do not relaunch. Log: $log" }
 $process.Refresh()
if ($process.ExitCode -ne 5) { throw "Expected file-error cancellation (5), got $($process.ExitCode). Log: $log" }
 $text = Get-Content -LiteralPath $log -Raw
foreach ($marker in @('LIFECYCLE_SECOND_FIXTURE_LOCKED','LIFECYCLE_LOCK_RELEASED','LIFECYCLE_DEINITIALIZE')) {
    if (-not $text.Contains($marker)) { throw "Missing marker: $marker" }
}
if ($text -match 'LIFECYCLE_INJECTION_FAILED|LIFECYCLE_LOCK_RELEASE_FAILED|LIFECYCLE_INCOMPLETE') { throw 'Incomplete fault injection' }
 $cleanup = $text.IndexOf('Rolling back changes.')
if ($cleanup -lt 0 -or $cleanup -ge $text.IndexOf('LIFECYCLE_DEINITIALIZE')) { throw 'Unexpected engine cleanup order' }
 $roots = [regex]::Matches($text, 'LIFECYCLE_ROOT=([^\r\n]+)')
if ($roots.Count -ne 1) { throw 'Expected exactly one fixture directory' }
 $root = [IO.Path]::GetFullPath($roots[0].Groups[1].Value.Trim())
if ([IO.Path]::GetDirectoryName($root) -ne $output -or [IO.Path]::GetFileName($root) -notmatch '^lifecycle-\d{8}-\d{6}$') { throw 'Unexpected fixture path' }
Assert-NoReparseAncestor $root
 $expectedNew = (Get-FileHash -LiteralPath (Join-Path $repo 'windows\installer\fixtures\lifecycle-new.txt')).Hash
 $sha = [Security.Cryptography.SHA256]::Create()
try { $expectedOld = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::ASCII.GetBytes('pulse-lifecycle-old'))).Replace('-', '') } finally { $sha.Dispose() }
foreach ($name in @('first.txt','second.txt')) {
    $file = Get-Item -LiteralPath (Join-Path $root $name)
    if ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Fixture must not be a reparse point' }
    $expected = if ($name -eq 'first.txt') { $expectedNew } else { $expectedOld }
    if ((Get-FileHash -LiteralPath $file.FullName).Hash -ne $expected) { throw "Unexpected post-exit content: $name" }
}
[pscustomobject]@{ Result='Fault reproduced, not recovery verified'; ExitCode=$process.ExitCode; First='new'; Second='old'; Log=$log; FixtureDirectory=$root }
