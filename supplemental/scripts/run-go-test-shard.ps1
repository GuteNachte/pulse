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

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("pulse-go-test-shard-" + [guid]::NewGuid().ToString("N"))
$binaryName = if ($IsWindows -or $env:OS -eq "Windows_NT") { "shard.test.exe" } else { "shard.test" }
$testBinary = Join-Path $tempRoot $binaryName

New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
try {
    & go test -tags=testing -c -o $testBinary $Package
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to compile tests for package $Package."
    }

    $listOutput = @(& $testBinary '-test.list=^Test')
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

    Write-Host "Running $($selectedTests.Count) isolated tests from shard $ShardIndex of $ShardCount for $Package."
    foreach ($testName in $selectedTests) {
        $runPattern = '^(?:' + [regex]::Escape($testName) + ')$'
        Write-Host "Running $testName"
        & $testBinary '-test.count=1' "-test.timeout=$Timeout" "-test.run=$runPattern"
        if ($LASTEXITCODE -ne 0) {
            throw "Go test $testName failed in shard $ShardIndex of $ShardCount for package $Package."
        }
    }
} finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
