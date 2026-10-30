//go:build testing

package systems_test

import (
	"testing"

	"github.com/stretchr/testify/require"
	"gutenacht.site/pulse/internal/hub/systems"
	"gutenacht.site/pulse/internal/tests"
)

func TestGetMonitoredServiceNamesReturnsEnabledRulesOnly(t *testing.T) {
	hub, err := tests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := tests.CreateUser(hub, "service-options@example.com", "testtesttest")
	require.NoError(t, err)

	systemRecord, err := tests.CreateRecord(hub, "systems", map[string]any{
		"name":   "Windows workstation",
		"status": "up",
		"users":  []string{user.Id},
		"info": map[string]any{
			"cap": map[string]any{
				"platform":      "windows",
				"agent_profile": "windows-host",
				"collection":    []string{"metrics_basic", "software_monitor", "windows_services"},
				"operations":    []string{"agent_update", "service_control"},
			},
		},
	})
	require.NoError(t, err)

	_, err = tests.CreateRecord(hub, "service_control_rules", map[string]any{
		"system":   systemRecord.Id,
		"platform": "windows",
		"name":     "Spooler",
		"enabled":  true,
	})
	require.NoError(t, err)
	_, err = tests.CreateRecord(hub, "service_control_rules", map[string]any{
		"system":   systemRecord.Id,
		"platform": "windows",
		"name":     "DisabledService",
		"enabled":  false,
	})
	require.NoError(t, err)

	sys := systems.NewTestSystemForRecords(hub.GetSystemManager(), systemRecord)

	require.Equal(t, []string{"Spooler"}, sys.GetMonitoredServiceNamesForTest())
}

func TestLinuxContainerDoesNotRequestServiceOrSoftwareMonitoring(t *testing.T) {
	hub, err := tests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := tests.CreateUser(hub, "linux-service-options@example.com", "testtesttest")
	require.NoError(t, err)

	systemRecord, err := tests.CreateRecord(hub, "systems", map[string]any{
		"name":   "Linux container agent",
		"status": "up",
		"users":  []string{user.Id},
		"info": map[string]any{
			"cap": map[string]any{
				"platform":      "linux",
				"run_mode":      "docker",
				"agent_profile": "linux-container",
				"collection":    []string{"metrics_basic", "containers"},
				"operations":    []string{"container_control"},
			},
		},
	})
	require.NoError(t, err)

	_, err = tests.CreateRecord(hub, "service_control_rules", map[string]any{
		"system":   systemRecord.Id,
		"platform": "linux",
		"name":     "docker",
		"enabled":  true,
	})
	require.NoError(t, err)
	_, err = tests.CreateRecord(hub, "software_monitor_rules", map[string]any{
		"system":       systemRecord.Id,
		"platform":     "linux",
		"name":         "clash",
		"display_name": "clash",
		"enabled":      true,
	})
	require.NoError(t, err)

	sys := systems.NewTestSystemForRecords(hub.GetSystemManager(), systemRecord)

	require.Empty(t, sys.GetMonitoredServiceNamesForTest())
	require.Empty(t, sys.GetMonitoredSoftwareNamesForTest())
}
