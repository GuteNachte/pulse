$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$workflowPath = Join-Path $repoRoot ".github\workflows\public-release.yml"
$qualityWorkflowPath = Join-Path $repoRoot ".github\workflows\quality.yml"
$vulncheckWorkflowPath = Join-Path $repoRoot ".github\workflows\vulncheck.yml"
$sitePackagePath = Join-Path $repoRoot "internal\site\package.json"
$androidGradleWrapperPath = Join-Path $repoRoot "internal\site\android\gradlew"
$runbookPath = Join-Path $repoRoot "docs\public-release-runbook.md"
$readinessReportPath = Join-Path $repoRoot "docs\public-readiness-report.md"
$goTestShardPath = Join-Path $repoRoot "supplemental\scripts\run-go-test-shard.ps1"
$goTestShardContractPath = Join-Path $repoRoot "supplemental\scripts\test-run-go-test-shard.ps1"
$goExecutableMetadataContractPath = Join-Path $repoRoot "supplemental\scripts\test-go-executable-metadata.ps1"

function Assert-Contains {
    param([string]$Label, [string]$Content, [string]$Needle)
    if (-not $Content.Contains($Needle)) {
        throw "$Label is missing required text: $Needle"
    }
}

if (-not (Test-Path -LiteralPath $workflowPath)) {
    throw "Public release workflow does not exist: $workflowPath"
}
if (-not (Test-Path -LiteralPath $runbookPath)) {
    throw "Public release runbook does not exist: $runbookPath"
}
foreach ($requiredPath in @($qualityWorkflowPath, $vulncheckWorkflowPath, $sitePackagePath, $androidGradleWrapperPath, $readinessReportPath, $goTestShardPath, $goTestShardContractPath, $goExecutableMetadataContractPath)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Public CI contract input does not exist: $requiredPath"
    }
}

$gradleWrapperIndex = git -C $repoRoot ls-files --stage -- internal/site/android/gradlew
if ($LASTEXITCODE -ne 0 -or $gradleWrapperIndex -notmatch '^100755\s') {
    throw "Android Gradle wrapper must be tracked as executable so CI chmod keeps the release tree clean."
}

$readinessReport = Get-Content -Raw -LiteralPath $readinessReportPath
if ($readinessReport -notmatch '(?m)^Status: ready\s*$') {
    throw "Public readiness report must satisfy the release gate with an exact Status: ready line."
}

$workflow = Get-Content -Raw -LiteralPath $workflowPath
foreach ($required in @(
    '"v*.*.*-*.*"',
    "workflow_dispatch:",
    "default: false",
    "permissions:",
    "contents: read",
    "docs/public-readiness-report.md",
    "Status: ready",
    "audit-public-repository.ps1",
    "check-version-consistency.ps1",
    "test-package-public-release.ps1",
    "test-release-image-reference.ps1",
    "run-go-test-shard.ps1",
    "package-public-release.ps1",
    "github.repository_owner",
    "PUBLIC_RELEASE_ENABLED",
    "environment: public-release",
    "packages: write",
    "contents: write",
    "--prerelease",
    "SHA256SUMS"
)) {
    Assert-Contains "Public release workflow" $workflow $required
}
foreach ($required in @(
    "ANDROID_RELEASE_KEYSTORE_BASE64",
    "ANDROID_RELEASE_STORE_PASSWORD",
    "ANDROID_RELEASE_KEY_ALIAS",
    "ANDROID_RELEASE_KEY_PASSWORD",
    "build-android-release.ps1",
    "if: always()"
)) {
    Assert-Contains "Signed Android release workflow" $workflow $required
}
if ($workflow.Contains("assembleDebug")) {
    throw "Public release workflow must not build a Debug APK."
}
$publishJobIndex = $workflow.IndexOf("  publish:", [System.StringComparison]::Ordinal)
$androidBuildIndex = $workflow.IndexOf("-File supplemental/scripts/build-android-release.ps1", [System.StringComparison]::Ordinal)
$packageIndex = $workflow.IndexOf("-File supplemental/scripts/package-public-release.ps1", [System.StringComparison]::Ordinal)
$verifyIndex = $workflow.IndexOf("-File supplemental/scripts/verify-release-v1.ps1", [System.StringComparison]::Ordinal)
if ($publishJobIndex -lt 0 -or $androidBuildIndex -lt $publishJobIndex -or $packageIndex -lt $androidBuildIndex -or $verifyIndex -lt $packageIndex) {
    throw "Signed Android build, public packaging and final verification must run in order after the protected publish job begins."
}
foreach ($secretName in @(
    "ANDROID_RELEASE_KEYSTORE_BASE64",
    "ANDROID_RELEASE_STORE_PASSWORD",
    "ANDROID_RELEASE_KEY_ALIAS",
    "ANDROID_RELEASE_KEY_PASSWORD"
)) {
    $secretOffset = $workflow.IndexOf("secrets.$secretName", [System.StringComparison]::Ordinal)
    if ($secretOffset -lt $publishJobIndex) {
        throw "Android signing secret $secretName is referenced before the protected publish job."
    }
}
Assert-Contains "Public release workflow" $workflow "Run non-Hub Go tests"
Assert-Contains "Public release workflow" $workflow "-ShardCount 4"
Assert-Contains "Public release workflow" $workflow "-Timeout 600s"
$exitGuard = 'if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }'
if ([regex]::Matches($workflow, [regex]::Escape($exitGuard)).Count -lt 4) {
    throw "Public release workflow must stop after every release packaging subprocess failure."
}
if ($workflow.Contains("registry.example.com")) {
    throw "Public release workflow contains the source registry placeholder."
}
if ($workflow -match '(?m)^\s*pull_request:\s*$') {
    throw "Public release workflow must not publish from pull requests."
}
if ($workflow -match '(?m)^\s*uses:\s*\S+@v\d+(?:\.\d+)*\s*$') {
    throw "Public release workflow contains a mutable action version tag: $($Matches[0].Trim())"
}
if ($workflow -match '(?m)ghcr\.io/[^$\r\n]+/pulse-(?:hub|agent)') {
    throw "Public release workflow hardcodes a GHCR owner instead of deriving github.repository_owner."
}
$webBuildIndex = $workflow.IndexOf("npm --prefix internal/site run build", [System.StringComparison]::Ordinal)
$goVetIndex = $workflow.IndexOf("go vet -tags=testing ./...", [System.StringComparison]::Ordinal)
if ($webBuildIndex -lt 0 -or $goVetIndex -lt 0 -or $webBuildIndex -gt $goVetIndex) {
    throw "Public release workflow must build internal/site/dist before Go vet and tests consume the embedded site."
}
if (($workflow | Select-String -Pattern 'go-version: 1\.26\.5' -AllMatches).Matches.Count -ne 2) {
    throw "Public release workflow must use the patched Go 1.26.5 toolchain in validation and publishing jobs."
}

$qualityWorkflow = Get-Content -Raw -LiteralPath $qualityWorkflowPath
$qualityWebBuildIndex = $qualityWorkflow.IndexOf("npm --prefix internal/site run build", [System.StringComparison]::Ordinal)
$qualityGoVetIndex = $qualityWorkflow.IndexOf("go vet -tags=testing ./...", [System.StringComparison]::Ordinal)
if ($qualityWebBuildIndex -lt 0 -or $qualityGoVetIndex -lt 0 -or $qualityWebBuildIndex -gt $qualityGoVetIndex) {
    throw "Quality workflow must build internal/site/dist before Go vet and tests consume the embedded site."
}
Assert-Contains "Quality workflow" $qualityWorkflow "go-version: 1.26.5"
Assert-Contains "Quality workflow" $qualityWorkflow "Run non-Hub Go tests"
Assert-Contains "Quality workflow" $qualityWorkflow "test-run-go-test-shard.ps1"
Assert-Contains "Quality workflow" $qualityWorkflow "test-release-image-reference.ps1"
Assert-Contains "Quality workflow" $qualityWorkflow 'shard: [0, 1, 2, 3]'
Assert-Contains "Quality workflow" $qualityWorkflow "run-go-test-shard.ps1"
Assert-Contains "Quality workflow" $qualityWorkflow "-ShardCount 4"
Assert-Contains "Quality workflow" $qualityWorkflow "-Timeout 600s"
foreach ($required in @(
    "test-android-signing-helpers.ps1",
    "test-initialize-android-release-signing.ps1",
    "test-build-android-release.ps1"
)) {
    Assert-Contains "Quality workflow" $qualityWorkflow $required
}
if ($qualityWorkflow.Contains("secrets.ANDROID_RELEASE_")) {
    throw "Quality workflow must remain independent of Android signing secrets."
}

$goTestShard = Get-Content -Raw -LiteralPath $goTestShardPath
Assert-Contains "Go test shard runner" $goTestShard "go test -tags=testing -c"
Assert-Contains "Go test shard runner" $goTestShard "'-test.list=^Test'"
Assert-Contains "Go test shard runner" $goTestShard 'foreach ($testName in $selectedTests)'
Assert-Contains "Go test shard runner" $goTestShard "'-test.count=1'"
Assert-Contains "Go test shard runner" $goTestShard '$ShardIndex -ge $ShardCount'
Assert-Contains "Go test shard runner" $goTestShard '"-test.timeout=$Timeout"'

$vulncheckWorkflow = Get-Content -Raw -LiteralPath $vulncheckWorkflowPath
Assert-Contains "Vulnerability workflow" $vulncheckWorkflow "go-version: 1.26.5"

$sitePackage = Get-Content -Raw -LiteralPath $sitePackagePath | ConvertFrom-Json
if (-not $sitePackage.scripts.typecheck.StartsWith("lingui compile && tsc ", [System.StringComparison]::Ordinal)) {
    throw "The Web typecheck command must compile generated Lingui catalogs before TypeScript runs."
}

$runbook = Get-Content -Raw -LiteralPath $runbookPath
foreach ($required in @(
    "明确授权",
    "PUBLIC_RELEASE_ENABLED",
    "public-release",
    "workflow_dispatch",
    "默认只验证",
    "gh repo create",
    "git push",
    "docker push",
    "gh release create",
    "回滚",
    "安全镜像",
    "费用"
)) {
    Assert-Contains "Public release runbook" $runbook $required
}

& $goTestShardContractPath
if ($LASTEXITCODE -ne 0) {
    throw "Go shard process-isolation contract failed."
}

& $goExecutableMetadataContractPath
if ($LASTEXITCODE -ne 0) {
    throw "Cross-platform Go executable metadata contract failed."
}

Write-Host "Guarded public release workflow contract passed."
