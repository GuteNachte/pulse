//go:build testing

package systems_test

import (
	"fmt"
	"sync"
	"testing"
	"testing/synctest"
	"time"

	"gutenacht.site/pulse/internal/entities/container"
	"gutenacht.site/pulse/internal/entities/system"
	"gutenacht.site/pulse/internal/hub/systems"
	"gutenacht.site/pulse/internal/tests"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSystemManagerNew(t *testing.T) {
	hub, err := tests.NewTestHub(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer hub.Cleanup()
	sm := hub.GetSystemManager()

	user, err := tests.CreateUser(hub, "test@test.com", "testtesttest")
	require.NoError(t, err)

	synctest.Test(t, func(t *testing.T) {
		sm.Initialize()

		record, err := tests.CreateRecord(hub, "systems", map[string]any{
			"name":  "it-was-coney-island",
			"users": []string{user.Id},
		})
		require.NoError(t, err)

		assert.Equal(t, "pending", record.GetString("status"), "System status should be 'pending'")
		assert.Equal(t, "pending", sm.GetSystemStatusFromStore(record.Id), "System status should be 'pending'")

		assert.False(t, sm.SystemHasLegacyHostPort(record.Id), "System should not carry legacy host/port transport fields")

		time.Sleep(13 * time.Second)
		synctest.Wait()

		assert.Equal(t, "pending", record.Fresh().GetString("status"), "System status should be 'pending'")
		// Verify the system was added by checking if it exists
		assert.True(t, sm.HasSystem(record.Id), "System should exist in the store")

		time.Sleep(10 * time.Second)
		synctest.Wait()

		// system should be set to down after 15 seconds (no websocket connection)
		assert.Equal(t, "down", sm.GetSystemStatusFromStore(record.Id), "System status should be 'down'")
		// make sure the system is down in the db
		record, err = hub.FindRecordById("systems", record.Id)
		require.NoError(t, err)
		assert.Equal(t, "down", record.GetString("status"), "System status should be 'down'")

		assert.Equal(t, 1, sm.GetSystemCount(), "System count should be 1")

		err = sm.RemoveSystem(record.Id)
		assert.NoError(t, err)

		assert.Equal(t, 0, sm.GetSystemCount(), "System count should be 0")
		assert.False(t, sm.HasSystem(record.Id), "System should not exist in the store after removal")

		// let's also make sure a system is removed from the store when the record is deleted
		record, err = tests.CreateRecord(hub, "systems", map[string]any{
			"name":  "there-was-no-place-like-it",
			"users": []string{user.Id},
		})
		require.NoError(t, err)

		assert.True(t, sm.HasSystem(record.Id), "System should exist in the store after creation")

		time.Sleep(8 * time.Second)
		synctest.Wait()
		assert.Equal(t, "pending", sm.GetSystemStatusFromStore(record.Id), "System status should be 'pending'")

		sm.SetSystemStatusInDB(record.Id, "up")
		time.Sleep(time.Second)
		synctest.Wait()
		assert.Equal(t, "up", sm.GetSystemStatusFromStore(record.Id), "System status should be 'up'")

		// make sure the system switches to down after 11 seconds
		sm.RemoveSystem(record.Id)
		sm.AddRecord(record, nil)
		assert.Equal(t, "pending", sm.GetSystemStatusFromStore(record.Id), "System status should be 'pending'")
		time.Sleep(12 * time.Second)
		synctest.Wait()
		assert.Equal(t, "down", sm.GetSystemStatusFromStore(record.Id), "System status should be 'down'")

		// sm.SetSystemStatusInDB(record.Id, "paused")
		// time.Sleep(time.Second)
		// synctest.Wait()
		// assert.Equal(t, "paused", sm.GetSystemStatusFromStore(record.Id), "System status should be 'paused'")

		// delete the record
		err = hub.Delete(record)
		require.NoError(t, err)
		assert.False(t, sm.HasSystem(record.Id), "System should not exist in the store after deletion")
	})

	testOld(t, hub)

	synctest.Test(t, func(t *testing.T) {
		time.Sleep(time.Second)
		synctest.Wait()

		for _, systemId := range sm.GetAllSystemIDs() {
			err = sm.RemoveSystem(systemId)
			require.NoError(t, err)
			assert.False(t, sm.HasSystem(systemId), "System should not exist in the store after deletion")
		}

		assert.Equal(t, 0, sm.GetSystemCount(), "System count should be 0")

		// TODO: test with websocket client
	})
}

func TestSystemCreateRecordsDeletesStaleContainerRecords(t *testing.T) {
	hub, err := tests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := tests.CreateUser(hub, "containers@test.com", "testtesttest")
	require.NoError(t, err)

	systemRecord, err := tests.CreateRecord(hub, "systems", map[string]any{
		"name":  "container-system",
		"users": []string{user.Id},
	})
	require.NoError(t, err)
	otherSystemRecord, err := tests.CreateRecord(hub, "systems", map[string]any{
		"name":  "other-container-system",
		"users": []string{user.Id},
	})
	require.NoError(t, err)

	_, err = tests.CreateRecord(hub, "containers", map[string]any{
		"id":      "abcdef123456",
		"system":  systemRecord.Id,
		"name":    "old-agent",
		"image":   "test-image",
		"status":  "Up",
		"updated": time.Now().UTC().UnixMilli(),
	})
	require.NoError(t, err)
	_, err = tests.CreateRecord(hub, "containers", map[string]any{
		"id":      "bbbbbb123456",
		"system":  otherSystemRecord.Id,
		"name":    "other-agent",
		"image":   "test-image",
		"status":  "Up",
		"updated": time.Now().UTC().UnixMilli(),
	})
	require.NoError(t, err)

	sys := systems.NewTestSystemForRecords(hub.GetSystemManager(), systemRecord)
	_, err = sys.CreateRecords(&system.CombinedData{
		Stats: system.Stats{},
		Info:  system.Info{},
		Containers: []*container.Stats{
			{
				Id:     "123456abcdef",
				Name:   "worker",
				Image:  "example/worker:1.0.0",
				Status: "Up Less than a second",
				Stack: container.StackInfo{
					Project: "agent",
					Service: "worker",
					Trusted: true,
				},
			},
		},
	})
	require.NoError(t, err)

	_, err = hub.FindRecordById("containers", "abcdef123456")
	require.Error(t, err)

	newRecord, err := hub.FindRecordById("containers", "123456abcdef")
	require.NoError(t, err)
	assert.Equal(t, systemRecord.Id, newRecord.GetString("system"))
	assert.Equal(t, "agent", newRecord.GetString("stack_project"))
	assert.Equal(t, "worker", newRecord.GetString("stack_service"))

	otherRecord, err := hub.FindRecordById("containers", "bbbbbb123456")
	require.NoError(t, err)
	assert.Equal(t, otherSystemRecord.Id, otherRecord.GetString("system"))
}

func TestSystemCreateRecordsIgnoresUntrustedPartialContainerStackLabels(t *testing.T) {
	hub, err := tests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := tests.CreateUser(hub, "containers-untrusted-stack@test.com", "testtesttest")
	require.NoError(t, err)

	systemRecord, err := tests.CreateRecord(hub, "systems", map[string]any{
		"name":  "nacht",
		"users": []string{user.Id},
	})
	require.NoError(t, err)

	sys := systems.NewTestSystemForRecords(hub.GetSystemManager(), systemRecord)
	_, err = sys.CreateRecords(&system.CombinedData{
		Stats: system.Stats{},
		Info:  system.Info{},
		Containers: []*container.Stats{
			{
				Id:     "partialstack",
				Name:   "loose-container",
				Image:  "example/loose:1.0.0",
				Status: "Up 2 minutes",
				Stack:  container.StackInfo{Project: "harbor"},
			},
		},
	})
	require.NoError(t, err)

	record, err := hub.FindRecordById("containers", "partialstack")
	require.NoError(t, err)
	assert.Equal(t, "", record.GetString("stack_project"))
	assert.Equal(t, "", record.GetString("stack_service"))
}

func TestSystemCreateRecordsClearsPulseContainerStackLabels(t *testing.T) {
	hub, err := tests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := tests.CreateUser(hub, "containers-stack@test.com", "testtesttest")
	require.NoError(t, err)

	systemRecord, err := tests.CreateRecord(hub, "systems", map[string]any{
		"name":  "nacht",
		"users": []string{user.Id},
	})
	require.NoError(t, err)

	sys := systems.NewTestSystemForRecords(hub.GetSystemManager(), systemRecord)
	_, err = sys.CreateRecords(&system.CombinedData{
		Stats: system.Stats{},
		Info:  system.Info{},
		Containers: []*container.Stats{
			{
				Id:     "registryctl1",
				Name:   "registryctl",
				Image:  "goharbor/harbor-registryctl:v2.14.4",
				Status: "Up 2 days",
				Stack:  container.StackInfo{Project: "harbor", Service: "registryctl", Number: "1"},
			},
			{
				Id:     "pulseagent1",
				Name:   "pulse-agent",
				Image:  "registry.example.com/infra/pulse-agent:1.0.3",
				Status: "Up 26 hours",
				Stack:  container.StackInfo{Project: "harbor", Service: "registryctl", Number: "1"},
			},
		},
	})
	require.NoError(t, err)

	harborRecord, err := hub.FindRecordById("containers", "registryctl1")
	require.NoError(t, err)
	assert.Equal(t, "harbor", harborRecord.GetString("stack_project"))
	assert.Equal(t, "registryctl", harborRecord.GetString("stack_service"))

	agentRecord, err := hub.FindRecordById("containers", "pulseagent1")
	require.NoError(t, err)
	assert.Equal(t, "", agentRecord.GetString("stack_project"))
	assert.Equal(t, "", agentRecord.GetString("stack_service"))
	assert.Equal(t, "", agentRecord.GetString("stack_number"))
}

func TestSystemCreateRecordsPreservesLocalSystemDisplayName(t *testing.T) {
	hub, err := tests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := tests.CreateUser(hub, "local-system@test.com", "testtesttest")
	require.NoError(t, err)

	systemRecord, err := tests.CreateRecord(hub, "systems", map[string]any{
		"name":     "GuteNacht",
		"is_local": true,
		"users":    []string{user.Id},
	})
	require.NoError(t, err)

	sys := systems.NewTestSystemForRecords(hub.GetSystemManager(), systemRecord)
	_, err = sys.CreateRecords(&system.CombinedData{
		Stats:   system.Stats{},
		Info:    system.Info{},
		Details: &system.Details{Hostname: "GuteNacht"},
	})
	require.NoError(t, err)

	updatedRecord, err := hub.FindRecordById("systems", systemRecord.Id)
	require.NoError(t, err)
	assert.Equal(t, "GuteNacht", updatedRecord.GetString("name"))
	assert.True(t, updatedRecord.GetBool("is_local"))
}

func TestSystemCreateRecordsMigratesLegacyLocalSystemName(t *testing.T) {
	hub, err := tests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := tests.CreateUser(hub, "legacy-local-system@test.com", "testtesttest")
	require.NoError(t, err)

	systemRecord, err := tests.CreateRecord(hub, "systems", map[string]any{
		"name":     "本机",
		"is_local": true,
		"users":    []string{user.Id},
	})
	require.NoError(t, err)

	sys := systems.NewTestSystemForRecords(hub.GetSystemManager(), systemRecord)
	_, err = sys.CreateRecords(&system.CombinedData{
		Stats:   system.Stats{},
		Info:    system.Info{},
		Details: &system.Details{Hostname: "hub-hostname"},
	})
	require.NoError(t, err)

	updatedRecord, err := hub.FindRecordById("systems", systemRecord.Id)
	require.NoError(t, err)
	assert.Equal(t, "hub-hostname", updatedRecord.GetString("name"))
	assert.True(t, updatedRecord.GetBool("is_local"))
}

func TestSystemCreateRecordsClearsLocalMarkerForWindowsHostAgent(t *testing.T) {
	hub, err := tests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := tests.CreateUser(hub, "stale-local-system@test.com", "testtesttest")
	require.NoError(t, err)

	systemRecord, err := tests.CreateRecord(hub, "systems", map[string]any{
		"name":        "GuteNacht",
		"is_local":    true,
		"users":       []string{user.Id},
		"description": "自己主要用的机器",
	})
	require.NoError(t, err)

	sys := systems.NewTestSystemForRecords(hub.GetSystemManager(), systemRecord)
	_, err = sys.CreateRecords(&system.CombinedData{
		Stats: system.Stats{},
		Info: system.Info{
			Capabilities: &system.AgentCapabilities{
				Platform:      "windows",
				InstallMethod: "windows",
				RunMode:       "windows_service",
				AgentProfile:  "windows-host",
			},
		},
		Details: &system.Details{Hostname: "GuteNacht"},
	})
	require.NoError(t, err)

	updatedRecord, err := hub.FindRecordById("systems", systemRecord.Id)
	require.NoError(t, err)
	assert.Equal(t, "GuteNacht", updatedRecord.GetString("name"))
	assert.False(t, updatedRecord.GetBool("is_local"))
}

func TestSystemCreateRecordsStoresAgentHostnameSeparatelyFromDisplayName(t *testing.T) {
	hub, err := tests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := tests.CreateUser(hub, "remote-system@test.com", "testtesttest")
	require.NoError(t, err)

	systemRecord, err := tests.CreateRecord(hub, "systems", map[string]any{
		"name":         "旧名称",
		"display_name": "旧名称",
		"is_local":     false,
		"users":        []string{user.Id},
	})
	require.NoError(t, err)

	sys := systems.NewTestSystemForRecords(hub.GetSystemManager(), systemRecord)
	_, err = sys.CreateRecords(&system.CombinedData{
		Stats:   system.Stats{},
		Info:    system.Info{},
		Details: &system.Details{Hostname: "remote-hostname"},
	})
	require.NoError(t, err)

	updatedRecord, err := hub.FindRecordById("systems", systemRecord.Id)
	require.NoError(t, err)
	assert.Equal(t, "remote-hostname", updatedRecord.GetString("name"))
	assert.Equal(t, "旧名称", updatedRecord.GetString("display_name"))
	assert.False(t, updatedRecord.GetBool("is_local"))
}

func TestSystemCreateRecordsReplacesLegacyLocalNameOnNonLocalSystem(t *testing.T) {
	hub, err := tests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := tests.CreateUser(hub, "remote-system-legacy-name@test.com", "testtesttest")
	require.NoError(t, err)

	systemRecord, err := tests.CreateRecord(hub, "systems", map[string]any{
		"name":     "本机",
		"is_local": false,
		"users":    []string{user.Id},
	})
	require.NoError(t, err)

	sys := systems.NewTestSystemForRecords(hub.GetSystemManager(), systemRecord)
	_, err = sys.CreateRecords(&system.CombinedData{
		Stats:   system.Stats{},
		Info:    system.Info{},
		Details: &system.Details{Hostname: "remote-hostname"},
	})
	require.NoError(t, err)

	updatedRecord, err := hub.FindRecordById("systems", systemRecord.Id)
	require.NoError(t, err)
	assert.Equal(t, "remote-hostname", updatedRecord.GetString("name"))
	assert.False(t, updatedRecord.GetBool("is_local"))
}

func TestSystemCreateRecordsSyncsContainerAlertHistory(t *testing.T) {
	hub, err := tests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := tests.CreateUser(hub, "container-alerts@test.com", "testtesttest")
	require.NoError(t, err)
	_, err = tests.CreateRecord(hub, "user_settings", map[string]any{
		"user":     user.Id,
		"settings": `{"webhooks":[]}`,
	})
	require.NoError(t, err)

	systemRecord, err := tests.CreateRecord(hub, "systems", map[string]any{
		"name":  "container-alert-system",
		"users": []string{user.Id},
	})
	require.NoError(t, err)

	sys := systems.NewTestSystemForRecords(hub.GetSystemManager(), systemRecord)
	_, err = sys.CreateRecords(&system.CombinedData{
		Stats: system.Stats{},
		Info:  system.Info{},
		Containers: []*container.Stats{
			{
				Id:     "aaa111bbb222",
				Name:   "redis",
				Image:  "redis:7",
				Status: "Exited (0) 1 minute ago",
			},
		},
	})
	require.NoError(t, err)

	history, err := hub.FindRecordsByFilter(
		"alerts_history",
		"name = {:name} && system = {:system}",
		"",
		0,
		0,
		map[string]any{"name": "容器：redis", "system": systemRecord.Id},
	)
	require.NoError(t, err)
	require.Len(t, history, 1)
	assert.Equal(t, float64(1), history[0].GetFloat("value"))
	assert.Empty(t, history[0].GetString("resolved"))

	_, err = sys.CreateRecords(&system.CombinedData{
		Stats: system.Stats{},
		Info:  system.Info{},
		Containers: []*container.Stats{
			{
				Id:     "aaa111bbb222",
				Name:   "redis",
				Image:  "redis:7",
				Status: "Exited (0) 2 minutes ago",
			},
		},
	})
	require.NoError(t, err)
	history, err = hub.FindRecordsByFilter(
		"alerts_history",
		"name = {:name} && system = {:system}",
		"",
		0,
		0,
		map[string]any{"name": "容器：redis", "system": systemRecord.Id},
	)
	require.NoError(t, err)
	require.Len(t, history, 1, "continuing abnormal state should not duplicate active history")

	_, err = sys.CreateRecords(&system.CombinedData{
		Stats: system.Stats{},
		Info:  system.Info{},
		Containers: []*container.Stats{
			{
				Id:     "aaa111bbb222",
				Name:   "redis",
				Image:  "redis:7",
				Status: "Up 2 minutes",
			},
		},
	})
	require.NoError(t, err)
	history, err = hub.FindRecordsByFilter(
		"alerts_history",
		"name = {:name} && system = {:system}",
		"",
		0,
		0,
		map[string]any{"name": "容器：redis", "system": systemRecord.Id},
	)
	require.NoError(t, err)
	require.Len(t, history, 1)
	assert.NotEmpty(t, history[0].Fresh().GetString("resolved"))
}

func TestSystemCreateRecordsAggregatesStackContainerAlerts(t *testing.T) {
	hub, err := tests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := tests.CreateUser(hub, "stack-alerts@test.com", "testtesttest")
	require.NoError(t, err)
	_, err = tests.CreateRecord(hub, "user_settings", map[string]any{
		"user":     user.Id,
		"settings": `{"webhooks":[]}`,
	})
	require.NoError(t, err)

	systemRecord, err := tests.CreateRecord(hub, "systems", map[string]any{
		"name":  "stack-alert-system",
		"users": []string{user.Id},
	})
	require.NoError(t, err)

	sys := systems.NewTestSystemForRecords(hub.GetSystemManager(), systemRecord)
	_, err = sys.CreateRecords(&system.CombinedData{
		Stats: system.Stats{},
		Info:  system.Info{},
		Containers: []*container.Stats{
			{
				Id:     "111111aaaaaa",
				Name:   "registry",
				Image:  "registry:2",
				Status: "Up 3 minutes",
				Stack:  container.StackInfo{Project: "harbor", Service: "registry", Trusted: true},
			},
			{
				Id:     "222222bbbbbb",
				Name:   "harbor-log",
				Image:  "goharbor/harbor-log:v2.14.4",
				Status: "Exited (1) 30 seconds ago",
				Stack:  container.StackInfo{Project: "harbor", Service: "log", Trusted: true},
			},
			{
				Id:     "333333cccccc",
				Name:   "jobservice",
				Image:  "goharbor/harbor-jobservice:v2.14.4",
				Status: "Up 3 minutes",
				Health: container.DockerHealthUnhealthy,
				Stack:  container.StackInfo{Project: "harbor", Service: "jobservice", Trusted: true},
			},
		},
	})
	require.NoError(t, err)

	history, err := hub.FindRecordsByFilter(
		"alerts_history",
		"name = {:name} && system = {:system}",
		"",
		0,
		0,
		map[string]any{"name": "编排：harbor", "system": systemRecord.Id},
	)
	require.NoError(t, err)
	require.Len(t, history, 1)
	assert.Equal(t, float64(2), history[0].GetFloat("value"))

	_, err = sys.CreateRecords(&system.CombinedData{
		Stats: system.Stats{},
		Info:  system.Info{},
		Containers: []*container.Stats{
			{
				Id:     "111111aaaaaa",
				Name:   "registry",
				Image:  "registry:2",
				Status: "Up 5 minutes",
				Stack:  container.StackInfo{Project: "harbor", Service: "registry", Trusted: true},
			},
			{
				Id:     "222222bbbbbb",
				Name:   "harbor-log",
				Image:  "goharbor/harbor-log:v2.14.4",
				Status: "Up 1 minute",
				Stack:  container.StackInfo{Project: "harbor", Service: "log", Trusted: true},
			},
			{
				Id:     "333333cccccc",
				Name:   "jobservice",
				Image:  "goharbor/harbor-jobservice:v2.14.4",
				Status: "Up 5 minutes",
				Health: container.DockerHealthHealthy,
				Stack:  container.StackInfo{Project: "harbor", Service: "jobservice", Trusted: true},
			},
		},
	})
	require.NoError(t, err)
	resolvedHistory, err := hub.FindRecordById("alerts_history", history[0].Id)
	require.NoError(t, err)
	assert.NotEmpty(t, resolvedHistory.GetString("resolved"))
}

func testOld(t *testing.T, hub *tests.TestHub) {
	user, err := tests.CreateUser(hub, "test@testy.com", "testtesttest")
	require.NoError(t, err)

	sm := hub.GetSystemManager()
	assert.NotNil(t, sm)

	// error expected when creating a user with a duplicate email
	_, err = tests.CreateUser(hub, "test@test.com", "testtesttest")
	require.Error(t, err)

	// Test collection existence. todo: move to hub package tests
	t.Run("CollectionExistence", func(t *testing.T) {
		// Verify that required collections exist
		systems, err := hub.FindCachedCollectionByNameOrId("systems")
		require.NoError(t, err)
		assert.NotNil(t, systems)

		systemStats, err := hub.FindCachedCollectionByNameOrId("system_stats")
		require.NoError(t, err)
		assert.NotNil(t, systemStats)

		containerStats, err := hub.FindCachedCollectionByNameOrId("container_stats")
		require.NoError(t, err)
		assert.NotNil(t, containerStats)
	})

	t.Run("RemoveSystem", func(t *testing.T) {
		// Get the count before adding the system
		countBefore := sm.GetSystemCount()

		// Create a test system record
		record, err := tests.CreateRecord(hub, "systems", map[string]any{
			"name":  "i-even-got-lost-at-coney-island",
			"users": []string{user.Id},
		})
		require.NoError(t, err)

		// Verify the system count increased
		countAfterAdd := sm.GetSystemCount()
		assert.Equal(t, countBefore+1, countAfterAdd, "System count should increase after adding a system via event hook")

		// Verify the system exists
		assert.True(t, sm.HasSystem(record.Id), "System should exist in the store")

		// Remove the system
		err = sm.RemoveSystem(record.Id)
		assert.NoError(t, err)

		// Check that the system count decreased
		countAfterRemove := sm.GetSystemCount()
		assert.Equal(t, countAfterAdd-1, countAfterRemove, "System count should decrease after removing a system")

		// Verify the system no longer exists
		assert.False(t, sm.HasSystem(record.Id), "System should not exist in the store after removal")

		// Verify the system is not in the list of all system IDs
		ids := sm.GetAllSystemIDs()
		assert.NotContains(t, ids, record.Id, "System ID should not be in the list of all system IDs after removal")

		// Verify the system status is empty
		status := sm.GetSystemStatusFromStore(record.Id)
		assert.Equal(t, "", status, "System status should be empty after removal")

		// Try to remove it again - should return an error since it's already removed
		err = sm.RemoveSystem(record.Id)
		assert.Error(t, err)
	})

	t.Run("NewRecordPending", func(t *testing.T) {
		// Create a test system
		record, err := tests.CreateRecord(hub, "systems", map[string]any{
			"name":  "and-you-know",
			"users": []string{user.Id},
		})
		require.NoError(t, err)

		// Add the record to the system manager
		err = sm.AddRecord(record, nil)
		require.NoError(t, err)

		// Test filtering records by status - should be "pending" now
		filter := "status = 'pending'"
		pendingSystems, err := hub.FindRecordsByFilter("systems", filter, "-created", 0, 0, nil)
		require.NoError(t, err)
		assert.GreaterOrEqual(t, len(pendingSystems), 1)
	})

	t.Run("SystemStatusUpdate", func(t *testing.T) {
		// Create a test system record
		record, err := tests.CreateRecord(hub, "systems", map[string]any{
			"name":  "we-used-to-sleep-on-the-beach",
			"users": []string{user.Id},
		})
		require.NoError(t, err)

		// Add the record to the system manager
		err = sm.AddRecord(record, nil)
		require.NoError(t, err)

		// Test status changes
		initialStatus := sm.GetSystemStatusFromStore(record.Id)

		// Set a new status
		sm.SetSystemStatusInDB(record.Id, "up")

		// Verify status was updated
		newStatus := sm.GetSystemStatusFromStore(record.Id)
		assert.Equal(t, "up", newStatus, "System status should be updated to 'up'")
		assert.NotEqual(t, initialStatus, newStatus, "Status should have changed")

		// Verify the database was updated
		updatedRecord, err := hub.FindRecordById("systems", record.Id)
		require.NoError(t, err)
		assert.Equal(t, "up", updatedRecord.Get("status"), "Database status should match")
	})

	t.Run("HandleSystemData", func(t *testing.T) {
		// Create a test system record
		record, err := tests.CreateRecord(hub, "systems", map[string]any{
			"name":  "things-changed-you-know",
			"users": []string{user.Id},
		})
		require.NoError(t, err)

		// Create test system data
		testData := &system.CombinedData{
			Details: &system.Details{
				Hostname: "data-test.example.com",
				Kernel:   "5.15.0-generic",
				Cores:    4,
				Threads:  8,
				CpuModel: "Test CPU",
			},
			Info: system.Info{
				Uptime:       3600,
				Cpu:          25.5,
				MemPct:       40.2,
				DiskPct:      60.0,
				Bandwidth:    100.0,
				AgentVersion: "1.0.0",
			},
			Stats: system.Stats{
				Cpu:         25.5,
				Mem:         16384.0,
				MemUsed:     6553.6,
				MemPct:      40.0,
				DiskTotal:   1024000.0,
				DiskUsed:    614400.0,
				DiskPct:     60.0,
				NetworkSent: 1024.0,
				NetworkRecv: 2048.0,
			},
			Containers: []*container.Stats{},
		}

		// Test handling system data. todo: move to hub/alerts package tests
		err = hub.HandleSystemAlerts(record, testData)
		assert.NoError(t, err)
	})

	t.Run("ErrorHandling", func(t *testing.T) {
		// Try to add a non-existent record
		nonExistentId := "non_existent_id"
		err := sm.RemoveSystem(nonExistentId)
		assert.Error(t, err)

		// Try to add a system without an id
		system := &systems.System{}
		err = sm.AddSystem(system)
		assert.Error(t, err)
	})

	t.Run("WebSocketOnlySystemDoesNotRequireLegacyHostPort", func(t *testing.T) {
		system := &systems.System{
			Id:     "websocket-only-test",
			Status: "pending",
		}
		err := sm.AddSystem(system)
		require.NoError(t, err)
		assert.True(t, sm.HasSystem(system.Id))
		assert.False(t, sm.SystemHasLegacyHostPort(system.Id))
		require.NoError(t, sm.RemoveSystem(system.Id))
	})

	t.Run("SystemsCollectionHasNoLegacyHostPortFields", func(t *testing.T) {
		collection, err := hub.FindCachedCollectionByNameOrId("systems")
		require.NoError(t, err)
		assert.Nil(t, collection.Fields.GetByName("host"))
		assert.Nil(t, collection.Fields.GetByName("port"))
	})

	t.Run("LegacyHostPortInputDoesNotPersist", func(t *testing.T) {
		record, err := tests.CreateRecord(hub, "systems", map[string]any{
			"name":  "legacy-transport-is-ignored",
			"host":  "192.168.1.50",
			"port":  "22",
			"users": []string{user.Id},
		})
		require.NoError(t, err)
		require.NotNil(t, record)
		assert.Empty(t, record.GetString("host"))
		assert.Empty(t, record.GetString("port"))
		assert.False(t, sm.SystemHasLegacyHostPort(record.Id))
	})

	t.Run("ConcurrentOperations", func(t *testing.T) {
		// Create a test system
		record, err := tests.CreateRecord(hub, "systems", map[string]any{
			"name":  "jfkjahkfajs",
			"users": []string{user.Id},
		})
		require.NoError(t, err)

		// Run concurrent operations
		const goroutines = 5
		var wg sync.WaitGroup
		wg.Add(goroutines)

		for i := range goroutines {
			go func(i int) {
				defer wg.Done()

				// Alternate between different operations
				switch i % 3 {
				case 0:
					status := fmt.Sprintf("status-%d", i)
					sm.SetSystemStatusInDB(record.Id, status)
				case 1:
					_ = sm.GetSystemStatusFromStore(record.Id)
				case 2:
					_ = sm.SystemHasLegacyHostPort(record.Id)
				}
			}(i)
		}

		wg.Wait()

		// Verify system still exists and is in a valid state
		assert.True(t, sm.HasSystem(record.Id), "System should still exist after concurrent operations")
		status := sm.GetSystemStatusFromStore(record.Id)
		assert.NotEmpty(t, status, "System should have a status after concurrent operations")
	})

	t.Run("ContextCancellation", func(t *testing.T) {
		// Create a test system record
		record, err := tests.CreateRecord(hub, "systems", map[string]any{
			"name":  "lkhsdfsjf",
			"users": []string{user.Id},
		})
		require.NoError(t, err)

		// Verify the system exists in the store
		assert.True(t, sm.HasSystem(record.Id), "System should exist in the store")

		// Store the original context and cancel function
		originalCtx, originalCancel, err := sm.GetSystemContextFromStore(record.Id)
		assert.NoError(t, err)

		// Ensure the context is not nil
		assert.NotNil(t, originalCtx, "System context should not be nil")
		assert.NotNil(t, originalCancel, "System cancel function should not be nil")

		// Cancel the context
		originalCancel()

		// Wait a short time for cancellation to propagate
		time.Sleep(10 * time.Millisecond)

		// Verify the context is done
		select {
		case <-originalCtx.Done():
			// Context was properly cancelled
		default:
			t.Fatal("Context was not cancelled")
		}

		// Verify the system is still in the store (cancellation shouldn't remove it)
		assert.True(t, sm.HasSystem(record.Id), "System should still exist after context cancellation")

		// Explicitly remove the system
		err = sm.RemoveSystem(record.Id)
		assert.NoError(t, err, "RemoveSystem should succeed")

		// Verify the system is removed
		assert.False(t, sm.HasSystem(record.Id), "System should be removed after RemoveSystem")

		// Try to remove it again - should return an error
		err = sm.RemoveSystem(record.Id)
		assert.Error(t, err, "RemoveSystem should fail for non-existent system")

		// Add the system back
		err = sm.AddRecord(record, nil)
		require.NoError(t, err, "AddRecord should succeed")

		// Verify the system is back in the store
		assert.True(t, sm.HasSystem(record.Id), "System should exist after re-adding")

		// Verify a new context was created
		newCtx, newCancel, err := sm.GetSystemContextFromStore(record.Id)
		assert.NoError(t, err)
		assert.NotNil(t, newCtx, "New system context should not be nil")
		assert.NotNil(t, newCancel, "New system cancel function should not be nil")
		assert.NotEqual(t, originalCtx, newCtx, "New context should be different from original")

		// Clean up
		err = sm.RemoveSystem(record.Id)
		assert.NoError(t, err)
	})
}

func TestHasUser(t *testing.T) {
	hub, err := tests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	sm := hub.GetSystemManager()
	err = sm.Initialize()
	require.NoError(t, err)

	user1, err := tests.CreateUser(hub, "user1@test.com", "password123")
	require.NoError(t, err)
	user2, err := tests.CreateUser(hub, "user2@test.com", "password123")
	require.NoError(t, err)

	systemRecord, err := tests.CreateRecord(hub, "systems", map[string]any{
		"name":  "has-user-test",
		"users": []string{user1.Id},
	})
	require.NoError(t, err)

	sys, err := sm.GetSystemFromStore(systemRecord.Id)
	require.NoError(t, err)

	t.Run("user in list returns true", func(t *testing.T) {
		assert.True(t, sys.HasUser(hub, user1))
	})

	t.Run("user not in list returns false", func(t *testing.T) {
		assert.False(t, sys.HasUser(hub, user2))
	})

	t.Run("unknown user ID returns false", func(t *testing.T) {
		assert.False(t, sys.HasUser(hub, nil))
	})

	t.Run("SHARE_ALL_SYSTEMS=true grants access to non-member", func(t *testing.T) {
		t.Setenv("SHARE_ALL_SYSTEMS", "true")
		assert.True(t, sys.HasUser(hub, user2))
	})

	t.Run("PULSE_HUB_SHARE_ALL_SYSTEMS=true grants access to non-member", func(t *testing.T) {
		t.Setenv("PULSE_HUB_SHARE_ALL_SYSTEMS", "true")
		assert.True(t, sys.HasUser(hub, user2))
	})

	t.Run("additional user works", func(t *testing.T) {
		assert.False(t, sys.HasUser(hub, user2))
		systemRecord.Set("users", []string{user1.Id, user2.Id})
		err = hub.Save(systemRecord)
		require.NoError(t, err)
		assert.True(t, sys.HasUser(hub, user1))
		assert.True(t, sys.HasUser(hub, user2))
	})
}
