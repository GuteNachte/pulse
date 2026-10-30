package records

import (
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/tools/types"
)

const (
	// monitorRetentionMaxAge keeps only the most recent 30 days of detailed
	// monitoring data, alert history and recovery records for existing targets.
	monitorRetentionMaxAge = 30 * 24 * time.Hour

	// monitorRetentionBatchSize deletes expired records in pages so a single
	// statement never removes an unbounded number of rows at once.
	monitorRetentionBatchSize = 500
)

// monitorRetentionCollection describes one monitoring history table cleaned up
// by the daily 30 day retention job. logKey is used in the summary log line.
type monitorRetentionCollection struct {
	logKey string
	table  string
}

// monitorRetentionCollections lists every collection holding monitoring history.
//
// Notes on the scope:
//   - system_stats/container_stats also store the aggregated longer records
//     (types 10m/20m/120m/480m) created by CreateLongerRecords; there is no
//     separate aggregate table, so deleting by age covers them too.
//   - alerts_history holds both alert and recovery records: resolved ones are
//     cleaned up once older than the retention window, and unresolved ones do
//     not get an exemption either.
//   - smart_devices only keeps the current device state (upserted rows, no
//     history accumulation), so it is not part of the retention scope.
var monitorRetentionCollections = []monitorRetentionCollection{
	{logKey: "systemStats", table: "system_stats"},
	{logKey: "containerStats", table: "container_stats"},
	{logKey: "websiteMonitorChecks", table: "website_monitor_checks"},
	{logKey: "alertsHistory", table: "alerts_history"},
}

// RunMonitorRetentionCron is the entry point scheduled once per day at 03:00
// server local time by the Hub cron scheduler. It never touches the web UI:
// results are only written to the system log via slog.
func (rm *RecordManager) RunMonitorRetentionCron() {
	if err := rm.RunMonitorRetention(time.Now()); err != nil {
		slog.Error("Monitor retention finished with errors", "err", err)
	}
}

// RunMonitorRetention deletes monitoring records created more than 30 days ago
// (relative to the provided now) from every monitored target's history tables.
//
// Deletion runs in batches of monitorRetentionBatchSize rows. If a batch fails,
// the error is logged, the affected collection is skipped from that point on and
// the not yet deleted records of that collection are kept (no rollback of
// already deleted batches, no half deleted data loss beyond the failed batch).
// operation_audit, users, assets and system connection data are never touched.
func (rm *RecordManager) RunMonitorRetention(now time.Time) error {
	cutoff := now.UTC().Add(-monitorRetentionMaxAge)
	deletedCounts := make(map[string]int64, len(monitorRetentionCollections))
	var errs []error

	for _, collection := range monitorRetentionCollections {
		if _, err := rm.app.FindCollectionByNameOrId(collection.table); err != nil {
			// The collection may not exist in databases migrated from very
			// old versions; nothing to clean up for it.
			deletedCounts[collection.logKey] = 0
			continue
		}
		deleted, err := rm.deleteMonitorRecordsOlderThan(collection.table, cutoff)
		deletedCounts[collection.logKey] = deleted
		if err != nil {
			slog.Error("Monitor retention batch delete failed, remaining records are kept until the next run",
				"table", collection.table,
				"cutoff", cutoff,
				"deleted_before_failure", deleted,
				"err", err,
			)
			errs = append(errs, fmt.Errorf("monitor retention failed for %s: %w", collection.table, err))
		}
	}

	attrs := make([]any, 0, 2+2*len(monitorRetentionCollections))
	attrs = append(attrs, "cutoff", cutoff)
	for _, collection := range monitorRetentionCollections {
		attrs = append(attrs, collection.logKey, deletedCounts[collection.logKey])
	}
	slog.Info("monitor retention finished", attrs...)

	return errors.Join(errs...)
}

// deleteMonitorRecordsOlderThan deletes records with created < cutoff from the
// given table in batches, returning the total number of deleted rows.
func (rm *RecordManager) deleteMonitorRecordsOlderThan(table string, cutoff time.Time) (int64, error) {
	var total int64
	query := fmt.Sprintf(
		"DELETE FROM %s WHERE id IN (SELECT id FROM %s WHERE created < {:cutoff} LIMIT {:limit})",
		table,
		table,
	)
	for {
		result, err := rm.app.DB().NewQuery(query).Bind(dbx.Params{
			// Date fields are stored as "2006-01-02 15:04:05.000Z" strings, so
			// the cutoff must use the exact same layout for a reliable compare.
			"cutoff": cutoff.Format(types.DefaultDateLayout),
			"limit":  monitorRetentionBatchSize,
		}).Execute()
		if err != nil {
			return total, err
		}
		affected, err := result.RowsAffected()
		if err != nil {
			return total, err
		}
		total += affected
		if affected < monitorRetentionBatchSize {
			return total, nil
		}
	}
}
