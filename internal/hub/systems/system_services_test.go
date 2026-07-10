//go:build testing

package systems_test

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/stretchr/testify/require"
	"gutenacht.site/pulse/internal/entities/service"
	"gutenacht.site/pulse/internal/entities/system"
	"gutenacht.site/pulse/internal/hub/systems"
	"gutenacht.site/pulse/internal/tests"
)

func TestCreateMonitoredServiceRecordsOnlyUpdatesConfiguredServices(t *testing.T) {
	hub, err := tests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := tests.CreateUser(hub, "services@example.com", "testtesttest")
	require.NoError(t, err)

	systemRecord, err := tests.CreateRecord(hub, "systems", map[string]any{
		"name":   "Windows workstation",
		"status": "up",
		"users":  []string{user.Id},
	})
	require.NoError(t, err)

	sys := systems.NewTestSystemForRecords(hub.GetSystemManager(), systemRecord)

	systemRecord, err = sys.CreateRecords(&system.CombinedData{
		Stats: system.Stats{},
		Info:  system.Info{ManagedServices: []uint16{252, 42}},
		Services: []*service.Service{
			{Name: "Spooler", DisplayName: "Print Spooler", Platform: "windows", State: service.StateRunning, StartType: "auto"},
			{Name: "OtherService", DisplayName: "Other Service", Platform: "windows", State: service.StateRunning, StartType: "auto"},
		},
	})
	require.NoError(t, err)

	records, err := hub.FindRecordsByFilter("monitored_services", "system = {:system}", "", 10, 0, map[string]any{
		"system": systemRecord.Id,
	})
	require.NoError(t, err)
	require.Empty(t, records)
	assertManagedServicesSummary(t, systemRecord, []uint16{0, 0})

	_, err = tests.CreateRecord(hub, "service_control_rules", map[string]any{
		"system":   systemRecord.Id,
		"platform": "windows",
		"name":     "Spooler",
		"enabled":  true,
	})
	require.NoError(t, err)

	systemRecord, err = sys.CreateRecords(&system.CombinedData{
		Stats: system.Stats{},
		Info:  system.Info{ManagedServices: []uint16{252, 42}},
		Services: []*service.Service{
			{Name: "Spooler", DisplayName: "Print Spooler", Platform: "windows", State: service.StateStopped, StartType: "manual"},
			{Name: "OtherService", DisplayName: "Other Service", Platform: "windows", State: service.StateStopped, StartType: "manual"},
		},
	})
	require.NoError(t, err)

	records, err = hub.FindRecordsByFilter("monitored_services", "system = {:system}", "", 10, 0, map[string]any{
		"system": systemRecord.Id,
	})
	require.NoError(t, err)
	require.Len(t, records, 1)
	require.Equal(t, "Spooler", records[0].GetString("name"))
	require.Equal(t, "Print Spooler", records[0].GetString("display_name"))
	require.Equal(t, "windows", records[0].GetString("platform"))
	require.Equal(t, int(service.StateStopped), records[0].GetInt("state"))
	require.Equal(t, "manual", records[0].GetString("start_type"))
	assertManagedServicesSummary(t, systemRecord, []uint16{1, 1})
}

func TestLinuxContainerCreateRecordsRemovesUnsupportedImportantMonitoring(t *testing.T) {
	hub, err := tests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := tests.CreateUser(hub, "linux-cleanup@example.com", "testtesttest")
	require.NoError(t, err)

	systemRecord, err := tests.CreateRecord(hub, "systems", map[string]any{
		"name":   "Linux container agent",
		"status": "up",
		"users":  []string{user.Id},
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
	require.NoError(t, createInternalRecord(hub, "monitored_services", map[string]any{
		"system":       systemRecord.Id,
		"platform":     "linux",
		"name":         "docker",
		"display_name": "Docker",
		"state":        1,
		"start_type":   "auto",
		"updated":      int64(1),
	}))
	require.NoError(t, createInternalRecord(hub, "monitored_software", map[string]any{
		"system":       systemRecord.Id,
		"platform":     "linux",
		"name":         "clash",
		"display_name": "clash",
		"state":        1,
		"updated":      int64(1),
	}))

	sys := systems.NewTestSystemForRecords(hub.GetSystemManager(), systemRecord)
	systemRecord, err = sys.CreateRecords(&system.CombinedData{
		Stats: system.Stats{},
		Info: system.Info{
			Capabilities: &system.AgentCapabilities{
				Platform:     "linux",
				RunMode:      "docker",
				AgentProfile: "linux-container",
				Collection:   []string{"metrics_basic", "containers", "software_monitor"},
				Operations:   []string{"container_control", "service_control"},
			},
		},
		Services: []*service.Service{{Name: "docker", DisplayName: "Docker", Platform: "linux", State: service.StateRunning}},
		Software: []*service.Service{{Name: "clash", DisplayName: "clash", Platform: "linux", State: service.StateRunning}},
	})
	require.NoError(t, err)

	assertEmptyRecords(t, hub, "service_control_rules", systemRecord.Id)
	assertEmptyRecords(t, hub, "software_monitor_rules", systemRecord.Id)
	assertEmptyRecords(t, hub, "monitored_services", systemRecord.Id)
	assertEmptyRecords(t, hub, "monitored_software", systemRecord.Id)
}

func TestCreateRecordsDoesNotRemoveImportantMonitoringForWindowsOrEmptyInfo(t *testing.T) {
	hub, err := tests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := tests.CreateUser(hub, "windows-rules@example.com", "testtesttest")
	require.NoError(t, err)

	for _, tc := range []struct {
		name string
		info system.Info
	}{
		{name: "empty info"},
		{
			name: "windows host",
			info: system.Info{
				ConnectionType: system.ConnectionTypeWebSocket,
				Capabilities: &system.AgentCapabilities{
					Platform:     "windows",
					RunMode:      "windows_service",
					AgentProfile: "windows-host",
					Collection:   []string{"metrics_basic", "software_monitor", "windows_services"},
					Operations:   []string{"agent_update", "service_control"},
				},
			},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			systemRecord, err := tests.CreateRecord(hub, "systems", map[string]any{
				"name":   tc.name,
				"status": "up",
				"users":  []string{user.Id},
			})
			require.NoError(t, err)

			_, err = tests.CreateRecord(hub, "service_control_rules", map[string]any{
				"system":   systemRecord.Id,
				"platform": "windows",
				"name":     "pulse-agent",
				"enabled":  true,
			})
			require.NoError(t, err)
			_, err = tests.CreateRecord(hub, "software_monitor_rules", map[string]any{
				"system":       systemRecord.Id,
				"platform":     "windows",
				"name":         "pulse-agent.exe",
				"display_name": "Pulse Agent",
				"enabled":      true,
			})
			require.NoError(t, err)

			sys := systems.NewTestSystemForRecords(hub.GetSystemManager(), systemRecord)
			_, err = sys.CreateRecords(&system.CombinedData{Stats: system.Stats{}, Info: tc.info})
			require.NoError(t, err)

			assertRecordCount(t, hub, "service_control_rules", systemRecord.Id, 1)
			assertRecordCount(t, hub, "software_monitor_rules", systemRecord.Id, 1)
		})
	}
}

func TestCreateRecordsSyncsMonitoredServiceAlertHistory(t *testing.T) {
	hub, err := tests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := tests.CreateUser(hub, "service-alerts@example.com", "testtesttest")
	require.NoError(t, err)
	_, err = tests.CreateRecord(hub, "user_settings", map[string]any{
		"user":     user.Id,
		"settings": `{"webhooks":[]}`,
	})
	require.NoError(t, err)

	assetRecord, err := tests.CreateRecord(hub, "assets", map[string]any{
		"user":   user.Id,
		"name":   "Windows workstation asset",
		"type":   "physical_host",
		"status": "active",
	})
	require.NoError(t, err)
	systemRecord, err := tests.CreateRecord(hub, "systems", map[string]any{
		"name":   "Windows workstation",
		"asset":  assetRecord.Id,
		"status": "up",
		"users":  []string{user.Id},
	})
	require.NoError(t, err)
	_, err = tests.CreateRecord(hub, "service_control_rules", map[string]any{
		"system":   systemRecord.Id,
		"platform": "windows",
		"name":     "Spooler",
		"enabled":  true,
	})
	require.NoError(t, err)

	sys := systems.NewTestSystemForRecords(hub.GetSystemManager(), systemRecord)
	_, err = sys.CreateRecords(&system.CombinedData{
		Stats: system.Stats{},
		Info:  system.Info{ManagedServices: []uint16{1, 1}},
		Services: []*service.Service{
			{Name: "Spooler", DisplayName: "Print Spooler", Platform: "windows", State: service.StateStopped},
		},
	})
	require.NoError(t, err)

	history, err := hub.FindRecordsByFilter(
		"alerts_history",
		"name = {:name} && system = {:system}",
		"",
		0,
		0,
		map[string]any{"name": "服务：Print Spooler", "system": systemRecord.Id},
	)
	require.NoError(t, err)
	require.Len(t, history, 1)
	require.Equal(t, float64(1), history[0].GetFloat("value"))
	require.Equal(t, assetRecord.Id, history[0].GetString("asset"))
	require.Empty(t, history[0].GetString("resolved"))

	_, err = sys.CreateRecords(&system.CombinedData{
		Stats: system.Stats{},
		Info:  system.Info{ManagedServices: []uint16{1, 1}},
		Services: []*service.Service{
			{Name: "Spooler", DisplayName: "Print Spooler", Platform: "windows", State: service.StateStopped},
		},
	})
	require.NoError(t, err)
	history, err = hub.FindRecordsByFilter(
		"alerts_history",
		"name = {:name} && system = {:system}",
		"",
		0,
		0,
		map[string]any{"name": "服务：Print Spooler", "system": systemRecord.Id},
	)
	require.NoError(t, err)
	require.Len(t, history, 1)

	_, err = sys.CreateRecords(&system.CombinedData{
		Stats: system.Stats{},
		Info:  system.Info{ManagedServices: []uint16{1, 0}},
		Services: []*service.Service{
			{Name: "Spooler", DisplayName: "Print Spooler", Platform: "windows", State: service.StateRunning},
		},
	})
	require.NoError(t, err)
	resolvedHistory, err := hub.FindRecordById("alerts_history", history[0].Id)
	require.NoError(t, err)
	require.NotEmpty(t, resolvedHistory.GetString("resolved"))
}

func TestCreateRecordsSyncsMonitoredSoftwareAlertHistory(t *testing.T) {
	hub, err := tests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := tests.CreateUser(hub, "software-alerts@example.com", "testtesttest")
	require.NoError(t, err)
	_, err = tests.CreateRecord(hub, "user_settings", map[string]any{
		"user":     user.Id,
		"settings": `{"webhooks":[]}`,
	})
	require.NoError(t, err)

	systemRecord, err := tests.CreateRecord(hub, "systems", map[string]any{
		"name":   "Windows workstation",
		"status": "up",
		"users":  []string{user.Id},
	})
	require.NoError(t, err)
	_, err = tests.CreateRecord(hub, "software_monitor_rules", map[string]any{
		"system":       systemRecord.Id,
		"platform":     "windows",
		"name":         "obs64",
		"display_name": "OBS Studio",
		"enabled":      true,
	})
	require.NoError(t, err)

	sys := systems.NewTestSystemForRecords(hub.GetSystemManager(), systemRecord)
	_, err = sys.CreateRecords(&system.CombinedData{
		Stats: system.Stats{},
		Info:  system.Info{},
		Software: []*service.Service{
			{Name: "obs64", DisplayName: "", Platform: "windows", State: service.StateStopped},
		},
	})
	require.NoError(t, err)

	history, err := hub.FindRecordsByFilter(
		"alerts_history",
		"name = {:name} && system = {:system}",
		"",
		0,
		0,
		map[string]any{"name": "软件：OBS Studio", "system": systemRecord.Id},
	)
	require.NoError(t, err)
	require.Len(t, history, 1)
	require.Equal(t, float64(1), history[0].GetFloat("value"))
	require.Empty(t, history[0].GetString("resolved"))

	_, err = sys.CreateRecords(&system.CombinedData{
		Stats: system.Stats{},
		Info:  system.Info{},
		Software: []*service.Service{
			{Name: "obs64", DisplayName: "obs64.exe", Platform: "windows", State: service.StateRunning},
		},
	})
	require.NoError(t, err)
	resolvedHistory, err := hub.FindRecordById("alerts_history", history[0].Id)
	require.NoError(t, err)
	require.NotEmpty(t, resolvedHistory.GetString("resolved"))
}

func assertManagedServicesSummary(t *testing.T, record interface {
	UnmarshalJSONField(string, any) error
}, expected []uint16) {
	t.Helper()
	var info system.Info
	require.NoError(t, record.UnmarshalJSONField("info", &info))
	require.Equal(t, expected, info.ManagedServices)
}

func assertEmptyRecords(t *testing.T, hub *tests.TestHub, collection string, systemId string) {
	t.Helper()
	records, err := hub.FindRecordsByFilter(collection, "system = {:system}", "", 10, 0, map[string]any{
		"system": systemId,
	})
	require.NoError(t, err)
	require.Empty(t, records)
}

func assertRecordCount(t *testing.T, hub *tests.TestHub, collection string, systemId string, expected int) {
	t.Helper()
	records, err := hub.FindRecordsByFilter(collection, "system = {:system}", "", 10, 0, map[string]any{
		"system": systemId,
	})
	require.NoError(t, err)
	require.Len(t, records, expected)
}

func createInternalRecord(hub *tests.TestHub, collectionName string, fields map[string]any) error {
	collection, err := hub.FindCachedCollectionByNameOrId(collectionName)
	if err != nil {
		return err
	}
	record := core.NewRecord(collection)
	record.Load(fields)
	return hub.SaveNoValidate(record)
}
