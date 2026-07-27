$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$packagerPath = Join-Path $PSScriptRoot "package-public-release.ps1"
$version = "1.0.6-beta.1"
$hubImage = "ghcr.io/local-validation/pulse-hub:$version"
$agentImage = "ghcr.io/local-validation/pulse-agent:$version"
$buildTimestamp = "2026-07-25T00:00:00Z"

function Assert-EqualValue {
    param([string]$Label, $Expected, $Actual)
    if ([string]$Expected -ne [string]$Actual) {
        throw "$Label expected '$Expected' but found '$Actual'."
    }
}

function Invoke-PwshFile {
    param([string]$Path, [string[]]$Arguments)
    $output = & pwsh -NoProfile -File $Path @Arguments 2>&1 | Out-String
    return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = $output }
}

function Assert-Success {
    param([string]$Label, $Result)
    if ($Result.ExitCode -ne 0) {
        throw "$Label failed with exit code $($Result.ExitCode):`n$($Result.Output)"
    }
}

function New-PackageFixture {
    $fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("pulse-package-test-" + [guid]::NewGuid().ToString("N"))
    foreach ($relativePath in @(
        "build\releases\agent\$version\pulse-agent_windows_amd64.exe",
        "internal\site\android\app\build\outputs\apk\release\app-release.apk",
        "supplemental\docker\hub\docker-compose.yml",
        "supplemental\docker\agent\docker-compose.yml",
        "LICENSE",
        "THIRD_PARTY_NOTICES.md"
    )) {
        $destination = Join-Path $fixtureRoot $relativePath
        New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
        if ($relativePath -like "*.exe") {
            [System.IO.File]::WriteAllBytes($destination, [byte[]](1, 2, 3, 4))
        } elseif ($relativePath -like "*.apk") {
            [System.IO.File]::WriteAllBytes($destination, [byte[]](5, 6, 7, 8))
        } else {
            Copy-Item -LiteralPath (Join-Path $repoRoot $relativePath) -Destination $destination
        }
    }
    return $fixtureRoot
}

function Get-DirectoryHashes {
    param([string]$Path)
    $result = [ordered]@{}
    foreach ($file in Get-ChildItem -LiteralPath $Path -File | Sort-Object Name) {
        $result[$file.Name] = (Get-FileHash -Algorithm SHA256 -LiteralPath $file.FullName).Hash
    }
    return $result
}

$fixtureRoot = New-PackageFixture
try {
    if (-not (Test-Path -LiteralPath $packagerPath)) {
        throw "Public release packager does not exist: $packagerPath"
    }

    $outputOne = Join-Path $fixtureRoot "output-one"
    $outputTwo = Join-Path $fixtureRoot "output-two"
    $commonArgs = @(
        "-Version", $version,
        "-HubImage", $hubImage,
        "-AgentImage", $agentImage,
        "-RepositoryRoot", $fixtureRoot,
        "-BuildTimestamp", $buildTimestamp
    )

    $first = Invoke-PwshFile $packagerPath ($commonArgs + @("-OutputDirectory", $outputOne))
    Assert-Success "First public package" $first
    $second = Invoke-PwshFile $packagerPath ($commonArgs + @("-OutputDirectory", $outputTwo))
    Assert-Success "Second public package" $second

    $expectedFiles = @(
        "LICENSE",
        "SHA256SUMS",
        "THIRD_PARTY_NOTICES.md",
        "docker-compose.yml",
        "pulse-agent-$version.exe",
        "pulse-agent.yml",
        "pulse-android-$version.apk",
        "release-manifest.json"
    ) | Sort-Object
    $actualFiles = @(Get-ChildItem -LiteralPath $outputOne -File | Select-Object -ExpandProperty Name | Sort-Object)
    Assert-EqualValue "Packaged file count" $expectedFiles.Count $actualFiles.Count
    Assert-EqualValue "Packaged allowlist" ($expectedFiles -join "|") ($actualFiles -join "|")

    $manifest = Get-Content -Raw -LiteralPath (Join-Path $outputOne "release-manifest.json") | ConvertFrom-Json
    Assert-EqualValue "Manifest schema" "pulse.public.release.v1" $manifest.schema
    Assert-EqualValue "Manifest version" $version $manifest.version
    $manifestTimestamp = ([DateTimeOffset]$manifest.build.timestamp).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    Assert-EqualValue "Manifest timestamp" $buildTimestamp $manifestTimestamp
    Assert-EqualValue "Manifest Hub image" $hubImage $manifest.images.hub
    Assert-EqualValue "Manifest Agent image" $agentImage $manifest.images.agent
    Assert-EqualValue "Manifest artifact count" 6 @($manifest.artifacts).Count

    $allText = (Get-ChildItem -LiteralPath $outputOne -File | ForEach-Object {
        if ($_.Extension -notin @(".exe", ".apk")) { Get-Content -Raw -LiteralPath $_.FullName }
    }) -join "`n"
    if ($allText.Contains("registry.example.com")) {
        throw "Public package retained the source registry placeholder."
    }
    if (-not $allText.Contains($hubImage) -or -not $allText.Contains($agentImage)) {
        throw "Public Compose files do not contain the requested image names."
    }

    $checksumLines = @(Get-Content -LiteralPath (Join-Path $outputOne "SHA256SUMS"))
    Assert-EqualValue "Checksum line count" 7 $checksumLines.Count
    foreach ($line in $checksumLines) {
        if ($line -notmatch '^[a-f0-9]{64}  \S+$') { throw "Invalid checksum line: $line" }
    }

    $hashesOne = Get-DirectoryHashes $outputOne
    $hashesTwo = Get-DirectoryHashes $outputTwo
    Assert-EqualValue "Reproducible file set" ($hashesOne.Keys -join "|") ($hashesTwo.Keys -join "|")
    foreach ($name in $hashesOne.Keys) {
        Assert-EqualValue "Reproducible hash $name" $hashesOne[$name] $hashesTwo[$name]
    }

    Write-Host "Public release package contract passed."
} finally {
    if (Test-Path -LiteralPath $fixtureRoot) {
        Remove-Item -LiteralPath $fixtureRoot -Recurse -Force
    }
}
