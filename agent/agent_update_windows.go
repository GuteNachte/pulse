//go:build windows

package agent

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"gutenacht.site/pulse/internal/common"
	"gutenacht.site/pulse/internal/entities/system"
)

const (
	windowsAgentServiceName = "pulse-agent"
)

func (a *Agent) controlAgentUpdate(params map[string]string) common.OperationResult {
	req, err := parseAgentUpdateRequest(params)
	if err != nil {
		return common.OperationResult{Status: "denied", Message: err.Error()}
	}
	if req.platform != "" && req.platform != "all" && req.platform != "windows" {
		return common.OperationResult{Status: "denied", Message: "release platform does not match this agent"}
	}
	if req.arch != "" && req.arch != runtime.GOARCH {
		return common.OperationResult{Status: "denied", Message: "release architecture does not match this agent"}
	}
	if !isHTTPAgentUpdateURL(req.downloadURL) {
		return common.OperationResult{Status: "denied", Message: "Windows update requires an http or https download URL"}
	}
	if agentAlreadyAtOrAboveTarget(req.version) {
		result := &system.AgentUpdateResult{
			Status:  "succeeded",
			Version: req.version,
			Message: "Agent is already at the latest version.",
			Time:    time.Now().UTC().Format(time.RFC3339),
		}
		_ = writeAgentUpdateResult(a.dataDir, result)
		return common.OperationResult{Status: "succeeded", Message: "Agent 已经是最新版。"}
	}
	serviceName := windowsAgentServiceName
	if !windowsServiceExists(serviceName) {
		return common.OperationResult{Status: "unsupported", Message: "Windows self-update requires the pulse-agent service"}
	}

	exePath, err := os.Executable()
	if err != nil {
		return common.OperationResult{Status: "failed", Message: fmt.Sprintf("cannot resolve current executable: %v", err)}
	}
	updateDir := filepath.Dir(agentUpdateResultPath(a.dataDir))
	if err := os.MkdirAll(updateDir, 0700); err != nil {
		return common.OperationResult{Status: "failed", Message: fmt.Sprintf("cannot prepare update directory: %v", err)}
	}

	newExePath := filepath.Join(updateDir, fmt.Sprintf("pulse-agent-%s.exe", safeFilePart(req.version)))
	body, err := downloadAgentUpdate(req.downloadURL)
	if err != nil {
		return common.OperationResult{Status: "failed", Message: err.Error()}
	}
	if req.checksum != "" {
		if err := verifySHA256(body, req.checksum); err != nil {
			return common.OperationResult{Status: "failed", Message: err.Error()}
		}
	}
	if err := os.WriteFile(newExePath, body, 0600); err != nil {
		return common.OperationResult{Status: "failed", Message: fmt.Sprintf("cannot write downloaded agent: %v", err)}
	}

	resultPath := agentUpdateResultPath(a.dataDir)
	taskName := fmt.Sprintf("PulseAgentUpdate-%d", time.Now().Unix())
	scriptPath := filepath.Join(updateDir, fmt.Sprintf("apply-agent-update-%d.ps1", time.Now().Unix()))
	if err := os.WriteFile(scriptPath, []byte(windowsUpdateScript(exePath, newExePath, serviceName, resultPath, req.version, taskName)), 0600); err != nil {
		return common.OperationResult{Status: "failed", Message: fmt.Sprintf("cannot write update script: %v", err)}
	}

	if err := startWindowsUpdateTask(taskName, scriptPath); err != nil {
		return common.OperationResult{Status: "failed", Message: fmt.Sprintf("cannot start update script: %v", err)}
	}
	return common.OperationResult{
		Status:  "succeeded",
		Message: fmt.Sprintf("agent update to %s staged; Windows service restart requested", req.version),
	}
}

func startWindowsUpdateTask(taskName string, scriptPath string) error {
	startTime := time.Now().Add(1 * time.Minute).Format("15:04")
	taskRun := fmt.Sprintf(`powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%s"`, scriptPath)
	create := exec.Command(
		"schtasks.exe",
		"/Create",
		"/TN",
		taskName,
		"/SC",
		"ONCE",
		"/ST",
		startTime,
		"/TR",
		taskRun,
		"/RU",
		"SYSTEM",
		"/RL",
		"HIGHEST",
		"/F",
	)
	if output, err := create.CombinedOutput(); err != nil {
		return fmt.Errorf("create scheduled task failed: %w: %s", err, strings.TrimSpace(string(output)))
	}
	run := exec.Command("schtasks.exe", "/Run", "/TN", taskName)
	if output, err := run.CombinedOutput(); err != nil {
		_ = exec.Command("schtasks.exe", "/Delete", "/TN", taskName, "/F").Run()
		return fmt.Errorf("run scheduled task failed: %w: %s", err, strings.TrimSpace(string(output)))
	}
	return nil
}

func downloadAgentUpdate(downloadURL string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, downloadURL, nil)
	if err != nil {
		return nil, err
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("download failed: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("download failed with status %d", res.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, 200*1024*1024))
	if err != nil {
		return nil, fmt.Errorf("download failed: %w", err)
	}
	if len(body) == 0 {
		return nil, fmt.Errorf("downloaded agent is empty")
	}
	return body, nil
}

func windowsServiceExists(name string) bool {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	script := `if (Get-Service -Name $args[0] -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }`
	return exec.CommandContext(ctx, "powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script, name).Run() == nil
}

func windowsUpdateScript(exePath string, newExePath string, serviceName string, resultPath string, version string, taskName string) string {
	return fmt.Sprintf(`$ErrorActionPreference = 'Stop'
$serviceName = %q
$exePath = %q
$newExePath = %q
$resultPath = %q
$version = %q
$taskName = %q
$backupPath = "$exePath.bak"
function Write-UpdateResult([string]$status, [string]$message) {
	$resultDir = Split-Path -Parent $resultPath
	if ($resultDir) {
		New-Item -ItemType Directory -Force -Path $resultDir | Out-Null
	}
	$result = @{
		status = $status
		version = $version
		message = $message
		time = (Get-Date).ToUniversalTime().ToString("o")
	}
	$result | ConvertTo-Json -Compress | Set-Content -Encoding UTF8 -LiteralPath $resultPath
}
Start-Sleep -Seconds 2
try {
	$service = Get-Service -Name $serviceName -ErrorAction Stop
	if ($service.Status -ne 'Stopped') {
		Stop-Service -Name $serviceName -Force -ErrorAction Stop
		Start-Sleep -Seconds 3
	}
	if (Test-Path -LiteralPath $exePath) {
		Copy-Item -LiteralPath $exePath -Destination $backupPath -Force -ErrorAction SilentlyContinue
	}
	Move-Item -LiteralPath $newExePath -Destination $exePath -Force
	Start-Service -Name $serviceName -ErrorAction Stop
	Write-UpdateResult "succeeded" "Agent update applied and Windows service started."
} catch {
	Write-UpdateResult "failed" $_.Exception.Message
	if ((Test-Path -LiteralPath $backupPath) -and !(Test-Path -LiteralPath $exePath)) {
		Copy-Item -LiteralPath $backupPath -Destination $exePath -Force -ErrorAction SilentlyContinue
	}
	try { Start-Service -Name $serviceName -ErrorAction SilentlyContinue } catch {}
	throw
} finally {
	if ($taskName) {
		Start-Process -FilePath schtasks.exe -ArgumentList @('/Delete','/TN',$taskName,'/F') -WindowStyle Hidden -ErrorAction SilentlyContinue
	}
}
`, serviceName, exePath, newExePath, resultPath, version, taskName)
}

func safeFilePart(value string) string {
	value = strings.TrimSpace(value)
	replacer := strings.NewReplacer("\\", "_", "/", "_", ":", "_", "*", "_", "?", "_", "\"", "_", "<", "_", ">", "_", "|", "_", " ", "_")
	value = replacer.Replace(value)
	if value == "" {
		return "unknown"
	}
	return value
}
