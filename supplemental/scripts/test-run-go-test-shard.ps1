$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$runner = Join-Path $PSScriptRoot "run-go-test-shard.ps1"

Push-Location $repoRoot
try {
    Remove-Item "Env:PULSE_GO_SHARD_PROCESS_POLLUTION" -ErrorAction SilentlyContinue
    & $runner `
        -Package "./supplemental/testdata/go-shard-isolation" `
        -ShardIndex 0 `
        -ShardCount 1 `
        -Timeout "30s"
    if ($LASTEXITCODE -ne 0) {
        throw "Go shard process-isolation contract failed."
    }
} finally {
    Pop-Location
}

Write-Host "Go shard process-isolation contract passed."
