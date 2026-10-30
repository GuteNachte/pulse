package systems

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"gutenacht.site/pulse/internal/entities/system"
)

func TestSanitizeSystemInfoRemovesDisabledCapabilitiesAtSource(t *testing.T) {
	info := system.Info{
		Capabilities: &system.AgentCapabilities{
			Collection: []string{"metrics_basic", "extra_filesystems", "software_monitor"},
			Operations: []string{
				"agent_update",
				"reboot",
				"service_control",
				"shutdown",
				"software_control",
				"wake_on_lan",
			},
			UnsupportedReasons: map[string]string{
				"extra_filesystems": "removed feature",
				"linux_host_agent":  "removed install mode",
				"software_control":  "monitor only",
				"gpu":               "not detected",
			},
		},
	}

	sanitized := sanitizeSystemInfo(info)

	require.NotContains(t, sanitized.Capabilities.Collection, "extra_filesystems")
	require.ElementsMatch(t, []string{"metrics_basic", "software_monitor"}, sanitized.Capabilities.Collection)
	require.ElementsMatch(t, []string{"agent_update", "service_control"}, sanitized.Capabilities.Operations)
	require.Equal(t, map[string]string{"gpu": "not detected"}, sanitized.Capabilities.UnsupportedReasons)
}

func TestSanitizeSystemInfoKeepsLinuxContainerAgentUpdateCapability(t *testing.T) {
	info := system.Info{
		Capabilities: &system.AgentCapabilities{
			AgentProfile: "linux-container",
			Collection:   []string{"metrics_basic", "software_monitor", "systemd_services", "containers"},
			Operations:   []string{"agent_update", "service_control", "container_control"},
			UnsupportedReasons: map[string]string{
				"service_control":  "not supported",
				"software_monitor": "not supported",
				"systemd_services": "not supported",
				"gpu":              "not detected",
			},
			CollectionResults: map[string]system.CapabilityStatus{
				"software_monitor": {State: system.CapabilityStateConfirmed},
				"systemd_services": {State: system.CapabilityStateConfirmed},
				"containers":       {State: system.CapabilityStateConfirmed},
			},
			Diagnostics: map[string]system.CapabilityStatus{
				"service_control": {State: system.CapabilityStateConfirmed},
				"docker_socket":   {State: system.CapabilityStateConfirmed},
			},
		},
	}

	sanitized := sanitizeSystemInfo(info)

	require.ElementsMatch(t, []string{"metrics_basic", "containers"}, sanitized.Capabilities.Collection)
	require.ElementsMatch(t, []string{"agent_update", "container_control"}, sanitized.Capabilities.Operations)
	require.Equal(t, map[string]string{"gpu": "not detected"}, sanitized.Capabilities.UnsupportedReasons)
	require.NotContains(t, sanitized.Capabilities.CollectionResults, "software_monitor")
	require.NotContains(t, sanitized.Capabilities.CollectionResults, "systemd_services")
	require.Contains(t, sanitized.Capabilities.CollectionResults, "containers")
	require.NotContains(t, sanitized.Capabilities.Diagnostics, "service_control")
	require.Contains(t, sanitized.Capabilities.Diagnostics, "docker_socket")
}

func TestSanitizeSystemInfoKeepsWindowsHostControlCapabilities(t *testing.T) {
	info := system.Info{
		Capabilities: &system.AgentCapabilities{
			AgentProfile: "windows-host",
			Collection:   []string{"metrics_basic", "software_monitor", "windows_services"},
			Operations:   []string{"agent_update", "service_control"},
		},
	}

	sanitized := sanitizeSystemInfo(info)

	require.ElementsMatch(t, []string{"metrics_basic", "software_monitor", "windows_services"}, sanitized.Capabilities.Collection)
	require.ElementsMatch(t, []string{"agent_update", "service_control"}, sanitized.Capabilities.Operations)
}

func TestMarkStaleCapabilityStatusesMarksOldHeartbeatResults(t *testing.T) {
	now := time.Date(2026, 6, 16, 12, 0, 0, 0, time.UTC)
	capabilities := &system.AgentCapabilities{
		CollectionResults: map[string]system.CapabilityStatus{
			"metrics_basic": {
				State:     system.CapabilityStateConfirmed,
				CheckedAt: now.Add(-6 * time.Minute).Format(time.RFC3339),
				Reason:    "Basic metrics collected",
			},
			"containers": {
				State:     system.CapabilityStateUnavailable,
				CheckedAt: now.Add(-2 * time.Minute).Format(time.RFC3339),
				Reason:    "Docker socket unavailable",
			},
			"gpu": {
				State:     system.CapabilityStateUnsupported,
				CheckedAt: now.Add(-24 * time.Hour).Format(time.RFC3339),
				Reason:    "GPU collector is not supported",
			},
		},
		Diagnostics: map[string]system.CapabilityStatus{
			"network_details": {
				State:     system.CapabilityStateFailed,
				CheckedAt: now.Add(-10 * time.Minute).Format(time.RFC3339),
				Reason:    "ipconfig failed",
			},
		},
	}

	markStaleCapabilityStatuses(capabilities, now, time.Hour)

	metrics := capabilities.CollectionResults["metrics_basic"]
	require.Equal(t, system.CapabilityStateStale, metrics.State)
	require.Contains(t, metrics.Reason, "已超过 5 分钟未刷新")
	require.Equal(t, "Basic metrics collected", metrics.Detail)
	require.Equal(t, now.Add(-6*time.Minute).Format(time.RFC3339), metrics.CheckedAt)

	require.Equal(t, system.CapabilityStateUnavailable, capabilities.CollectionResults["containers"].State)
	require.Equal(t, system.CapabilityStateUnsupported, capabilities.CollectionResults["gpu"].State)

	network := capabilities.Diagnostics["network_details"]
	require.Equal(t, system.CapabilityStateStale, network.State)
	require.Contains(t, network.Reason, "上次状态：失败")
	require.Equal(t, "ipconfig failed", network.Detail)
}

func TestMarkStaleCapabilityStatusesUsesSmartInterval(t *testing.T) {
	now := time.Date(2026, 6, 16, 12, 0, 0, 0, time.UTC)
	capabilities := &system.AgentCapabilities{
		CollectionResults: map[string]system.CapabilityStatus{
			"smart": {
				State:     system.CapabilityStateConfirmed,
				CheckedAt: now.Add(-90 * time.Minute).Format(time.RFC3339),
				Reason:    "SMART devices collected",
			},
		},
		Diagnostics: map[string]system.CapabilityStatus{
			"smart": {
				State:     system.CapabilityStateConfirmed,
				CheckedAt: now.Add(-(2*time.Hour + 6*time.Minute)).Format(time.RFC3339),
				Reason:    "SMART devices collected",
			},
		},
	}

	markStaleCapabilityStatuses(capabilities, now, time.Hour)

	require.Equal(t, system.CapabilityStateConfirmed, capabilities.CollectionResults["smart"].State)
	require.Equal(t, system.CapabilityStateStale, capabilities.Diagnostics["smart"].State)
	require.Contains(t, capabilities.Diagnostics["smart"].Reason, "已超过 2 小时 5 分钟未刷新")
}

func TestMarkStaleCapabilityStatusesIgnoresMissingOrInvalidCheckedAt(t *testing.T) {
	now := time.Date(2026, 6, 16, 12, 0, 0, 0, time.UTC)
	capabilities := &system.AgentCapabilities{
		CollectionResults: map[string]system.CapabilityStatus{
			"metrics_basic": {
				State:  system.CapabilityStateConfirmed,
				Reason: "old Agent result without timestamp",
			},
			"containers": {
				State:     system.CapabilityStateConfirmed,
				CheckedAt: "not-a-time",
				Reason:    "invalid timestamp",
			},
			"smart": {
				State:     system.CapabilityStateUnknown,
				CheckedAt: now.Add(-24 * time.Hour).Format(time.RFC3339),
				Reason:    "SMART pending background collection",
			},
		},
	}

	markStaleCapabilityStatuses(capabilities, now, time.Hour)

	require.Equal(t, system.CapabilityStateConfirmed, capabilities.CollectionResults["metrics_basic"].State)
	require.Equal(t, system.CapabilityStateConfirmed, capabilities.CollectionResults["containers"].State)
	require.Equal(t, system.CapabilityStateUnknown, capabilities.CollectionResults["smart"].State)
}
