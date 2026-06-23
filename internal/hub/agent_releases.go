package hub

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"gutenacht.site/pulse"
)

const agentReleaseRetentionLimit = 2

var agentReleaseFilenamePattern = regexp.MustCompile(`^pulse-agent_([a-z]+)_([A-Za-z0-9_-]+)(?:\.exe)?$`)

type localAgentRelease struct {
	Version     string
	Channel     string
	Platform    string
	Arch        string
	DownloadURL string
	Checksum    string
	Notes       string
	Enabled     bool
}

type agentReleaseManifest struct {
	Version string                              `json:"version"`
	Files   map[string]agentReleaseManifestFile `json:"files"`
	Images  []agentReleaseManifestImage         `json:"images"`
}

type agentReleaseManifestFile struct {
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
}

type agentReleaseManifestImage struct {
	Platform string `json:"platform"`
	Arch     string `json:"arch"`
	Image    string `json:"image"`
	Notes    string `json:"notes"`
}

type windowsAgentInstallScriptOptions struct {
	InstallDir      string
	DataDir         string
	LogDir          string
	CleanData       bool
	InstallNSSM     bool
	StartService    bool
	AddFirewallRule bool
}

func (h *Hub) downloadAgentRelease(e *core.RequestEvent) error {
	version := strings.TrimSpace(e.Request.PathValue("version"))
	filename := strings.TrimSpace(e.Request.PathValue("filename"))
	path, err := resolveAgentReleaseFilePath(h.DataDir(), version, filename)
	if err != nil {
		return e.NotFoundError("Agent release file not found", err)
	}
	http.ServeFile(e.Response, e.Request, path)
	return nil
}

func (h *Hub) downloadWindowsAgentInstallScript(e *core.RequestEvent) error {
	query := e.Request.URL.Query()
	token := strings.TrimSpace(query.Get("token"))
	code := strings.TrimSpace(query.Get("code"))
	hubURL := strings.TrimRight(strings.TrimSpace(query.Get("hub_url")), "/")
	downloadURL := strings.TrimSpace(query.Get("download_url"))
	version := strings.TrimSpace(query.Get("version"))
	options := windowsAgentInstallScriptOptions{
		InstallDir:      queryStringDefault(query.Get("install_dir"), `%ProgramData%\pulse-agent`),
		DataDir:         queryStringDefault(query.Get("data_dir"), `%WINDIR%\System32\config\systemprofile\AppData\Roaming\pulse-agent`),
		LogDir:          queryStringDefault(query.Get("log_dir"), `%ProgramData%\pulse-agent\logs`),
		CleanData:       queryBoolDefault(query.Get("clean_data"), true),
		InstallNSSM:     queryBoolDefault(query.Get("install_nssm"), true),
		StartService:    queryBoolDefault(query.Get("start_service"), true),
		AddFirewallRule: queryBoolDefault(query.Get("add_firewall_rule"), false),
	}
	if token == "" && code == "" {
		return e.BadRequestError("Token or code is required.", nil)
	}
	if version == "" {
		version = pulse.Version
	}
	if hubURL == "" {
		hubURL = strings.TrimRight(getHubURLFromRequest(e.Request), "/")
	}
	if downloadURL == "" {
		downloadURL = fmt.Sprintf("%s/api/pulse/agent-releases/%s/pulse-agent_windows_amd64.exe", hubURL, version)
	}
	if !isInstallerValueSafe(token) ||
		!isInstallerValueSafe(code) ||
		!isInstallerValueSafe(hubURL) ||
		!isInstallerValueSafe(downloadURL) ||
		!isInstallerValueSafe(version) ||
		!isInstallerValueSafe(options.InstallDir) ||
		!isInstallerValueSafe(options.DataDir) ||
		!isInstallerValueSafe(options.LogDir) {
		return e.BadRequestError("Installer parameter is invalid.", nil)
	}
	e.Response.Header().Set("Cache-Control", "no-store")
	return e.String(http.StatusOK, buildWindowsAgentInstallScript(version, token, code, hubURL, downloadURL, options))
}

func buildWindowsAgentInstallScript(version string, token string, code string, hubURL string, downloadURL string, opts ...windowsAgentInstallScriptOptions) string {
	options := windowsAgentInstallScriptOptions{
		InstallDir:      `$env:ProgramData\pulse-agent`,
		DataDir:         `$env:WINDIR\System32\config\systemprofile\AppData\Roaming\pulse-agent`,
		LogDir:          `$env:ProgramData\pulse-agent\logs`,
		CleanData:       true,
		InstallNSSM:     true,
		StartService:    true,
		AddFirewallRule: false,
	}
	if len(opts) > 0 {
		options = opts[0]
	}
	return fmt.Sprintf(`# Pulse Windows Agent installer
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 | Out-Null

$AgentVersion = %s
$Token = %s
$PairingCode = %s
$HubUrl = %s
$DownloadUrl = %s
$AgentDir = %s
$AgentPath = "$AgentDir\pulse-agent.exe"
$LogDir = %s
$LogFile = "$LogDir\pulse-agent.log"
$AgentDataDir = %s

New-Item -ItemType Directory -Force -Path $AgentDir | Out-Null
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
New-Item -ItemType Directory -Force -Path $AgentDataDir | Out-Null

$Nssm = (Get-Command nssm -ErrorAction SilentlyContinue).Source
%sif (-not $Nssm) {
  throw "NSSM was not found. Install NSSM and run this command again."
}

$ExistingService = Get-Service -Name pulse-agent -ErrorAction SilentlyContinue
if ($ExistingService) {
  Write-Host "Replacing existing pulse-agent service..."
  & $Nssm stop pulse-agent 2>$null
  & $Nssm remove pulse-agent confirm 2>$null
}
Stop-Process -Name pulse-agent -Force -ErrorAction SilentlyContinue
%sRemove-Item -Force -LiteralPath $LogFile -ErrorAction SilentlyContinue

Write-Host "Downloading Pulse Agent $AgentVersion..."
Invoke-WebRequest -UseBasicParsing $DownloadUrl -OutFile $AgentPath

if ($PairingCode) {
  Write-Host "Pairing Pulse Agent with Hub..."
  $env:DATA_DIR = $AgentDataDir
  & $AgentPath pair --url $HubUrl --code $PairingCode
  if ($LASTEXITCODE -ne 0) {
    throw "Agent pairing failed. Check the pairing code and Hub URL."
  }
}

& $Nssm install pulse-agent $AgentPath
& $Nssm set pulse-agent AppEnvironmentExtra "+HUB_URL=$HubUrl"
& $Nssm set pulse-agent AppEnvironmentExtra "+DATA_DIR=$AgentDataDir"
& $Nssm set pulse-agent AppEnvironmentExtra "+INSTALL_METHOD=host"
& $Nssm set pulse-agent AppEnvironmentExtra "+RUN_MODE=windows_service"
& $Nssm set pulse-agent AppEnvironmentExtra "+AGENT_PROFILE=windows-host"
if ($Token) {
  & $Nssm set pulse-agent AppEnvironmentExtra "+TOKEN=$Token"
}
& $Nssm set pulse-agent AppDirectory $AgentDir
& $Nssm set pulse-agent AppStdout $LogFile
& $Nssm set pulse-agent AppStderr $LogFile
%s%s`,
		powerShellSingleQuotedString(version),
		powerShellSingleQuotedString(token),
		powerShellSingleQuotedString(code),
		powerShellSingleQuotedString(hubURL),
		powerShellSingleQuotedString(downloadURL),
		windowsPowerShellPathValue(options.InstallDir),
		windowsPowerShellPathValue(options.LogDir),
		windowsPowerShellPathValue(options.DataDir),
		windowsNSSMInstallBlock(options.InstallNSSM),
		windowsCleanDataBlock(options.CleanData),
		windowsFirewallBlock(options.AddFirewallRule),
		windowsStartServiceBlock(options.StartService),
	)
}

func buildUnraidAgentTemplate(token string, agentHubURL string) string {
	params := url.Values{}
	params.Set("token", token)
	params.Set("hub_url", agentHubURL)
	params.Set("image", fmt.Sprintf("registry.example.com/infra/pulse-agent:%s", pulse.Version))
	params.Set("version", pulse.Version)
	params.Set("data_dir", "/mnt/user/appdata/pulse-agent")
	params.Set("docker_socket_mode", "rw")
	params.Set("include_host_root", "1")
	params.Set("include_dmi", "1")
	params.Set("include_gpu", "1")
	xmlURL := fmt.Sprintf("%s/api/pulse/agent-install/unraid.xml?%s", strings.TrimRight(agentHubURL, "/"), params.Encode())
	return fmt.Sprintf(`mkdir -p "/boot/config/plugins/dockerMan/templates-user" && curl -fsSL '%s' -o '/boot/config/plugins/dockerMan/templates-user/pulse-agent-unraid.xml'`, xmlURL)
}

func (h *Hub) syncAgentReleases(e *core.RequestEvent) error {
	count, err := h.syncLocalAgentReleases()
	if err != nil {
		h.createOperationAudit(e, "", "sync_agent_releases", "agent_releases", "", "failed", err.Error(), operationFailureFailed)
		return e.InternalServerError("Failed to sync Agent releases", err)
	}
	if err := pruneOldAgentReleases(h.App, agentReleaseRetentionLimit); err != nil {
		return e.InternalServerError("Failed to prune Agent releases", err)
	}
	h.createOperationAudit(e, "", "sync_agent_releases", "agent_releases", "", "success", "Agent 版本仓库已同步")
	return e.JSON(http.StatusOK, map[string]any{"count": count})
}

func (h *Hub) syncLocalAgentReleases() (int, error) {
	baseURL := strings.TrimRight(h.Settings().Meta.AppURL, "/")
	if baseURL == "" {
		baseURL = "http://localhost:8090"
	}
	releases, err := discoverLocalAgentReleases(h.DataDir(), baseURL)
	if err != nil {
		return 0, err
	}
	collection, err := h.FindCachedCollectionByNameOrId("agent_releases")
	if err != nil {
		return 0, err
	}
	seen := map[string]bool{}
	for _, release := range releases {
		key := agentReleaseKey(release.Version, release.Channel, release.Platform, release.Arch)
		seen[key] = true
		record, err := h.FindFirstRecordByFilter(
			"agent_releases",
			"version = {:version} && channel = {:channel} && platform = {:platform} && arch = {:arch}",
			dbx.Params{
				"version":  release.Version,
				"channel":  release.Channel,
				"platform": release.Platform,
				"arch":     release.Arch,
			},
		)
		if err != nil {
			record = core.NewRecord(collection)
		}
		record.Set("version", release.Version)
		record.Set("channel", release.Channel)
		record.Set("platform", release.Platform)
		record.Set("arch", release.Arch)
		record.Set("download_url", release.DownloadURL)
		record.Set("checksum", release.Checksum)
		record.Set("notes", release.Notes)
		record.Set("enabled", release.Enabled)
		record.Set("disabled_reason", "")
		if err := h.SaveNoValidate(record); err != nil {
			return 0, err
		}
	}
	records, err := h.FindRecordsByFilter("agent_releases", "", "", -1, 0)
	if err != nil {
		return 0, err
	}
	for _, record := range records {
		key := agentReleaseKey(record.GetString("version"), record.GetString("channel"), record.GetString("platform"), record.GetString("arch"))
		if seen[key] || !record.GetBool("enabled") {
			continue
		}
		record.Set("enabled", false)
		record.Set("disabled_reason", "release is not present in local manifest")
		if err := h.SaveNoValidate(record); err != nil {
			return 0, err
		}
	}
	return len(releases), nil
}

func discoverLocalAgentReleases(dataDir string, baseURL string) ([]localAgentRelease, error) {
	root := filepath.Join(dataDir, "agent-releases")
	entries, err := os.ReadDir(root)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	releases := []localAgentRelease{}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		manifestPath := filepath.Join(root, entry.Name(), "manifest.json")
		body, err := os.ReadFile(manifestPath)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return nil, err
		}
		var manifest agentReleaseManifest
		if err := json.Unmarshal(body, &manifest); err != nil {
			return nil, err
		}
		version := firstNonEmpty(manifest.Version, entry.Name())
		for _, image := range manifest.Images {
			if strings.TrimSpace(image.Image) == "" {
				continue
			}
			releases = append(releases, localAgentRelease{
				Version:     version,
				Channel:     "stable",
				Platform:    queryStringDefault(image.Platform, "linux"),
				Arch:        queryStringDefault(image.Arch, "amd64"),
				DownloadURL: strings.TrimSpace(image.Image),
				Notes:       strings.TrimSpace(image.Notes),
				Enabled:     true,
			})
		}
		fileNames := make([]string, 0, len(manifest.Files))
		for fileName := range manifest.Files {
			fileNames = append(fileNames, fileName)
		}
		sort.Strings(fileNames)
		for _, fileName := range fileNames {
			match := agentReleaseFilenamePattern.FindStringSubmatch(fileName)
			if match == nil {
				continue
			}
			checksum := ""
			if raw, err := os.ReadFile(filepath.Join(root, entry.Name(), fileName)); err == nil {
				sum := sha256.Sum256(raw)
				checksum = "sha256:" + hex.EncodeToString(sum[:])
			}
			if checksum == "" {
				fileInfo := manifest.Files[fileName]
				checksum = strings.TrimSpace(fileInfo.SHA256)
				if checksum != "" && !strings.HasPrefix(checksum, "sha256:") {
					checksum = "sha256:" + checksum
				}
			}
			releases = append(releases, localAgentRelease{
				Version:     version,
				Channel:     "stable",
				Platform:    match[1],
				Arch:        match[2],
				DownloadURL: fmt.Sprintf("%s/api/pulse/agent-releases/%s/%s", strings.TrimRight(baseURL, "/"), url.PathEscape(version), url.PathEscape(fileName)),
				Checksum:    checksum,
				Enabled:     true,
			})
		}
	}
	sort.SliceStable(releases, func(i, j int) bool {
		if releases[i].Version != releases[j].Version {
			return compareAgentReleaseVersions(releases[i].Version, releases[j].Version) < 0
		}
		return releases[i].Platform < releases[j].Platform
	})
	return releases, nil
}

func resolveAgentReleaseFilePath(dataDir string, version string, filename string) (string, error) {
	version = strings.TrimSpace(version)
	filename = strings.TrimSpace(filename)
	if version == "" || filename == "" ||
		strings.ContainsAny(version, `/\`) ||
		strings.ContainsAny(filename, `/\`) ||
		strings.Contains(version, "..") ||
		strings.Contains(filename, "..") {
		return "", fmt.Errorf("unsafe release path")
	}
	if filename != "manifest.json" && !agentReleaseFilenamePattern.MatchString(filename) {
		return "", fmt.Errorf("unsupported release file")
	}
	root, err := filepath.Abs(filepath.Join(dataDir, "agent-releases"))
	if err != nil {
		return "", err
	}
	path, err := filepath.Abs(filepath.Join(root, version, filename))
	if err != nil {
		return "", err
	}
	if !strings.HasPrefix(path, root+string(os.PathSeparator)) {
		return "", fmt.Errorf("release path escapes data directory")
	}
	if _, err := os.Stat(path); err != nil {
		return "", err
	}
	return path, nil
}

func seedBundledAgentReleases(dataDir string, sourceRoot string) error {
	entries, err := os.ReadDir(sourceRoot)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		sourceDir := filepath.Join(sourceRoot, entry.Name())
		targetDir := filepath.Join(dataDir, "agent-releases", entry.Name())
		if err := copyMissingFiles(sourceDir, targetDir); err != nil {
			return err
		}
	}
	return nil
}

func pruneOldAgentReleases(app core.App, limit int) error {
	return pruneLocalAgentReleaseFiles(app.DataDir(), limit)
}

func pruneLocalAgentReleaseFiles(dataDir string, limit int) error {
	if limit <= 0 {
		return nil
	}
	root := filepath.Join(dataDir, "agent-releases")
	entries, err := os.ReadDir(root)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	versions := []string{}
	for _, entry := range entries {
		if entry.IsDir() {
			versions = append(versions, entry.Name())
		}
	}
	sort.Slice(versions, func(i, j int) bool {
		return compareAgentReleaseVersions(versions[i], versions[j]) > 0
	})
	if len(versions) <= limit {
		return nil
	}
	for _, version := range versions[limit:] {
		if err := os.RemoveAll(filepath.Join(root, version)); err != nil {
			return err
		}
	}
	return nil
}

func (h *Hub) bindAgentReleaseHooks() {
	prune := func(e *core.RecordEvent) error {
		if err := e.Next(); err != nil {
			return err
		}
		return pruneAgentReleaseRecords(e.App, agentReleaseRetentionLimit)
	}
	h.App.OnRecordCreate("agent_releases").BindFunc(prune)
	h.App.OnRecordUpdate("agent_releases").BindFunc(prune)
}

func pruneAgentReleaseRecords(app core.App, limit int) error {
	if limit <= 0 {
		return nil
	}
	records, err := app.FindRecordsByFilter("agent_releases", "enabled = true", "", -1, 0)
	if err != nil {
		return nil
	}
	byTarget := map[string][]*core.Record{}
	for _, record := range records {
		key := agentReleaseKey("", record.GetString("channel"), record.GetString("platform"), record.GetString("arch"))
		byTarget[key] = append(byTarget[key], record)
	}
	for _, items := range byTarget {
		sort.Slice(items, func(i, j int) bool {
			return compareAgentReleaseVersions(items[i].GetString("version"), items[j].GetString("version")) > 0
		})
		if len(items) <= limit {
			continue
		}
		for _, record := range items[limit:] {
			if err := app.Delete(record); err != nil {
				return err
			}
		}
	}
	return nil
}

func compareAgentReleaseVersions(a string, b string) int {
	as := versionParts(a)
	bs := versionParts(b)
	max := len(as)
	if len(bs) > max {
		max = len(bs)
	}
	for i := 0; i < max; i++ {
		av, bv := 0, 0
		if i < len(as) {
			av = as[i]
		}
		if i < len(bs) {
			bv = bs[i]
		}
		if av > bv {
			return 1
		}
		if av < bv {
			return -1
		}
	}
	return strings.Compare(a, b)
}

func versionParts(value string) []int {
	value = strings.TrimPrefix(strings.TrimSpace(value), "v")
	fields := regexp.MustCompile(`[^0-9]+`).Split(value, -1)
	parts := make([]int, 0, len(fields))
	for _, field := range fields {
		if field == "" {
			continue
		}
		n := 0
		for _, r := range field {
			n = n*10 + int(r-'0')
		}
		parts = append(parts, n)
	}
	return parts
}

func copyMissingFiles(sourceDir string, targetDir string) error {
	entries, err := os.ReadDir(sourceDir)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(targetDir, 0o755); err != nil {
		return err
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		sourcePath := filepath.Join(sourceDir, entry.Name())
		targetPath := filepath.Join(targetDir, entry.Name())
		if _, err := os.Stat(targetPath); err == nil {
			continue
		}
		body, err := os.ReadFile(sourcePath)
		if err != nil {
			return err
		}
		if err := os.WriteFile(targetPath, body, 0o644); err != nil {
			return err
		}
	}
	return nil
}

func agentReleaseKey(version string, channel string, platform string, arch string) string {
	if version == "" {
		return strings.Join([]string{channel, platform, arch}, "\x00")
	}
	return strings.Join([]string{version, channel, platform, arch}, "\x00")
}

func powerShellSingleQuotedString(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "''") + "'"
}

func windowsPowerShellPathValue(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "''"
	}
	if strings.HasPrefix(value, "$env:") {
		return `"` + strings.ReplaceAll(value, `"`, "`\"") + `"`
	}
	return powerShellSingleQuotedString(value)
}

func windowsNSSMInstallBlock(enabled bool) string {
	if !enabled {
		return ""
	}
	return `if (-not $Nssm) {
  Write-Host "Installing NSSM..."
  winget install -e --id NSSM.NSSM --accept-source-agreements --accept-package-agreements
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
  $Nssm = (Get-Command nssm -ErrorAction SilentlyContinue).Source
}
`
}

func windowsCleanDataBlock(enabled bool) string {
	if !enabled {
		return ""
	}
	return "Remove-Item -Recurse -Force -LiteralPath $AgentDataDir -ErrorAction SilentlyContinue\nNew-Item -ItemType Directory -Force -Path $AgentDataDir | Out-Null\n"
}

func windowsFirewallBlock(enabled bool) string {
	if !enabled {
		return ""
	}
	return `if (Get-Command New-NetFirewallRule -ErrorAction SilentlyContinue) {
  Remove-NetFirewallRule -DisplayName "Allow pulse-agent" -ErrorAction SilentlyContinue
  New-NetFirewallRule -DisplayName "Allow pulse-agent" -Direction Outbound -Action Allow -Program $AgentPath | Out-Null
}
`
}

func windowsStartServiceBlock(enabled bool) string {
	if !enabled {
		return `Write-Host "pulse-agent service has been installed but not started."
Write-Host "Start it later with: nssm start pulse-agent"
`
	}
	return `Write-Host "Starting pulse-agent service..."
& $Nssm start pulse-agent
Start-Sleep -Seconds 3
$Status = & $Nssm status pulse-agent
if ($Status -ne "SERVICE_RUNNING") {
  Write-Host "pulse-agent did not start. Status: $Status" -ForegroundColor Red
  Write-Host "Log file: $LogFile" -ForegroundColor Yellow
  if (Test-Path $LogFile) { Get-Content $LogFile -Tail 40 }
  exit 1
}

Write-Host "pulse-agent is running." -ForegroundColor Green
Write-Host "Log file: $LogFile"
Write-Host "If the client stays offline, check the log for WebSocket 401 or pairing errors."
`
}
