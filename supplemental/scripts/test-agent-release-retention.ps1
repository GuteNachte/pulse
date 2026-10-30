$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "agent-release-retention.ps1")

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("pulse-agent-release-retention-" + [guid]::NewGuid().ToString("N"))
$releaseRoot = Join-Path $tempRoot "build\releases\agent"

try {
    foreach ($version in @("1.0.0", "1.0.1", "1.0.2")) {
        $dir = Join-Path $releaseRoot $version
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
        Set-Content -LiteralPath (Join-Path $dir "manifest.json") -Value "{`"version`":`"$version`"}" -Encoding UTF8
    }

    Prune-AgentReleaseDirectory -Root $releaseRoot -Limit 2

    $remaining = Get-ChildItem -LiteralPath $releaseRoot -Directory | Select-Object -ExpandProperty Name
    $expected = @("1.0.1", "1.0.2")
    if (@($remaining).Count -ne 2 -or @($remaining | Sort-Object) -join "," -ne ($expected -join ",")) {
        throw "Unexpected remaining versions: $($remaining -join ', ')"
    }

    $cleanupRoot = Join-Path $tempRoot "cleanup\agent-releases"
    $cleanupDir = Join-Path $cleanupRoot "1.0.3"
    New-Item -ItemType Directory -Force -Path $cleanupDir | Out-Null
    Set-Content -LiteralPath (Join-Path $cleanupDir "manifest.json") -Value @'
{
  "version": "1.0.3",
  "files": {
    "pulse-agent_windows_amd64.exe": {
      "sha256": "abc123",
      "size": 10
    }
  }
}
'@ -Encoding UTF8
    Set-Content -LiteralPath (Join-Path $cleanupDir "pulse-agent_windows_amd64.exe") -Value "new" -Encoding UTF8
    Set-Content -LiteralPath (Join-Path $cleanupDir "pulse-agent_linux_amd64") -Value "stale" -Encoding UTF8

    Remove-AgentReleaseStaleFiles -Root $cleanupRoot

    if (-not (Test-Path -LiteralPath (Join-Path $cleanupDir "pulse-agent_windows_amd64.exe"))) {
        throw "Manifest-listed Agent release file was removed."
    }
    if (Test-Path -LiteralPath (Join-Path $cleanupDir "pulse-agent_linux_amd64")) {
        throw "Stale Agent release file was not removed."
    }

    Write-Host "Agent release retention test passed."
} finally {
    Remove-Item -Recurse -Force -LiteralPath $tempRoot -ErrorAction SilentlyContinue
}

