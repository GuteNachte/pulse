param(
    [Parameter(Mandatory = $true)]
    [ValidateRange(0, 1024)]
    [int]$ShardIndex,

    [Parameter(Mandatory = $true)]
    [ValidateRange(1, 1024)]
    [int]$ShardCount,

    [string]$Package = "./internal/hub",

    [ValidatePattern('^\d+(?:ms|s|m|h)$')]
    [string]$Timeout = "600s",

    [switch]$ListOnly
)

$ErrorActionPreference = "Stop"

if ($ShardIndex -ge $ShardCount) {
    throw "ShardIndex must be less than ShardCount."
}

$listOutput = @(& go test -tags=testing -list '^Test' $Package)
if ($LASTEXITCODE -ne 0) {
    throw "Unable to list tests for package $Package."
}

$tests = @($listOutput | Where-Object { $_ -match '^Test\S+$' })
if ($tests.Count -eq 0) {
    throw "No top-level tests were found for package $Package."
}

$selectedTests = for ($index = $ShardIndex; $index -lt $tests.Count; $index += $ShardCount) {
    $tests[$index]
}
if ($selectedTests.Count -eq 0) {
    throw "Shard $ShardIndex of $ShardCount does not contain any tests."
}

if ($ListOnly) {
    $selectedTests
    return
}

$escapedTests = $selectedTests | ForEach-Object { [regex]::Escape($_) }
$runPattern = '^(?:' + ($escapedTests -join '|') + ')$'
Write-Host "Running $($selectedTests.Count) tests from shard $ShardIndex of $ShardCount for $Package."

& go test -tags=testing -count=1 "-timeout=$Timeout" -run $runPattern $Package
if ($LASTEXITCODE -ne 0) {
    throw "Go test shard $ShardIndex of $ShardCount failed for package $Package."
}
