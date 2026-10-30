package alerts

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

const defaultAlertSilenceDuration = 1 * time.Hour

type historyActionResponse struct {
	Success bool         `json:"success"`
	Record  *core.Record `json:"record"`
}

type silenceHistoryRequest struct {
	DurationMinutes int    `json:"duration_minutes"`
	Reason          string `json:"reason"`
}

func findUserAlertHistoryRecord(app core.App, userID string, id string) (*core.Record, error) {
	id = strings.TrimSpace(id)
	userID = strings.TrimSpace(userID)
	if id == "" || userID == "" {
		return nil, sql.ErrNoRows
	}
	return app.FindFirstRecordByFilter(
		"alerts_history",
		"id = {:id} && user = {:user}",
		dbx.Params{"id": id, "user": userID},
	)
}

// AcknowledgeAlertHistory marks a current alert as seen/owned by the current user.
func AcknowledgeAlertHistory(e *core.RequestEvent) error {
	record, err := findUserAlertHistoryRecord(e.App, e.Auth.Id, e.Request.PathValue("id"))
	if err != nil {
		return e.NotFoundError("Alert history record not found", err)
	}
	now := time.Now().UTC()
	record.Set("acknowledged_at", now)
	record.Set("acknowledged_by", e.Auth.Id)
	if err := e.App.SaveNoValidate(record); err != nil {
		return e.InternalServerError("", err)
	}
	writeOperationAudit(e.App, e.Auth.Id, record.GetString("system"), "acknowledge_alert", alertHistoryAuditTarget(record), "success", "告警已确认", "", auditRequestIP(e.Request))
	return e.JSON(http.StatusOK, historyActionResponse{Success: true, Record: record})
}

// SilenceAlertHistory suppresses repeated notifications for the current unresolved alert.
func SilenceAlertHistory(e *core.RequestEvent) error {
	record, err := findUserAlertHistoryRecord(e.App, e.Auth.Id, e.Request.PathValue("id"))
	if err != nil {
		return e.NotFoundError("Alert history record not found", err)
	}
	if !record.GetDateTime("resolved").IsZero() {
		return e.BadRequestError("Resolved alerts cannot be silenced", nil)
	}

	var req silenceHistoryRequest
	if err := e.BindBody(&req); err != nil && !errors.Is(err, http.ErrBodyNotAllowed) {
		return e.BadRequestError("Invalid silence request", err)
	}
	duration := time.Duration(req.DurationMinutes) * time.Minute
	if duration <= 0 {
		duration = defaultAlertSilenceDuration
	}
	if duration > 7*24*time.Hour {
		duration = 7 * 24 * time.Hour
	}
	now := time.Now().UTC()
	record.Set("acknowledged_at", now)
	record.Set("acknowledged_by", e.Auth.Id)
	record.Set("silenced_until", now.Add(duration))
	record.Set("silenced_by", e.Auth.Id)
	record.Set("silence_reason", strings.TrimSpace(req.Reason))
	if err := e.App.SaveNoValidate(record); err != nil {
		return e.InternalServerError("", err)
	}
	writeOperationAudit(e.App, e.Auth.Id, record.GetString("system"), "silence_alert", alertHistoryAuditTarget(record), "success", "告警已静默", "", auditRequestIP(e.Request))
	return e.JSON(http.StatusOK, historyActionResponse{Success: true, Record: record})
}

// UnsilenceAlertHistory clears the active silence window but keeps the acknowledgement trail.
func UnsilenceAlertHistory(e *core.RequestEvent) error {
	record, err := findUserAlertHistoryRecord(e.App, e.Auth.Id, e.Request.PathValue("id"))
	if err != nil {
		return e.NotFoundError("Alert history record not found", err)
	}
	record.Set("silenced_until", types.DateTime{})
	record.Set("silenced_by", "")
	record.Set("silence_reason", "")
	if err := e.App.SaveNoValidate(record); err != nil {
		return e.InternalServerError("", err)
	}
	writeOperationAudit(e.App, e.Auth.Id, record.GetString("system"), "unsilence_alert", alertHistoryAuditTarget(record), "success", "告警已取消静默", "", auditRequestIP(e.Request))
	return e.JSON(http.StatusOK, historyActionResponse{Success: true, Record: record})
}

func alertHistoryAuditTarget(record *core.Record) string {
	if record == nil {
		return ""
	}
	if alertID := strings.TrimSpace(record.GetString("alert_id")); alertID != "" {
		return alertID
	}
	return record.Id
}

func activeSilenceForAlert(app core.App, userID string, systemID string, alertID string) (*core.Record, bool) {
	userID = strings.TrimSpace(userID)
	systemID = strings.TrimSpace(systemID)
	alertID = strings.TrimSpace(alertID)
	if userID == "" || alertID == "" {
		return nil, false
	}
	filter := "user = {:user} && alert_id = {:alert_id} && resolved = null"
	params := dbx.Params{
		"user":     userID,
		"alert_id": alertID,
	}
	if systemID != "" {
		filter += " && system = {:system}"
		params["system"] = systemID
	}
	records, err := app.FindRecordsByFilter("alerts_history", filter, "-created", 10, 0, params)
	if err != nil {
		return nil, false
	}
	now := time.Now().UTC()
	for _, record := range records {
		silencedUntil := record.GetDateTime("silenced_until")
		if !silencedUntil.IsZero() && silencedUntil.Time().After(now) {
			return record, true
		}
	}
	return nil, false
}

func IsAlertSilenced(app core.App, userID string, systemID string, alertID string) bool {
	_, ok := activeSilenceForAlert(app, userID, systemID, alertID)
	return ok
}
