$ErrorActionPreference = 'Stop'

$repoRoot = [string](Resolve-Path (Join-Path $PSScriptRoot '..\..'))
$source = Get-Content -LiteralPath (Join-Path $repoRoot 'windows\installer\pulse-agent.iss') -Raw -Encoding UTF8
$failures = [System.Collections.Generic.List[string]]::new()

# Source contracts supplement, but do not replace, real Windows upgrade tests.
$prepare = [regex]::Match($source, '(?s)function PrepareToInstall\(var NeedsRestart: Boolean\): String;.*?(?=\r?\n(?:procedure|function) |\z)').Value

if ($prepare -notmatch 'StopPulseService') {
    $failures.Add('PrepareToInstall must stop and verify the service before file replacement checks.')
}
if ($source -match 'BeforeInstall: StopPulseService') {
    $failures.Add('Stopping only in BeforeInstall is too late for Restart Manager checks.')
}
if ($source -match 'Sleep\(5000\)') {
    $failures.Add('A fixed five-second delay does not verify service shutdown.')
}
if ($source -notmatch 'QueryServiceStatus') {
    $failures.Add('Service shutdown must be verified using the Windows service status API.')
}
if ($prepare -notmatch 'Result\s*:=\s*StopPulseService') {
    $failures.Add('A shutdown failure must be returned to abort installation preparation.')
}

if ($source -notmatch 'procedure DeinitializeSetup') {
    $failures.Add('Canceled preparation must restore a previously running service.')
}
if ($source -notmatch 'ServiceWasRunning' -or $source -notmatch 'FileReplacementStarted') {
    $failures.Add('Recovery must distinguish the original service state and whether file replacement started.')
}

$recovery = Get-Content -LiteralPath (Join-Path $repoRoot 'windows\installer\service-recovery.iss') -Raw -Encoding UTF8
if ($source -notmatch '#include "service-recovery.iss"') {
    $failures.Add('The production installer must include the shared recovery implementation.')
}
$deinitialize = [regex]::Match($source, '(?s)procedure DeinitializeSetup;.*?(?=\r?\n(?:procedure|function) |\z)').Value
if ($recovery -notmatch 'QueryServiceStatus\(Service, Status\)' -or
    $recovery -notmatch 'if Status.CurrentState = 4 then exit' -or
    $recovery -notmatch 'for Attempt := 0 to 60 do' -or
    $recovery -notmatch 'if Attempt < 60 then Sleep\(500\)' -or
    $recovery -notmatch 'CloseServiceHandle\(Service\)' -or
    $recovery -notmatch 'CloseServiceHandle\(Manager\)') {
    $failures.Add('Recovery must poll Running for at most 30 seconds and close query handles.')
}
if ($deinitialize -notmatch '(?s)ServiceWasRunning and .*FileReplacementStarted' -or
    $deinitialize -notmatch 'RecoveryError := WaitForPulseServiceRunning' -or
    $deinitialize -notmatch "if RecoveryError <> '' then begin" -or
    $deinitialize -notmatch "Service recovery verified: pulse-agent is running.") {
    $failures.Add('Recovery success must require verified Running and report verification failures.')
}
if ($source -notmatch 'function PrepareRollback: String;' -or
    $source -notmatch 'RollbackPrepared' -or
    $source -notmatch 'InstallSucceeded' -or
    $source -notmatch 'Rollback restore verified: both binaries restored.' -or
    $source -notmatch 'GetSHA256OfFile\(RollbackDir \+ ''\\pulse-agent\.exe''\)' -or
    $source -notmatch 'GetSHA256OfFile\(RollbackDir \+ ''\\agent-config\.exe''\)') {
    $failures.Add('Installer must prepare and verify a two-binary rollback backup.')
}
if ($source -notmatch 'RollbackPrepared and FileReplacementStarted and \(not InstallSucceeded\)') {
    $failures.Add('Installer must restore binaries after replacement starts but before successful completion.')
}
if ($source -notmatch 'ServiceWasRunning and \(RestoreError = ''''\)') {
    $failures.Add('Installer must not start the service when binary rollback verification fails.')
}
if ($deinitialize -notmatch 'RestoreError := '''';') {
    $failures.Add('Installer must initialize rollback error state before any recovery branch.')
}

if ($failures.Count -gt 0) {
    throw ('Windows installer source contracts failed:' + [Environment]::NewLine + ($failures -join [Environment]::NewLine))
}
Write-Host 'Windows installer source contracts passed. Real installation acceptance is still required.'
