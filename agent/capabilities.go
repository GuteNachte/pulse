package agent

import (
	"os"
	"runtime"
	"slices"
	"strings"
	"time"

	"gutenacht.site/pulse"
	"gutenacht.site/pulse/agent/utils"
	"gutenacht.site/pulse/internal/entities/system"
)

func (a *Agent) buildCapabilities() *system.AgentCapabilities {
	privilege := detectPrivilege()
	installMethod := detectInstallMethod()
	runMode := detectRunMode()
	collection := []string{"metrics_basic"}
	operations := []string{}
	unsupported := map[string]string{}

	if a.dockerManager != nil && a.dockerManager.available() {
		collection = append(collection, "containers")
		operations = append(operations, "container_control")
	} else {
		unsupported["containers"] = "Docker / Podman socket is not available"
		unsupported["container_control"] = "Docker / Podman socket is not available"
	}

	if a.smartManager != nil {
		collection = append(collection, "smart")
	} else {
		unsupported["smart"] = "SMART collector is not available"
	}

	if a.gpuManager != nil {
		collection = append(collection, "gpu")
	} else {
		unsupported["gpu"] = gpuUnsupportedReason(installMethod, runMode, a.gpuError)
	}

	switch runtime.GOOS {
	case "linux":
		// Linux deployments for this fork are Docker based. Do not advertise a
		// separate Linux host-agent mode in the capability payload.
		if isContainerRunMode(installMethod, runMode) && a.dockerManager != nil && a.dockerManager.available() {
			operations = append(operations, "agent_update")
		} else {
			unsupported["agent_update"] = "Linux container agent update requires Docker / Podman socket access"
		}
	case "windows":
		collection = append(collection, "software_monitor", "windows_services")
		operations = append(operations, "agent_update", "service_control")
	}

	if runtime.GOOS == "windows" && privilege != "admin" && privilege != "root" {
		unsupported["service_privilege"] = "service control may require elevated privileges"
		unsupported["agent_update"] = "agent self-update requires elevated privileges"
	}

	slices.Sort(collection)
	slices.Sort(operations)

	return &system.AgentCapabilities{
		Platform:           runtime.GOOS,
		Arch:               runtime.GOARCH,
		AgentVersion:       pulse.Version,
		InstallMethod:      installMethod,
		RunMode:            runMode,
		AgentProfile:       detectAgentProfile(installMethod, runMode),
		Privilege:          privilege,
		Collection:         collection,
		Operations:         operations,
		UnsupportedReasons: unsupported,
		LastUpdate:         readLastAgentUpdateResult(a.dataDir),
	}
}

func (a *Agent) updateCapabilityResults(data *system.CombinedData) {
	if data == nil || data.Info.Capabilities == nil {
		return
	}
	now := time.Now().UTC().Format(time.RFC3339)
	results := map[string]system.CapabilityStatus{}
	diagnostics := map[string]system.CapabilityStatus{}

	results["metrics_basic"] = metricsCapabilityStatus(data.Stats, now)

	if a.dockerManager != nil && a.dockerManager.available() {
		results["containers"] = system.CapabilityStatus{
			State:     system.CapabilityStateConfirmed,
			CheckedAt: now,
			Reason:    "Docker / Podman socket reachable",
			Count:     len(data.Containers),
		}
		diagnostics["docker_socket"] = system.CapabilityStatus{
			State:     system.CapabilityStateConfirmed,
			CheckedAt: now,
			Reason:    "Docker / Podman socket reachable",
		}
	} else {
		reason := data.Info.Capabilities.UnsupportedReasons["containers"]
		if strings.TrimSpace(reason) == "" {
			reason = "Docker / Podman socket is not available"
		}
		results["containers"] = system.CapabilityStatus{
			State:     system.CapabilityStateUnavailable,
			CheckedAt: now,
			Reason:    reason,
		}
		diagnostics["docker_socket"] = system.CapabilityStatus{
			State:     system.CapabilityStateUnavailable,
			CheckedAt: now,
			Reason:    reason,
		}
	}

	if a.smartManager == nil {
		reason := data.Info.Capabilities.UnsupportedReasons["smart"]
		if strings.TrimSpace(reason) == "" {
			reason = "SMART collector is not available"
		}
		results["smart"] = system.CapabilityStatus{
			State:     system.CapabilityStateUnsupported,
			CheckedAt: now,
			Reason:    reason,
		}
		diagnostics["smart"] = results["smart"]
	} else {
		results["smart"] = system.CapabilityStatus{
			State:     system.CapabilityStateUnknown,
			CheckedAt: now,
			Reason:    "SMART devices are collected on the Hub background schedule",
		}
		diagnostics["smart"] = results["smart"]
	}

	if len(data.Stats.GPUData) > 0 || data.Info.GpuSupported {
		results["gpu"] = system.CapabilityStatus{
			State:     system.CapabilityStateConfirmed,
			CheckedAt: now,
			Reason:    "GPU metrics collected",
			Count:     len(data.Stats.GPUData),
		}
		diagnostics["gpu"] = results["gpu"]
	} else if a.gpuManager == nil {
		reason := data.Info.Capabilities.UnsupportedReasons["gpu"]
		if strings.TrimSpace(reason) == "" {
			reason = "GPU collector is not available"
		}
		results["gpu"] = system.CapabilityStatus{
			State:     system.CapabilityStateUnavailable,
			CheckedAt: now,
			Reason:    reason,
		}
		diagnostics["gpu"] = results["gpu"]
	} else {
		results["gpu"] = system.CapabilityStatus{
			State:     system.CapabilityStateUnavailable,
			CheckedAt: now,
			Reason:    "GPU collector is active but no GPU metrics were returned in this collection",
		}
		diagnostics["gpu"] = results["gpu"]
	}

	if runtime.GOOS == "windows" {
		diagnostics["wmi"] = system.CapabilityStatus{
			State:     system.CapabilityStateConfirmed,
			CheckedAt: now,
			Reason:    "Windows host agent can use PowerShell / WMI based collectors",
		}
	} else {
		diagnostics["wmi"] = system.CapabilityStatus{
			State:     system.CapabilityStateUnsupported,
			CheckedAt: now,
			Reason:    "WMI is only used by Windows host agents",
		}
	}

	diagnostics["privilege"] = privilegeCapabilityStatus(data.Info.Capabilities.Privilege, now)
	diagnostics["network_details"] = networkDetailsCapabilityStatus(a.systemDetails.NetworkInterfaces, data.Stats.NetworkInterfaces, now)

	data.Info.Capabilities.CollectionResults = results
	data.Info.Capabilities.Diagnostics = diagnostics
}

func metricsCapabilityStatus(stats system.Stats, checkedAt string) system.CapabilityStatus {
	hasMetrics := stats.Cpu > 0 ||
		stats.Mem > 0 ||
		stats.MemPct > 0 ||
		stats.DiskTotal > 0 ||
		stats.DiskPct > 0 ||
		stats.Bandwidth[0] > 0 ||
		stats.Bandwidth[1] > 0 ||
		len(stats.NetworkInterfaces) > 0
	if hasMetrics {
		return system.CapabilityStatus{
			State:     system.CapabilityStateConfirmed,
			CheckedAt: checkedAt,
			Reason:    "Basic CPU, memory, disk, or network metrics collected",
		}
	}
	return system.CapabilityStatus{
		State:     system.CapabilityStateUnknown,
		CheckedAt: checkedAt,
		Reason:    "Basic metrics collector ran, but this payload did not contain measurable values",
	}
}

func privilegeCapabilityStatus(privilege string, checkedAt string) system.CapabilityStatus {
	switch strings.ToLower(strings.TrimSpace(privilege)) {
	case "admin", "root":
		return system.CapabilityStatus{
			State:     system.CapabilityStateConfirmed,
			CheckedAt: checkedAt,
			Reason:    "Agent is running with elevated privileges",
		}
	case "user":
		return system.CapabilityStatus{
			State:     system.CapabilityStateUnavailable,
			CheckedAt: checkedAt,
			Reason:    "Agent is running as a normal user; some control operations may be unavailable",
		}
	default:
		return system.CapabilityStatus{
			State:     system.CapabilityStateUnknown,
			CheckedAt: checkedAt,
			Reason:    "Agent privilege could not be determined",
		}
	}
}

func networkDetailsCapabilityStatus(
	interfaces []system.NetworkInterfaceDetails,
	interfaceStats map[string][4]uint64,
	checkedAt string,
) system.CapabilityStatus {
	if len(interfaces) > 0 || len(interfaceStats) > 0 {
		return system.CapabilityStatus{
			State:     system.CapabilityStateConfirmed,
			CheckedAt: checkedAt,
			Reason:    "Network interface details or per-interface traffic collected",
			Count:     max(len(interfaces), len(interfaceStats)),
		}
	}
	return system.CapabilityStatus{
		State:     system.CapabilityStateUnavailable,
		CheckedAt: checkedAt,
		Reason:    "No network interface details were collected",
	}
}

func isContainerRunMode(installMethod string, runMode string) bool {
	installMethod = strings.ToLower(strings.TrimSpace(installMethod))
	runMode = strings.ToLower(strings.TrimSpace(runMode))
	return installMethod == "docker" || runMode == "docker" || fileExists("/.dockerenv")
}

func gpuUnsupportedReason(installMethod string, runMode string, initError string) string {
	if isContainerRunMode(installMethod, runMode) && runtime.GOOS == "linux" {
		return "Integrated GPU collector is not available; Linux Docker usually requires /dev/dri mounted into the container and sufficient device permissions"
	}
	if runtime.GOOS == "windows" {
		return "Integrated GPU collector is not available; Windows integrated GPU collection uses GPU Engine performance counters"
	}
	if strings.TrimSpace(initError) != "" {
		return initError
	}
	return "GPU collector is not available"
}

func detectInstallMethod() string {
	if value, ok := utils.GetEnv("INSTALL_METHOD"); ok && strings.TrimSpace(value) != "" {
		return strings.TrimSpace(value)
	}
	exe, _ := os.Executable()
	lower := strings.ToLower(exe)
	switch {
	case strings.Contains(lower, "winget"):
		return "winget"
	case strings.Contains(lower, "scoop"):
		return "scoop"
	case fileExists("/.dockerenv"):
		return "docker"
	default:
		return "unknown"
	}
}

func detectRunMode() string {
	if value, ok := utils.GetEnv("RUN_MODE"); ok && strings.TrimSpace(value) != "" {
		return strings.TrimSpace(value)
	}
	if runtime.GOOS == "windows" {
		return "windows_service"
	}
	if fileExists("/.dockerenv") {
		return "docker"
	}
	return "manual"
}

func detectAgentProfile(installMethod string, runMode string) string {
	if value, ok := utils.GetEnv("AGENT_PROFILE"); ok && strings.TrimSpace(value) != "" {
		return strings.TrimSpace(value)
	}
	if isContainerRunMode(installMethod, runMode) {
		return "linux-container"
	}
	if runtime.GOOS == "windows" {
		return "windows-host"
	}
	if runtime.GOOS == "linux" {
		return "linux-container"
	}
	return runtime.GOOS
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
