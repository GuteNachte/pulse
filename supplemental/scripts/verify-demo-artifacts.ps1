param(
    [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\.."))
)

$ErrorActionPreference = "Stop"

function Assert-True {
    param(
        [Parameter(Mandatory)][bool]$Condition,
        [Parameter(Mandatory)][string]$Message
    )

    if (-not $Condition) {
        throw $Message
    }
}

function Get-PngDimensions {
    param([Parameter(Mandatory)][string]$Path)

    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $signature = New-Object byte[] 24
        $read = $stream.Read($signature, 0, $signature.Length)
        Assert-True ($read -eq 24) "PNG header is incomplete: $Path"
        Assert-True (($signature[0..7] -join ',') -eq '137,80,78,71,13,10,26,10') "Not a PNG file: $Path"

        [array]::Reverse($signature, 16, 4)
        [array]::Reverse($signature, 20, 4)
        return [pscustomobject]@{
            Width = [BitConverter]::ToUInt32($signature, 16)
            Height = [BitConverter]::ToUInt32($signature, 20)
        }
    }
    finally {
        $stream.Dispose()
    }
}

$repositoryPath = (Resolve-Path -LiteralPath $RepositoryRoot).Path
$screenshots = @(
    "dashboard.png",
    "assets.png",
    "asset-detail.png",
    "network-home.png",
    "network-technology.png",
    "clients.png",
    "containers.png",
    "websites.png"
)

$approvedImages = foreach ($name in $screenshots) {
    [pscustomobject]@{
        Path = Join-Path $repositoryPath "docs\media\screenshots\$name"
        Width = 1600
        Height = 1000
    }
}
$approvedImages += [pscustomobject]@{
    Path = Join-Path $repositoryPath "docs\media\social-preview.png"
    Width = 1280
    Height = 640
}

foreach ($image in $approvedImages) {
    Assert-True (Test-Path -LiteralPath $image.Path -PathType Leaf) "Missing demo image: $($image.Path)"
    Assert-True ((Get-Item -LiteralPath $image.Path).Length -gt 0) "Demo image is empty: $($image.Path)"
    $dimensions = Get-PngDimensions -Path $image.Path
    Assert-True ($dimensions.Width -eq $image.Width -and $dimensions.Height -eq $image.Height) "Unexpected image dimensions for $($image.Path): $($dimensions.Width)x$($dimensions.Height)"
    $hash = (Get-FileHash -LiteralPath $image.Path -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Host "$hash  $($image.Path.Substring($repositoryPath.Length + 1).Replace('\', '/'))"
}

$textPaths = @(
    (Join-Path $repositoryPath "internal\site\src\demo")
    (Join-Path $repositoryPath "readme.md")
    (Join-Path $repositoryPath "README.en.md")
    (Join-Path $repositoryPath "docs\public-demo.md")
) | Where-Object { Test-Path -LiteralPath $_ }

$textFiles = foreach ($path in $textPaths) {
    if (Test-Path -LiteralPath $path -PathType Container) {
        Get-ChildItem -LiteralPath $path -File -Recurse
    }
    else {
        Get-Item -LiteralPath $path
    }
}

$privatePatterns = @(
    @{ Name = "private IPv4"; Pattern = '(?<![\d.])(?:10\.(?:\d{1,3}\.){2}\d{1,3}|192\.168\.(?:\d{1,3}\.)\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.(?:\d{1,3}\.)\d{1,3})(?![\d.])' },
    @{ Name = "personal email"; Pattern = '(?i)\b[A-Z0-9._%+-]+@(?!demo\.example\.com\b|example\.com\b)[A-Z0-9.-]+\.[A-Z]{2,}\b' }
)

foreach ($file in $textFiles) {
    $content = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
    foreach ($rule in $privatePatterns) {
        Assert-True (-not [regex]::IsMatch($content, $rule.Pattern)) "$($rule.Name) found in $($file.FullName)"
    }
}

$siteRoot = Join-Path $repositoryPath "internal\site"
Push-Location $siteRoot
try {
    & npm.cmd run build:demo | Out-Host
    Assert-True ($LASTEXITCODE -eq 0) "Demo build failed."
    $demoMarker = @(Get-ChildItem -LiteralPath "dist" -File -Recurse | Select-String -SimpleMatch "PULSE_DEMO_FIXTURE_V1")
    Assert-True ($demoMarker.Count -gt 0) "Demo fixture marker is missing from the demo build."

    & npm.cmd run build | Out-Host
    Assert-True ($LASTEXITCODE -eq 0) "Production build failed."
    $productionMarker = @(Get-ChildItem -LiteralPath "dist" -File -Recurse | Select-String -SimpleMatch "PULSE_DEMO_FIXTURE_V1")
    Assert-True ($productionMarker.Count -eq 0) "Demo fixture leaked into the production build."
}
finally {
    Pop-Location
}

Write-Host "Demo artifact verification passed."
