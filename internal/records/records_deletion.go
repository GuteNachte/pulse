package records

import (
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const (
	websiteMonitorChecksCountToKeep         = 500
	websiteMonitorChecksCountBeforeDeletion = 600
	websiteMonitorChecksMaxAge              = 30 * 24 * time.Hour

	operationActionsCountToKeep         = 300
	operationActionsCountBeforeDeletion = 350
	operationActionsMaxAge              = 90 * 24 * time.Hour

	operationAuditCountToKeep         = 1000
	operationAuditCountBeforeDeletion = 1200
	operationAuditMaxAge              = 180 * 24 * time.Hour

	systemLogsCountToKeep         = 5000
	systemLogsCountBeforeDeletion = 6000
	systemLogsMaxAge              = 30 * 24 * time.Hour
)

type cleanupCounter struct {
	logKey    string
	table     string
	auxiliary bool
}

var cleanupCounters = []cleanupCounter{
	{logKey: "system_stats", table: "system_stats"},
	{logKey: "container_stats", table: "container_stats"},
	{logKey: "containers", table: "containers"},
	{logKey: "monitored_services", table: "monitored_services"},
	{logKey: "monitored_software", table: "monitored_software"},
	{logKey: "alerts_history", table: "alerts_history"},
	{logKey: "quiet_hours", table: "quiet_hours"},
	{logKey: "notification_failures", table: "notification_failures"},
	{logKey: "website_monitor_checks", table: "website_monitor_checks"},
	{logKey: "operation_actions", table: "operation_actions"},
	{logKey: "operation_audit", table: "operation_audit"},
	{logKey: "system_logs", table: "_logs", auxiliary: true},
}

// Delete old records
func (rm *RecordManager) DeleteOldRecords() {
	rm.app.RunInTransaction(func(txApp core.App) error {
		beforeCounts := getCleanupCounts(txApp)
		err := deleteOldSystemStats(txApp)
		if err != nil {
			slog.Error("Error deleting old system stats", "err", err)
		}
		err = deleteOldContainerRecords(txApp)
		if err != nil {
			slog.Error("Error deleting old container records", "err", err)
		}
		err = deleteOldMonitoredServiceRecords(txApp)
		if err != nil {
			slog.Error("Error deleting old monitored service records", "err", err)
		}
		err = deleteOldMonitoredSoftwareRecords(txApp)
		if err != nil {
			slog.Error("Error deleting old monitored software records", "err", err)
		}
		err = deleteOldAlertsHistory(txApp, 200, 250)
		if err != nil {
			slog.Error("Error deleting old alerts history", "err", err)
		}
		err = deleteOldQuietHours(txApp)
		if err != nil {
			slog.Error("Error deleting old quiet hours", "err", err)
		}
		err = deleteOldNotificationFailures(txApp)
		if err != nil {
			slog.Error("Error deleting old notification failures", "err", err)
		}
		err = deleteOldWebsiteMonitorChecks(txApp, websiteMonitorChecksCountToKeep, websiteMonitorChecksCountBeforeDeletion, websiteMonitorChecksMaxAge)
		if err != nil {
			slog.Error("Error deleting old website monitor checks", "err", err)
		}
		err = deleteOldOperationActions(txApp, operationActionsCountToKeep, operationActionsCountBeforeDeletion, operationActionsMaxAge)
		if err != nil {
			slog.Error("Error deleting old operation actions", "err", err)
		}
		err = deleteOldOperationAudit(txApp, operationAuditCountToKeep, operationAuditCountBeforeDeletion, operationAuditMaxAge)
		if err != nil {
			slog.Error("Error deleting old operation audit records", "err", err)
		}
		err = deleteOldSystemLogs(txApp, systemLogsCountToKeep, systemLogsCountBeforeDeletion, systemLogsMaxAge)
		if err != nil {
			slog.Error("Error deleting old system logs", "err", err)
		}
		logCleanupSummary(txApp, beforeCounts)
		return nil
	})
}

func getCleanupCounts(app core.App) map[string]int64 {
	counts := make(map[string]int64, len(cleanupCounters))
	for _, counter := range cleanupCounters {
		count, ok, err := countCleanupRows(app, counter)
		if err != nil {
			slog.Warn("Unable to count records before cleanup", "table", counter.table, "err", err)
			continue
		}
		if ok {
			counts[counter.logKey] = count
		}
	}
	return counts
}

func logCleanupSummary(app core.App, beforeCounts map[string]int64) {
	var attrs []any
	var totalDeleted int64
	for _, counter := range cleanupCounters {
		before, ok := beforeCounts[counter.logKey]
		if !ok {
			continue
		}
		after, ok, err := countCleanupRows(app, counter)
		if err != nil {
			slog.Warn("Unable to count records after cleanup", "table", counter.table, "err", err)
			continue
		}
		if !ok {
			continue
		}
		deleted := before - after
		if deleted <= 0 {
			continue
		}
		totalDeleted += deleted
		attrs = append(attrs, counter.logKey, deleted)
	}
	if totalDeleted > 0 {
		slog.Info("Record cleanup deleted old records", append([]any{"deleted_total", totalDeleted}, attrs...)...)
	}
}

func countCleanupRows(app core.App, counter cleanupCounter) (int64, bool, error) {
	query := fmt.Sprintf("SELECT COUNT(*) as count FROM %s", counter.table)
	var rows []struct {
		Count int64 `db:"count"`
	}
	if counter.auxiliary {
		if !auxTableExists(app, counter.table) {
			return 0, false, nil
		}
		if err := app.AuxDB().NewQuery(query).All(&rows); err != nil {
			return 0, false, err
		}
	} else {
		if _, err := app.FindCollectionByNameOrId(counter.table); err != nil {
			return 0, false, nil
		}
		if err := app.DB().NewQuery(query).All(&rows); err != nil {
			return 0, false, err
		}
	}
	if len(rows) == 0 {
		return 0, true, nil
	}
	return rows[0].Count, true, nil
}

// Delete old alerts history records
func deleteOldAlertsHistory(app core.App, countToKeep, countBeforeDeletion int) error {
	db := app.DB()
	var users []struct {
		Id string `db:"user"`
	}
	err := db.NewQuery("SELECT user, COUNT(*) as count FROM alerts_history GROUP BY user HAVING count > {:countBeforeDeletion}").Bind(dbx.Params{"countBeforeDeletion": countBeforeDeletion}).All(&users)
	if err != nil {
		return err
	}
	for _, user := range users {
		_, err = db.NewQuery("DELETE FROM alerts_history WHERE user = {:user} AND id NOT IN (SELECT id FROM alerts_history WHERE user = {:user} ORDER BY created DESC LIMIT {:countToKeep})").Bind(dbx.Params{"user": user.Id, "countToKeep": countToKeep}).Execute()
		if err != nil {
			return err
		}
	}
	return nil
}

// Deletes system_stats records older than what is displayed in the UI
func deleteOldSystemStats(app core.App) error {
	// Collections to process
	collections := [2]string{"system_stats", "container_stats"}

	// Record types and their retention periods
	type RecordDeletionData struct {
		recordType string
		retention  time.Duration
	}
	recordData := []RecordDeletionData{
		{recordType: "1m", retention: time.Hour},             // 1 hour
		{recordType: "10m", retention: 12 * time.Hour},       // 12 hours
		{recordType: "20m", retention: 24 * time.Hour},       // 1 day
		{recordType: "120m", retention: 7 * 24 * time.Hour},  // 7 days
		{recordType: "480m", retention: 30 * 24 * time.Hour}, // 30 days
	}

	now := time.Now().UTC()

	for _, collection := range collections {
		// Build the WHERE clause
		var conditionParts []string
		var params dbx.Params = make(map[string]any)
		for i := range recordData {
			rd := recordData[i]
			// Create parameterized condition for this record type
			dateParam := fmt.Sprintf("date%d", i)
			conditionParts = append(conditionParts, fmt.Sprintf("(type = '%s' AND created < {:%s})", rd.recordType, dateParam))
			params[dateParam] = now.Add(-rd.retention)
		}
		// Combine conditions with OR
		conditionStr := strings.Join(conditionParts, " OR ")
		// Construct and execute the full raw query
		rawQuery := fmt.Sprintf("DELETE FROM %s WHERE %s", collection, conditionStr)
		if _, err := app.DB().NewQuery(rawQuery).Bind(params).Execute(); err != nil {
			return fmt.Errorf("failed to delete from %s: %v", collection, err)
		}
	}
	return nil
}

// Deletes monitored service records that haven't been updated in the last 20 minutes
func deleteOldMonitoredServiceRecords(app core.App) error {
	now := time.Now().UTC()
	twentyMinutesAgo := now.Add(-20 * time.Minute)

	_, err := app.DB().NewQuery("DELETE FROM monitored_services WHERE updated < {:updated}").Bind(dbx.Params{"updated": twentyMinutesAgo.UnixMilli()}).Execute()
	if err != nil {
		return fmt.Errorf("failed to delete old monitored service records: %v", err)
	}

	return nil
}

func deleteOldMonitoredSoftwareRecords(app core.App) error {
	if _, err := app.FindCollectionByNameOrId("monitored_software"); err != nil {
		return nil
	}
	now := time.Now().UTC()
	twentyMinutesAgo := now.Add(-20 * time.Minute)

	_, err := app.DB().NewQuery("DELETE FROM monitored_software WHERE updated < {:updated}").Bind(dbx.Params{"updated": twentyMinutesAgo.UnixMilli()}).Execute()
	if err != nil {
		return fmt.Errorf("failed to delete old monitored software records: %v", err)
	}
	return nil
}

// Deletes container records that haven't been updated in the last 10 minutes
func deleteOldContainerRecords(app core.App) error {
	now := time.Now().UTC()
	tenMinutesAgo := now.Add(-10 * time.Minute)

	// Delete container records where updated < tenMinutesAgo
	_, err := app.DB().NewQuery("DELETE FROM containers WHERE updated < {:updated}").Bind(dbx.Params{"updated": tenMinutesAgo.UnixMilli()}).Execute()
	if err != nil {
		return fmt.Errorf("failed to delete old container records: %v", err)
	}

	return nil
}

// Deletes old quiet hours records where end date has passed
func deleteOldQuietHours(app core.App) error {
	if _, err := app.FindCollectionByNameOrId("quiet_hours"); err != nil {
		return nil
	}
	now := time.Now().UTC()
	_, err := app.DB().NewQuery("DELETE FROM quiet_hours WHERE type = 'one-time' AND end < {:now}").Bind(dbx.Params{"now": now}).Execute()
	if err != nil {
		return err
	}

	return nil
}

// Deletes notification failure records older than 90 days.
func deleteOldNotificationFailures(app core.App) error {
	if _, err := app.FindCollectionByNameOrId("notification_failures"); err != nil {
		return nil
	}
	now := time.Now().UTC()
	ninetyDaysAgo := now.Add(-90 * 24 * time.Hour)

	_, err := app.DB().NewQuery("DELETE FROM notification_failures WHERE updated < {:updated}").Bind(dbx.Params{"updated": ninetyDaysAgo}).Execute()
	if err != nil {
		return fmt.Errorf("failed to delete old notification failures: %v", err)
	}

	return nil
}

func deleteOldWebsiteMonitorChecks(app core.App, countToKeep, countBeforeDeletion int, maxAge time.Duration) error {
	if _, err := app.FindCollectionByNameOrId("website_monitor_checks"); err != nil {
		return nil
	}
	if err := deleteRecordsOlderThan(app, "website_monitor_checks", "created", time.Now().UTC().Add(-maxAge)); err != nil {
		return fmt.Errorf("failed to delete old website monitor checks by age: %v", err)
	}
	if err := deleteGroupedRecordsByCount(app, "website_monitor_checks", "monitor", countToKeep, countBeforeDeletion); err != nil {
		return fmt.Errorf("failed to trim website monitor checks by count: %v", err)
	}
	return nil
}

func deleteOldOperationActions(app core.App, countToKeep, countBeforeDeletion int, maxAge time.Duration) error {
	if _, err := app.FindCollectionByNameOrId("operation_actions"); err != nil {
		return nil
	}
	if err := deleteRecordsOlderThan(app, "operation_actions", "created", time.Now().UTC().Add(-maxAge)); err != nil {
		return fmt.Errorf("failed to delete old operation actions by age: %v", err)
	}
	if err := deleteGroupedRecordsByCount(app, "operation_actions", "system", countToKeep, countBeforeDeletion); err != nil {
		return fmt.Errorf("failed to trim operation actions by count: %v", err)
	}
	return nil
}

func deleteOldOperationAudit(app core.App, countToKeep, countBeforeDeletion int, maxAge time.Duration) error {
	if _, err := app.FindCollectionByNameOrId("operation_audit"); err != nil {
		return nil
	}
	if err := deleteRecordsOlderThan(app, "operation_audit", "created", time.Now().UTC().Add(-maxAge)); err != nil {
		return fmt.Errorf("failed to delete old operation audit records by age: %v", err)
	}
	if err := deleteGroupedRecordsByCount(app, "operation_audit", "user", countToKeep, countBeforeDeletion); err != nil {
		return fmt.Errorf("failed to trim operation audit records by count: %v", err)
	}
	return nil
}

func deleteRecordsOlderThan(app core.App, collection string, dateField string, cutoff time.Time) error {
	query := fmt.Sprintf("DELETE FROM %s WHERE %s < {:cutoff}", collection, dateField)
	_, err := app.DB().NewQuery(query).Bind(dbx.Params{"cutoff": cutoff}).Execute()
	return err
}

func deleteGroupedRecordsByCount(app core.App, collection string, groupField string, countToKeep, countBeforeDeletion int) error {
	if countToKeep <= 0 || countBeforeDeletion <= 0 {
		return nil
	}
	var groups []struct {
		Id string `db:"group_id"`
	}
	groupExpr := fmt.Sprintf("COALESCE(%s, '')", groupField)
	query := fmt.Sprintf(
		"SELECT %s as group_id, COUNT(*) as count FROM %s GROUP BY %s HAVING count > {:countBeforeDeletion}",
		groupExpr,
		collection,
		groupExpr,
	)
	if err := app.DB().NewQuery(query).Bind(dbx.Params{"countBeforeDeletion": countBeforeDeletion}).All(&groups); err != nil {
		return err
	}
	for _, group := range groups {
		deleteQuery := fmt.Sprintf(
			"DELETE FROM %s WHERE %s = {:groupID} AND id NOT IN (SELECT id FROM %s WHERE %s = {:groupID} ORDER BY created DESC LIMIT {:countToKeep})",
			collection,
			groupExpr,
			collection,
			groupExpr,
		)
		if _, err := app.DB().NewQuery(deleteQuery).Bind(dbx.Params{
			"groupID":     group.Id,
			"countToKeep": countToKeep,
		}).Execute(); err != nil {
			return err
		}
	}
	return nil
}

func deleteOldSystemLogs(app core.App, countToKeep, countBeforeDeletion int, maxAge time.Duration) error {
	if !auxTableExists(app, "_logs") {
		return nil
	}
	if _, err := app.AuxDB().NewQuery("DELETE FROM _logs WHERE created < {:cutoff}").Bind(dbx.Params{
		"cutoff": time.Now().UTC().Add(-maxAge),
	}).Execute(); err != nil {
		return fmt.Errorf("failed to delete old system logs by age: %v", err)
	}
	if countToKeep <= 0 || countBeforeDeletion <= 0 {
		return nil
	}
	var totals []struct {
		Count int `db:"count"`
	}
	if err := app.AuxDB().NewQuery("SELECT COUNT(*) as count FROM _logs").All(&totals); err != nil {
		return err
	}
	if len(totals) == 0 || totals[0].Count <= countBeforeDeletion {
		return nil
	}
	_, err := app.AuxDB().NewQuery("DELETE FROM _logs WHERE id NOT IN (SELECT id FROM _logs ORDER BY created DESC LIMIT {:countToKeep})").Bind(dbx.Params{
		"countToKeep": countToKeep,
	}).Execute()
	if err != nil {
		return fmt.Errorf("failed to trim system logs by count: %v", err)
	}
	return nil
}

func auxTableExists(app core.App, table string) bool {
	var rows []struct {
		Count int `db:"count"`
	}
	err := app.AuxDB().NewQuery("SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'table' AND name = {:name}").Bind(dbx.Params{
		"name": table,
	}).All(&rows)
	return err == nil && len(rows) > 0 && rows[0].Count > 0
}
