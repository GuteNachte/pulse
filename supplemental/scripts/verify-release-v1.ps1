param(
    [string]$Version = "1.0.6",
    [string]$HubImage = "",
    [string]$LinuxAgentImage = "",
    [string]$BuildDir = "build/releases/agent",
    [string]$DataDir = "pulse_data",
    [string]$HubUrl = "",
    [switch]$SkipRegistry,
    [switch]$SkipAgentArtifacts,
    [switch]$SkipAndroidApk
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
. (Join-Path $PSScriptRoot "release-script-helpers.ps1")

function Add-VerifyFailure {
    param(
        [System.Collections.Generic.List[string]]$Failures,
        [string]$Message
    )
    $Failures.Add($Message) | Out-Null
}

function Assert-FileExists {
    param(
        [System.Collections.Generic.List[string]]$Failures,
        [string]$Path,
        [string]$Label
    )
    if (-not (Test-Path -LiteralPath $Path)) {
        Add-VerifyFailure $Failures "$Label missing: $Path"
        return $false
    }
    Write-Host "[OK] $Label exists"
    return $true
}

function Assert-TextContains {
    param(
        [System.Collections.Generic.List[string]]$Failures,
        [string]$Label,
        [string]$Text,
        [string]$Expected
    )
    if ($Text -notlike "*$Expected*") {
        Add-VerifyFailure $Failures "$Label expected to contain '$Expected' but got '$Text'"
        return
    }
    Write-Host "[OK] $Label contains $Expected"
}

function Assert-EqualValue {
    param(
        [System.Collections.Generic.List[string]]$Failures,
        [string]$Label,
        [object]$Expected,
        [object]$Actual
    )
    if ([string]$Actual -ne [string]$Expected) {
        Add-VerifyFailure $Failures "$Label expected '$Expected' but found '$Actual'"
        return
    }
    Write-Host "[OK] $Label = $Expected"
}

function Test-DockerImageTag {
    param(
        [System.Collections.Generic.List[string]]$Failures,
        [string]$Image,
        [string]$Label
    )
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Add-VerifyFailure $Failures "Docker is required to verify $Label image tag: $Image"
        return
    }

    docker manifest inspect $Image *> $null
    if ($LASTEXITCODE -ne 0) {
        Add-VerifyFailure $Failures "$Label image tag is not inspectable: $Image"
        return
    }
    Write-Host "[OK] $Label image tag exists: $Image"
}

function Test-AgentArtifactManifest {
    param(
        [System.Collections.Generic.List[string]]$Failures,
        [string]$ManifestPath,
        [string]$AgentPath,
        [string]$Label
    )
    if (-not (Assert-FileExists $Failures $ManifestPath "$Label manifest")) {
        return
    }
    $manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
    Assert-EqualValue $Failures "$Label manifest version" $Version $manifest.version
    if ($null -eq $manifest.files."pulse-agent_windows_amd64.exe") {
        Add-VerifyFailure $Failures "$Label manifest does not include pulse-agent_windows_amd64.exe"
        return
    }
    if (-not (Test-Path -LiteralPath $AgentPath)) {
        Add-VerifyFailure $Failures "$Label Windows Agent missing for manifest hash check: $AgentPath"
        return
    }
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $AgentPath).Hash.ToLowerInvariant()
    Assert-EqualValue $Failures "$Label Windows Agent sha256" $manifest.files."pulse-agent_windows_amd64.exe".sha256 $hash
}

function Test-AndroidApkVersion {
    param([System.Collections.Generic.List[string]]$Failures)

    $metadataPath = Join-Path $repoRoot "internal\site\android\app\build\outputs\apk\debug\output-metadata.json"
    $apkPath = Join-Path $repoRoot "internal\site\android\app\build\outputs\apk\debug\app-debug.apk"
    if (-not (Assert-FileExists $Failures $metadataPath "Android APK metadata")) {
        return
    }
    Assert-FileExists $Failures $apkPath "Android debug APK" | Out-Null
    $metadata = Get-Content -Raw -LiteralPath $metadataPath | ConvertFrom-Json
    $element = @($metadata.elements)[0]
    if ($null -eq $element) {
        Add-VerifyFailure $Failures "Android APK metadata has no elements"
        return
    }
    $parts = $Version.Split(".")
    $expectedCode = ([int]$parts[0] * 10000) + ([int]$parts[1] * 100) + [int]$parts[2]
    Assert-EqualValue $Failures "Android APK versionName" $Version $element.versionName
    Assert-EqualValue $Failures "Android APK versionCode" $expectedCode $element.versionCode
}

function Test-HubRuntime {
    param(
        [System.Collections.Generic.List[string]]$Failures,
        [string]$Url
    )
    $base = $Url.TrimEnd("/")
    if ([string]::IsNullOrWhiteSpace($base)) {
        return
    }
    try {
        Invoke-WebRequest -Uri "$base/api/health" -UseBasicParsing -TimeoutSec 10 | Out-Null
        Write-Host "[OK] Hub health reachable: $base/api/health"
    } catch {
        Add-VerifyFailure $Failures "Hub health is not reachable at $base/api/health: $($_.Exception.Message)"
        return
    }
    try {
        $publicInfo = Invoke-RestMethod -Uri "$base/api/pulse/public-info" -TimeoutSec 10
        Assert-EqualValue $Failures "Hub runtime version" $Version $publicInfo.v
    } catch {
        Add-VerifyFailure $Failures "Hub public-info check failed at $base/api/pulse/public-info: $($_.Exception.Message)"
    }
}

if ([string]::IsNullOrWhiteSpace($HubImage)) {
    $HubImage = "registry.example.com/infra/pulse-hub:$Version"
}
if ([string]::IsNullOrWhiteSpace($LinuxAgentImage)) {
    $LinuxAgentImage = "registry.example.com/infra/pulse-agent:$Version"
}

$failures = [System.Collections.Generic.List[string]]::new()

Push-Location $repoRoot
try {
    Assert-ReleaseVersionConsistency -Version $Version

    if (-not $SkipAgentArtifacts) {
        $agentDir = Join-Path $repoRoot (Join-Path $BuildDir $Version)
        $agentPath = Join-Path $agentDir "pulse-agent_windows_amd64.exe"
        if (Assert-FileExists $failures $agentPath "Windows Agent artifact") {
            $agentVersion = & $agentPath --version
            if ($LASTEXITCODE -ne 0) {
                Add-VerifyFailure $failures "Windows Agent --version failed with exit code $LASTEXITCODE"
            } else {
                Assert-TextContains $failures "Windows Agent --version" ($agentVersion -join " ") $Version
            }
        }
        Test-AgentArtifactManifest $failures (Join-Path $agentDir "manifest.json") $agentPath "build release"
        Test-AgentArtifactManifest $failures (Join-Path $repoRoot (Join-Path $DataDir "agent-releases\$Version\manifest.json")) $agentPath "Hub data release"
    }

    if (-not $SkipAndroidApk) {
        Test-AndroidApkVersion $failures
    }

    if (-not $SkipRegistry) {
        Test-DockerImageTag $failures $HubImage "Hub"
        Test-DockerImageTag $failures $LinuxAgentImage "Linux Agent"
    }

    Test-HubRuntime $failures $HubUrl
} finally {
    Pop-Location
}

if ($failures.Count -gt 0) {
    Write-Host ""
    Write-Host "Release verification failed:" -ForegroundColor Red
    foreach ($failure in $failures) {
        Write-Host "  - $failure" -ForegroundColor Red
    }
    exit 1
}

Write-Host ""
Write-Host "Release verification passed for $Version."
