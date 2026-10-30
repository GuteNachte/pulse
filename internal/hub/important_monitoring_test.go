package hub

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	pbTests "github.com/pocketbase/pocketbase/tests"
	"github.com/stretchr/testify/require"
)

func TestResolveImportantMonitoringRuleAlertsForDisabledService(t *testing.T) {
	app, cleanup, err := newImportantMonitoringTestHub(t)
	require.NoError(t, err)
	defer cleanup()

	user, system, err := createImportantMonitoringAlertFixture(app, "service-disabled@example.com")
	require.NoError(t, err)
	rule, err := createImportantMonitoringTestRecord(app, "service_control_rules", map[string]any{
		"system":   system.Id,
		"platform": "windows",
		"name":     "Spooler",
		"enabled":  true,
	})
	require.NoError(t, err)
	alert, err := createImportantMonitoringTestRecord(app, "alerts_history", map[string]any{
		"alert_id": importantMonitoringAlertIDForRule("service", rule),
		"user":     user.Id,
		"system":   system.Id,
		"name":     "服务：Print Spooler",
		"value":    1,
	})
	require.NoError(t, err)

	rule.Set("enabled", false)
	require.NoError(t, app.SaveNoValidate(rule))
	require.NoError(t, app.resolveImportantMonitoringRuleAlerts(app, "service", rule))

	resolvedAlert, err := app.FindRecordById("alerts_history", alert.Id)
	require.NoError(t, err)
	require.NotEmpty(t, resolvedAlert.GetString("resolved"))
}

func TestResolveImportantMonitoringRuleAlertsForDeletedSoftware(t *testing.T) {
	app, cleanup, err := newImportantMonitoringTestHub(t)
	require.NoError(t, err)
	defer cleanup()

	user, system, err := createImportantMonitoringAlertFixture(app, "software-deleted@example.com")
	require.NoError(t, err)
	rule, err := createImportantMonitoringTestRecord(app, "software_monitor_rules", map[string]any{
		"system":       system.Id,
		"platform":     "windows",
		"name":         "obs64",
		"display_name": "OBS Studio",
		"enabled":      true,
	})
	require.NoError(t, err)
	alert, err := createImportantMonitoringTestRecord(app, "alerts_history", map[string]any{
		"alert_id": importantMonitoringAlertIDForRule("software", rule),
		"user":     user.Id,
		"system":   system.Id,
		"name":     "软件：OBS Studio",
		"value":    1,
	})
	require.NoError(t, err)

	require.NoError(t, app.resolveImportantMonitoringRuleAlerts(app, "software", rule))
	require.NoError(t, app.Delete(rule))

	resolvedAlert, err := app.FindRecordById("alerts_history", alert.Id)
	require.NoError(t, err)
	require.NotEmpty(t, resolvedAlert.GetString("resolved"))
}

func TestDeleteImportantMonitoringRuleState(t *testing.T) {
	app, cleanup, err := newImportantMonitoringTestHub(t)
	require.NoError(t, err)
	defer cleanup()

	_, system, err := createImportantMonitoringAlertFixture(app, "rule-state@example.com")
	require.NoError(t, err)
	serviceRule, err := createImportantMonitoringTestRecord(app, "service_control_rules", map[string]any{
		"system":   system.Id,
		"platform": "windows",
		"name":     "WSearch",
		"enabled":  true,
	})
	require.NoError(t, err)
	softwareRule, err := createImportantMonitoringTestRecord(app, "software_monitor_rules", map[string]any{
		"system":       system.Id,
		"platform":     "windows",
		"name":         "explorer",
		"display_name": "explorer.exe",
		"enabled":      true,
	})
	require.NoError(t, err)
	_, err = createImportantMonitoringStateRecord(app, "monitored_services", map[string]any{
		"system":       system.Id,
		"platform":     "windows",
		"name":         "WSearch",
		"display_name": "Windows Search",
		"state":        1,
		"start_type":   "auto",
		"updated":      int64(1),
	})
	require.NoError(t, err)
	_, err = createImportantMonitoringStateRecord(app, "monitored_software", map[string]any{
		"system":       system.Id,
		"platform":     "windows",
		"name":         "explorer",
		"display_name": "explorer.exe",
		"state":        1,
		"updated":      int64(1),
	})
	require.NoError(t, err)

	require.NoError(t, app.deleteMonitoredStateForRule(app, "service", serviceRule))
	require.NoError(t, app.deleteMonitoredStateForRule(app, "software", softwareRule))

	assertNoImportantMonitoringState(t, app, "monitored_services", system.Id)
	assertNoImportantMonitoringState(t, app, "monitored_software", system.Id)
}

func TestDisableImportantMonitoringRuleCleansState(t *testing.T) {
	app, cleanup, err := newImportantMonitoringTestHub(t)
	require.NoError(t, err)
	defer cleanup()

	_, system, err := createImportantMonitoringAlertFixture(app, "disabled-state@example.com")
	require.NoError(t, err)
	rule, err := createImportantMonitoringTestRecord(app, "service_control_rules", map[string]any{
		"system":   system.Id,
		"platform": "windows",
		"name":     "WSearch",
		"enabled":  true,
	})
	require.NoError(t, err)
	_, err = createImportantMonitoringStateRecord(app, "monitored_services", map[string]any{
		"system":       system.Id,
		"platform":     "windows",
		"name":         "WSearch",
		"display_name": "Windows Search",
		"state":        1,
		"start_type":   "auto",
		"updated":      int64(1),
	})
	require.NoError(t, err)

	rule.Set("enabled", false)
	require.NoError(t, app.SaveNoValidate(rule))
	require.NoError(t, app.deleteMonitoredStateForRule(app, "service", rule))

	assertNoImportantMonitoringState(t, app, "monitored_services", system.Id)
}

func newImportantMonitoringTestHub(t *testing.T) (*Hub, func(), error) {
	t.Helper()
	testApp, err := pbTests.NewTestAppWithConfig(core.BaseAppConfig{
		DataDir:       t.TempDir(),
		EncryptionEnv: "pb_test_env",
	})
	if err != nil {
		return nil, nil, err
	}
	return NewHub(testApp), testApp.Cleanup, nil
}

func createImportantMonitoringAlertFixture(app core.App, email string) (*core.Record, *core.Record, error) {
	user, err := createImportantMonitoringTestRecord(app, "users", map[string]any{
		"email":    email,
		"password": "testtesttest",
	})
	if err != nil {
		return nil, nil, err
	}
	system, err := createImportantMonitoringTestRecord(app, "systems", map[string]any{
		"name":   "Windows workstation",
		"status": "up",
		"users":  []string{user.Id},
	})
	if err != nil {
		return nil, nil, err
	}
	return user, system, nil
}

func createImportantMonitoringTestRecord(app core.App, collectionName string, fields map[string]any) (*core.Record, error) {
	collection, err := app.FindCachedCollectionByNameOrId(collectionName)
	if err != nil {
		return nil, err
	}
	record := core.NewRecord(collection)
	record.Load(fields)
	return record, app.Save(record)
}

func createImportantMonitoringStateRecord(app core.App, collectionName string, fields map[string]any) (*core.Record, error) {
	collection, err := app.FindCachedCollectionByNameOrId(collectionName)
	if err != nil {
		return nil, err
	}
	record := core.NewRecord(collection)
	record.Load(fields)
	return record, app.SaveNoValidate(record)
}

func assertNoImportantMonitoringState(t *testing.T, app core.App, collection string, systemID string) {
	t.Helper()
	records, err := app.FindRecordsByFilter(collection, "system = {:system}", "", 10, 0, map[string]any{
		"system": systemID,
	})
	require.NoError(t, err)
	require.Empty(t, records)
}
