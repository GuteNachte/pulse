//go:build testing

package records_test

import (
	"bytes"
	"fmt"
	"log/slog"
	"testing"
	"time"

	"gutenacht.site/pulse/internal/records"
	"gutenacht.site/pulse/internal/tests"

	"github.com/pocketbase/pocketbase/tools/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// clearRetentionCollections empties the monitored history tables so counts in
// the summary log are deterministic.
func clearRetentionCollections(t *testing.T, hub *tests.TestHub) {
	t.Helper()
	for _, table := range []string{"system_stats", "container_stats", "website_monitor_checks", "alerts_history"} {
		_, err := hub.DB().NewQuery(fmt.Sprintf("DELETE FROM %s", table)).Execute()
		require.NoError(t, err)
	}
}

// createRetentionRecord creates a record and backfills its created autodate.
func createRetentionRecord(t *testing.T, hub *tests.TestHub, collection string, fields map[string]any, created time.Time) string {
	t.Helper()
	record, err := tests.CreateRecord(hub, collection, fields)
	require.NoError(t, err)
	record.SetRaw("created", created.UTC().Format(types.DefaultDateLayout))
	require.NoError(t, hub.SaveNoValidate(record))
	return record.Id
}

// retentionFixture holds the ids of the records seeded for the retention test.
type retentionFixture struct {
	systemStats        map[string]string // age label -> record id
	containerStats     map[string]string
	websiteChecks      map[string]string
	alertsHistory      map[string]string
	oldResolvedAlertID string
	oldUnresolvedID    string
}

// seedRetentionFixture creates 35 days old, 20 days old and current records in
// every monitored history collection of a single test system.
func seedRetentionFixture(t *testing.T, hub *tests.TestHub, now time.Time) *retentionFixture {
	t.Helper()

	user, err := tests.CreateUser(hub, "retention@example.com", "testtesttest")
	require.NoError(t, err)

	system, err := tests.CreateRecord(hub, "systems", map[string]any{
		"name":   "retention-system",
		"status": "up",
		"users":  []string{user.Id},
	})
	require.NoError(t, err)

	monitor, err := tests.CreateRecord(hub, "website_monitors", map[string]any{
		"user":             user.Id,
		"system":           system.Id,
		"name":             "Retention Site",
		"url":              "https://example.com",
		"interval_seconds": 60,
		"timeout_seconds":  5,
		"enabled":          true,
	})
	require.NoError(t, err)

	fixture := &retentionFixture{
		systemStats:    map[string]string{},
		containerStats: map[string]string{},
		websiteChecks:  map[string]string{},
		alertsHistory:  map[string]string{},
	}

	for label, age := range map[string]time.Duration{
		"35days": -35 * 24 * time.Hour,
		"20days": -20 * 24 * time.Hour,
		"today":  0,
	} {
		created := now.Add(age)
		fixture.systemStats[label] = createRetentionRecord(t, hub, "system_stats", map[string]any{
			"system": system.Id,
			"type":   "480m",
			"stats":  `{"cpu": 50.0, "mem": 1024}`,
		}, created)
		fixture.containerStats[label] = createRetentionRecord(t, hub, "container_stats", map[string]any{
			"system": system.Id,
			"type":   "480m",
			"stats":  `[{"name": "nginx", "cpu": 1.0, "mem": 128}]`,
		}, created)
		fixture.websiteChecks[label] = createRetentionRecord(t, hub, "website_monitor_checks", map[string]any{
			"user":    user.Id,
			"monitor": monitor.Id,
			"status":  "up",
		}, created)
		fixture.alertsHistory[label] = createRetentionRecord(t, hub, "alerts_history", map[string]any{
			"user":   user.Id,
			"system": system.Id,
			"name":   "CPU",
			"value":  42.0,
		}, created)
	}

	// Extra old system_stats records prove the retention applies to every type.
	createRetentionRecord(t, hub, "system_stats", map[string]any{
		"system": system.Id,
		"type":   "1m",
		"stats":  `{"cpu": 60.0, "mem": 2048}`,
	}, now.Add(-35*24*time.Hour))
	fixture.systemStats["35days-10m"] = createRetentionRecord(t, hub, "system_stats", map[string]any{
		"system": system.Id,
		"type":   "10m",
		"stats":  `{"cpu": 10.0, "mem": 256}`,
	}, now.Add(-35*24*time.Hour))

	// Resolved alert history from 35 days ago must be cleaned up as well...
	fixture.oldResolvedAlertID = createRetentionRecord(t, hub, "alerts_history", map[string]any{
		"user":     user.Id,
		"system":   system.Id,
		"name":     "Memory",
		"value":    90.0,
		"resolved": now.Add(-34 * 24 * time.Hour),
	}, now.Add(-35*24*time.Hour))
	// ...and unresolved alert history older than 30 days gets no exemption.
	fixture.oldUnresolvedID = createRetentionRecord(t, hub, "alerts_history", map[string]any{
		"user":   user.Id,
		"system": system.Id,
		"name":   "Disk",
		"value":  95.0,
	}, now.Add(-35*24*time.Hour))

	return fixture
}

func assertRetentionResult(t *testing.T, hub *tests.TestHub, fixture *retentionFixture) {
	t.Helper()

	// 35 days old records are deleted from every collection (all types,
	// resolved and unresolved alert history included).
	_, err := hub.FindRecordById("system_stats", fixture.systemStats["35days"])
	assert.Error(t, err, "old 480m system_stats record should be deleted")
	_, err = hub.FindRecordById("system_stats", fixture.systemStats["35days-10m"])
	assert.Error(t, err, "old 10m system_stats record should be deleted")
	_, err = hub.FindRecordById("container_stats", fixture.containerStats["35days"])
	assert.Error(t, err, "old container_stats record should be deleted")
	_, err = hub.FindRecordById("website_monitor_checks", fixture.websiteChecks["35days"])
	assert.Error(t, err, "old website check should be deleted")
	_, err = hub.FindRecordById("alerts_history", fixture.oldResolvedAlertID)
	assert.Error(t, err, "old resolved alert history should be deleted")
	_, err = hub.FindRecordById("alerts_history", fixture.oldUnresolvedID)
	assert.Error(t, err, "old unresolved alert history should be deleted")

	// 20 days old and current records are kept in every collection.
	for _, label := range []string{"20days", "today"} {
		_, err := hub.FindRecordById("system_stats", fixture.systemStats[label])
		assert.NoError(t, err, "%s system_stats record should be kept", label)
		_, err = hub.FindRecordById("container_stats", fixture.containerStats[label])
		assert.NoError(t, err, "%s container_stats record should be kept", label)
		_, err = hub.FindRecordById("website_monitor_checks", fixture.websiteChecks[label])
		assert.NoError(t, err, "%s website check should be kept", label)
		_, err = hub.FindRecordById("alerts_history", fixture.alertsHistory[label])
		assert.NoError(t, err, "%s alert history should be kept", label)
	}
}

func TestRunMonitorRetention(t *testing.T) {
	hub, err := tests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	rm := records.NewRecordManager(hub)
	clearRetentionCollections(t, hub)

	now := time.Now()
	fixture := seedRetentionFixture(t, hub, now)

	var logBuffer bytes.Buffer
	previousLogger := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&logBuffer, &slog.HandlerOptions{Level: slog.LevelInfo})))
	defer slog.SetDefault(previousLogger)

	err = rm.RunMonitorRetention(now)
	require.NoError(t, err)

	assertRetentionResult(t, hub, fixture)

	logOutput := logBuffer.String()
	assert.Contains(t, logOutput, "monitor retention finished")
	assert.Contains(t, logOutput, "cutoff=")
	// The summary line reports how many records were deleted per collection:
	// 3 system_stats (35d 480m + 35d 1m + 35d 10m), 1 container_stats,
	// 1 website check and 3 alerts history (35d unresolved + 35d resolved
	// + the 35d fixture alert).
	assert.Contains(t, logOutput, "systemStats=3")
	assert.Contains(t, logOutput, "containerStats=1")
	assert.Contains(t, logOutput, "websiteMonitorChecks=1")
	assert.Contains(t, logOutput, "alertsHistory=3")
}

func TestRunMonitorRetentionBatchDeletion(t *testing.T) {
	hub, err := tests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	rm := records.NewRecordManager(hub)
	clearRetentionCollections(t, hub)

	user, err := tests.CreateUser(hub, "batch-retention@example.com", "testtesttest")
	require.NoError(t, err)

	system, err := tests.CreateRecord(hub, "systems", map[string]any{
		"name":   "batch-retention-system",
		"status": "up",
		"users":  []string{user.Id},
	})
	require.NoError(t, err)

	now := time.Now().UTC()
	oldCreated := now.Add(-40 * 24 * time.Hour).Format(types.DefaultDateLayout)
	totalOld := 600 // two batches: 500 + 100
	for i := range totalOld {
		_, err := hub.DB().NewQuery(
			"INSERT INTO alerts_history (id, user, system, name, created) VALUES ({:id}, {:user}, {:system}, {:name}, {:created})",
		).Bind(map[string]any{
			"id":      fmt.Sprintf("ob%013d", i),
			"user":    user.Id,
			"system":  system.Id,
			"name":    "CPU",
			"created": oldCreated,
		}).Execute()
		require.NoError(t, err)
	}
	recentID := createRetentionRecord(t, hub, "alerts_history", map[string]any{
		"user":   user.Id,
		"system": system.Id,
		"name":   "CPU",
		"value":  1.0,
	}, now.Add(-time.Hour))

	var logBuffer bytes.Buffer
	previousLogger := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&logBuffer, &slog.HandlerOptions{Level: slog.LevelInfo})))
	defer slog.SetDefault(previousLogger)

	err = rm.RunMonitorRetention(now)
	require.NoError(t, err)

	count, err := hub.CountRecords("alerts_history")
	require.NoError(t, err)
	assert.Equal(t, int64(1), count, "only the recent alert history record should remain")
	_, err = hub.FindRecordById("alerts_history", recentID)
	assert.NoError(t, err, "recent alert history record should be kept")

	logOutput := logBuffer.String()
	assert.Contains(t, logOutput, "monitor retention finished")
	assert.Contains(t, logOutput, fmt.Sprintf("alertsHistory=%d", totalOld))
}
