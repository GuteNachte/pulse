$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
. (Join-Path $PSScriptRoot "android-signing-helpers.ps1")

$result = Assert-AndroidVersionCodeMonotonic `
    -Version "1.0.6-beta.2" `
    -VersionCode 1000602 `
    -RepositoryRoot $repoRoot
if ($result.PreviousMaximum -lt 10006) {
    throw "Android versionCode history did not include the 1.0.6-beta.1 migration baseline."
}

try {
    Assert-AndroidVersionCodeMonotonic `
        -Version "1.0.6-beta.2" `
        -VersionCode 10006 `
        -RepositoryRoot $repoRoot | Out-Null
    throw "Android versionCode monotonic guard accepted the historical beta.1 value."
} catch {
    if ($_.Exception.Message -notlike "*must be greater than published maximum*") {
        throw
    }
}

Write-Host "Android versionCode monotonic contract passed."
