//go:build testing

package records

import (
	"time"

	"github.com/pocketbase/pocketbase/core"
)

// DeleteOldSystemStats exposes deleteOldSystemStats for testing
func DeleteOldSystemStats(app core.App) error {
	return deleteOldSystemStats(app)
}

// DeleteOldAlertsHistory exposes deleteOldAlertsHistory for testing
func DeleteOldAlertsHistory(app core.App, countToKeep, countBeforeDeletion int) error {
	return deleteOldAlertsHistory(app, countToKeep, countBeforeDeletion)
}

// DeleteOldWebsiteMonitorChecks exposes deleteOldWebsiteMonitorChecks for testing
func DeleteOldWebsiteMonitorChecks(app core.App, countToKeep, countBeforeDeletion int, maxAge time.Duration) error {
	return deleteOldWebsiteMonitorChecks(app, countToKeep, countBeforeDeletion, maxAge)
}

// DeleteOldOperationActions exposes deleteOldOperationActions for testing
func DeleteOldOperationActions(app core.App, countToKeep, countBeforeDeletion int, maxAge time.Duration) error {
	return deleteOldOperationActions(app, countToKeep, countBeforeDeletion, maxAge)
}

// DeleteOldOperationAudit exposes deleteOldOperationAudit for testing
func DeleteOldOperationAudit(app core.App, countToKeep, countBeforeDeletion int, maxAge time.Duration) error {
	return deleteOldOperationAudit(app, countToKeep, countBeforeDeletion, maxAge)
}

// DeleteOldSystemLogs exposes deleteOldSystemLogs for testing
func DeleteOldSystemLogs(app core.App, countToKeep, countBeforeDeletion int, maxAge time.Duration) error {
	return deleteOldSystemLogs(app, countToKeep, countBeforeDeletion, maxAge)
}

// TwoDecimals exposes twoDecimals for testing
func TwoDecimals(value float64) float64 {
	return twoDecimals(value)
}
