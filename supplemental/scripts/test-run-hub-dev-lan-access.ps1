$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "run-hub-dev.ps1"
$script = Get-Content -LiteralPath $scriptPath -Raw -Encoding UTF8

foreach ($required in @(
    '-ArgumentList @($viteCli, "--host", "0.0.0.0", "--port", "$VitePort")',
    '$lanAddress = Get-PreferredAgentHubIPv4Address',
    'LAN UI:'
)) {
    if (-not $script.Contains($required)) {
        throw "run-hub-dev.ps1 is missing LAN access contract: $required"
    }
}

if ($script.Contains('-ArgumentList @($viteCli, "--host", "127.0.0.1", "--port", "$VitePort")')) {
    throw "run-hub-dev.ps1 still binds Vite to the loopback-only address."
}

Write-Host "Hub dev LAN access test passed."
