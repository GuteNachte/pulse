param(
    [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\.."))
)

$ErrorActionPreference = "Stop"

function Assert-Equal {
    param($Actual, $Expected, [string]$Message)
    if ($Actual -ne $Expected) {
        throw "$Message (expected '$Expected', got '$Actual')"
    }
}

function Assert-Contains {
    param([string]$Actual, [string]$Expected, [string]$Message)
    if (-not $Actual.Contains($Expected, [StringComparison]::Ordinal)) {
        throw "$Message (missing '$Expected')"
    }
}

function Assert-NotContains {
    param([string]$Actual, [string]$Forbidden, [string]$Message)
    if ($Actual.Contains($Forbidden, [StringComparison]::OrdinalIgnoreCase)) {
        throw "$Message (found '$Forbidden')"
    }
}

$vercelPath = Join-Path $RepositoryRoot "vercel.json"
if (-not (Test-Path -LiteralPath $vercelPath -PathType Leaf)) {
    throw "Missing Vercel demo configuration: $vercelPath"
}

$rawConfig = Get-Content -LiteralPath $vercelPath -Raw -Encoding UTF8
$config = $rawConfig | ConvertFrom-Json

Assert-Equal $config.framework "vite" "Vercel framework must be Vite"
Assert-Equal $config.outputDirectory "internal/site/dist" "Vercel output directory is incorrect"
Assert-Contains $config.buildCommand "build:demo" "Vercel must use the demo build"
Assert-Equal $config.rewrites[0].destination "/index.html" "SPA fallback is missing"

$globalHeaders = @($config.headers | Where-Object source -eq "/(.*)")[0].headers
$contentSecurityPolicy = ($globalHeaders | Where-Object key -eq "Content-Security-Policy").value
Assert-Contains $contentSecurityPolicy "connect-src 'self'" "CSP must block external API connections"
Assert-NotContains $rawConfig "192.168." "Vercel configuration must not contain private endpoints"

Write-Host "Vercel demo configuration contract passed."
