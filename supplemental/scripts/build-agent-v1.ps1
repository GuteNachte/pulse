param(
	[string]$Version = "1.0.5",
	[string]$OS = "windows",
	[string]$Arch = "amd64",
	[string]$GoProxy = "https://goproxy.cn,direct"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
. (Join-Path $PSScriptRoot "release-script-helpers.ps1")

Assert-ReleaseVersionConsistency -Version $Version

$outputDir = Join-Path $repoRoot "build\releases\agent\$Version"
$releaseRoot = Join-Path $repoRoot "build\releases\agent"
$containerOutputPath = "/app/build/releases/agent/$Version/pulse-agent_${OS}_${Arch}"
$extension = if ($OS -eq "windows") { ".exe" } else { "" }
$outputPath = Join-Path $outputDir "pulse-agent_${OS}_${Arch}${extension}"
$containerOutputPath = "$containerOutputPath$extension"

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
Remove-Item -LiteralPath $outputPath -Force -ErrorAction SilentlyContinue

Push-Location $repoRoot
try {
	$ldflags = "-w -s -X gutenacht.site/pulse.Version=$Version"
	$goPath = "C:\Program Files\Go\bin\go.exe"
	$goCommand = Get-Command go -ErrorAction SilentlyContinue
	if (Test-Path $goPath) {
		$goCommandPath = $goPath
	} elseif ($goCommand) {
		$goCommandPath = $goCommand.Source
	}
	if ($goCommandPath) {
		$env:GOOS = $OS
		$env:GOARCH = $Arch
		& $goCommandPath build -o $outputPath -ldflags $ldflags ./internal/cmd/agent
		if ($LASTEXITCODE -ne 0) {
			throw "go build failed with exit code $LASTEXITCODE"
		}
	} else {
		docker run --rm `
			-e "GOOS=$OS" `
			-e "GOARCH=$Arch" `
			-e "GOPROXY=$GoProxy" `
			-v "${repoRoot}:/app" `
			-v pulse_go_pkg_cache:/go/pkg/mod `
			-v pulse_go_build_cache:/root/.cache/go-build `
			-w /app `
			golang:alpine `
			go build -o $containerOutputPath -ldflags $ldflags ./internal/cmd/agent
		if ($LASTEXITCODE -ne 0) {
			throw "dockerized go build failed with exit code $LASTEXITCODE"
		}
	}
	if ($OS -eq "windows") {
		& $outputPath --version
		if ($LASTEXITCODE -ne 0) {
			throw "version check failed with exit code $LASTEXITCODE"
		}
	} elseif ($OS -eq "linux") {
		docker run --rm -v "${repoRoot}:/app" -w /app golang:alpine sh -c "chmod +x '$containerOutputPath' && '$containerOutputPath' --version"
		if ($LASTEXITCODE -ne 0) {
			throw "version check failed with exit code $LASTEXITCODE"
		}
	}
	. (Join-Path $PSScriptRoot "agent-release-retention.ps1")
	Prune-AgentReleaseDirectory -Root $releaseRoot -Limit 2
	Write-Host "Built $outputPath"
} finally {
	Pop-Location
	Remove-Item Env:\GOOS -ErrorAction SilentlyContinue
	Remove-Item Env:\GOARCH -ErrorAction SilentlyContinue
}

