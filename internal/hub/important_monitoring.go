package hub

import (
	"fmt"
	"hash/fnv"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"gutenacht.site/pulse/internal/hub/utils"
)

type importantMonitoringRuleRequest struct {
	Kind        string `json:"kind"`
	System      string `json:"system"`
	Platform    string `json:"platform"`
	Name        string `json:"name"`
	DisplayName string `json:"display_name"`
	Note        string `json:"note"`
	ContainerID string `json:"container_id"`
	Image       string `json:"image"`
	Enabled     bool   `json:"enabled"`
}

func (h *Hub) upsertImportantMonitoringRule(e *core.RequestEvent) error {
	var req importantMonitoringRuleRequest
	if err := e.BindBody(&req); err != nil {
		h.createOperationAudit(e, "", "upsert_monitoring_rule", "", "", "failed", "Invalid request body", operationFailureInvalidRequest)
		return e.BadRequestError("Invalid request body", err)
	}
	req.Kind = strings.ToLower(strings.TrimSpace(req.Kind))
	req.System = strings.TrimSpace(req.System)
	req.Platform = strings.ToLower(strings.TrimSpace(req.Platform))
	req.Name = strings.TrimSpace(req.Name)
	req.ContainerID = strings.TrimSpace(req.ContainerID)
	if req.System == "" {
		h.createOperationAudit(e, "", "upsert_monitoring_rule", importantRuleAuditTarget(req.Kind, req.Name, req.ContainerID), "", "failed", "System is required", operationFailureInvalidRequest)
		return e.BadRequestError("System is required", nil)
	}
	if !h.authCanWriteSystem(e, req.System) {
		return e.NotFoundError("", nil)
	}
	collectionName, err := importantMonitoringCollection(req.Kind)
	if err != nil {
		h.createOperationAudit(e, req.System, "upsert_monitoring_rule", importantRuleAuditTarget(req.Kind, req.Name, req.ContainerID), "", "failed", err.Error(), operationFailureInvalidRequest)
		return e.BadRequestError(err.Error(), err)
	}
	if req.Kind == "container" {
		if req.ContainerID == "" {
			h.createOperationAudit(e, req.System, "upsert_monitoring_rule", importantRuleAuditTarget(req.Kind, req.Name, req.ContainerID), "", "failed", "Container id is required", operationFailureInvalidRequest)
			return e.BadRequestError("Container id is required", nil)
		}
	} else {
		if req.Platform == "" {
			req.Platform = "windows"
		}
		if req.Name == "" {
			h.createOperationAudit(e, req.System, "upsert_monitoring_rule", importantRuleAuditTarget(req.Kind, req.Name, req.ContainerID), "", "failed", "Name is required", operationFailureInvalidRequest)
			return e.BadRequestError("Name is required", nil)
		}
	}

	record, err := h.findExistingImportantMonitoringRule(e.App, collectionName, req)
	if err != nil {
		collection, collectionErr := e.App.FindCachedCollectionByNameOrId(collectionName)
		if collectionErr != nil {
			return e.InternalServerError("", collectionErr)
		}
		record = core.NewRecord(collection)
		record.Set("system", req.System)
	}
	applyImportantMonitoringRuleFields(record, req)
	if err := e.App.SaveNoValidate(record); err != nil {
		h.createOperationAudit(e, req.System, "upsert_monitoring_rule", importantRuleAuditTarget(req.Kind, req.Name, req.ContainerID), "", "failed", err.Error(), operationFailureFailed)
		return e.BadRequestError("Failed to save monitoring rule", err)
	}
	if !record.GetBool("enabled") {
		if err := h.resolveImportantMonitoringRuleAlerts(e.App, req.Kind, record); err != nil {
			h.createOperationAudit(e, req.System, "upsert_monitoring_rule", importantRuleAuditTarget(req.Kind, req.Name, req.ContainerID), "", "failed", err.Error(), operationFailureFailed)
			return e.BadRequestError("Failed to resolve monitoring alerts", err)
		}
		if err := h.deleteMonitoredStateForRule(e.App, req.Kind, record); err != nil {
			h.createOperationAudit(e, req.System, "upsert_monitoring_rule", importantRuleAuditTarget(req.Kind, req.Name, req.ContainerID), "", "failed", err.Error(), operationFailureFailed)
			return e.BadRequestError("Failed to clean monitoring state", err)
		}
	}
	h.createOperationAudit(e, req.System, "upsert_monitoring_rule", importantRuleAuditTarget(req.Kind, req.Name, req.ContainerID), "", "success", "监控规则已保存")
	return e.JSON(200, record)
}

func (h *Hub) deleteImportantMonitoringRule(e *core.RequestEvent) error {
	kind := strings.ToLower(strings.TrimSpace(e.Request.PathValue("kind")))
	id := strings.TrimSpace(e.Request.PathValue("id"))
	collectionName, err := importantMonitoringCollection(kind)
	if err != nil {
		h.createOperationAudit(e, "", "delete_monitoring_rule", kind+":"+id, "", "failed", err.Error(), operationFailureInvalidRequest)
		return e.BadRequestError(err.Error(), err)
	}
	record, err := e.App.FindRecordById(collectionName, id)
	if err != nil {
		return e.NotFoundError("", err)
	}
	if !h.authCanWriteSystem(e, record.GetString("system")) {
		return e.NotFoundError("", nil)
	}
	if err := h.resolveImportantMonitoringRuleAlerts(e.App, kind, record); err != nil {
		h.createOperationAudit(e, record.GetString("system"), "delete_monitoring_rule", importantRuleRecordAuditTarget(kind, record), "", "failed", err.Error(), operationFailureFailed)
		return e.BadRequestError("Failed to resolve monitoring alerts", err)
	}
	if err := h.deleteMonitoredStateForRule(e.App, kind, record); err != nil {
		h.createOperationAudit(e, record.GetString("system"), "delete_monitoring_rule", importantRuleRecordAuditTarget(kind, record), "", "failed", err.Error(), operationFailureFailed)
		return e.BadRequestError("Failed to clean monitoring state", err)
	}
	if err := e.App.Delete(record); err != nil {
		h.createOperationAudit(e, record.GetString("system"), "delete_monitoring_rule", importantRuleRecordAuditTarget(kind, record), "", "failed", err.Error(), operationFailureFailed)
		return e.BadRequestError("Failed to delete monitoring rule", err)
	}
	h.createOperationAudit(e, record.GetString("system"), "delete_monitoring_rule", importantRuleRecordAuditTarget(kind, record), "", "success", "监控规则已删除")
	return e.JSON(200, map[string]string{"id": id, "status": "deleted"})
}

func importantRuleAuditTarget(kind string, name string, containerID string) string {
	kind = strings.TrimSpace(kind)
	if kind == "" {
		kind = "rule"
	}
	target := strings.TrimSpace(name)
	if target == "" {
		target = strings.TrimSpace(containerID)
	}
	if target == "" {
		return kind
	}
	return kind + ":" + target
}

func importantRuleRecordAuditTarget(kind string, record *core.Record) string {
	if record == nil {
		return strings.TrimSpace(kind)
	}
	return importantRuleAuditTarget(kind, record.GetString("name"), record.GetString("container_id"))
}

func (h *Hub) deleteMonitoredStateForRule(app core.App, kind string, rule *core.Record) error {
	if rule == nil {
		return nil
	}
	systemID := strings.TrimSpace(rule.GetString("system"))
	name := strings.TrimSpace(rule.GetString("name"))
	if systemID == "" || name == "" {
		return nil
	}
	switch kind {
	case "service":
		_, err := app.DB().NewQuery(
			"DELETE FROM monitored_services WHERE system = {:system} AND platform = {:platform} AND name = {:name}",
		).Bind(dbx.Params{
			"system":   systemID,
			"platform": strings.ToLower(strings.TrimSpace(rule.GetString("platform"))),
			"name":     name,
		}).Execute()
		return err
	case "software":
		_, err := app.DB().NewQuery(
			"DELETE FROM monitored_software WHERE system = {:system} AND name = {:name}",
		).Bind(dbx.Params{
			"system": systemID,
			"name":   name,
		}).Execute()
		return err
	default:
		return nil
	}
}

func (h *Hub) resolveImportantMonitoringRuleAlerts(app core.App, kind string, rule *core.Record) error {
	alertID := importantMonitoringAlertIDForRule(kind, rule)
	if alertID == "" {
		return nil
	}
	records, err := app.FindRecordsByFilter(
		"alerts_history",
		"alert_id = {:alert_id} && system = {:system} && resolved = null",
		"",
		0,
		0,
		dbx.Params{"alert_id": alertID, "system": rule.GetString("system")},
	)
	if err != nil {
		return nil
	}
	resolvedAt := time.Now().UTC()
	for _, record := range records {
		record.Set("resolved", resolvedAt)
		if err := app.SaveNoValidate(record); err != nil {
			return err
		}
	}
	return nil
}

func importantMonitoringAlertIDForRule(kind string, rule *core.Record) string {
	if rule == nil {
		return ""
	}
	systemID := strings.TrimSpace(rule.GetString("system"))
	name := strings.ToLower(strings.TrimSpace(rule.GetString("name")))
	if systemID == "" || name == "" {
		return ""
	}
	switch kind {
	case "service":
		platform := strings.ToLower(strings.TrimSpace(rule.GetString("platform")))
		return "service:" + stableImportantMonitoringHash(systemID, platform, name)
	case "software":
		return "software:" + stableImportantMonitoringHash(systemID, name)
	case "container":
		return ""
	default:
		return ""
	}
}

func stableImportantMonitoringHash(values ...string) string {
	hash := fnv.New32a()
	for _, value := range values {
		hash.Write([]byte(value))
	}
	return fmt.Sprintf("%x", hash.Sum32())
}

func (h *Hub) findExistingImportantMonitoringRule(app core.App, collectionName string, req importantMonitoringRuleRequest) (*core.Record, error) {
	if req.Kind == "container" {
		return app.FindFirstRecordByFilter(
			collectionName,
			"system = {:system} && container_id = {:container_id}",
			dbx.Params{"system": req.System, "container_id": req.ContainerID},
		)
	}
	return app.FindFirstRecordByFilter(
		collectionName,
		"system = {:system} && platform = {:platform} && name = {:name}",
		dbx.Params{"system": req.System, "platform": req.Platform, "name": req.Name},
	)
}

func applyImportantMonitoringRuleFields(record *core.Record, req importantMonitoringRuleRequest) {
	record.Set("enabled", req.Enabled)
	if req.Kind == "container" {
		record.Set("container_id", req.ContainerID)
		record.Set("name", req.Name)
		record.Set("image", req.Image)
		return
	}
	record.Set("platform", req.Platform)
	record.Set("name", req.Name)
	if req.Kind == "software" {
		record.Set("display_name", req.DisplayName)
	}
	if req.Kind == "service" {
		record.Set("note", req.Note)
	}
}

func importantMonitoringCollection(kind string) (string, error) {
	switch kind {
	case "software":
		return "software_monitor_rules", nil
	case "service":
		return "service_control_rules", nil
	case "container":
		return "container_monitor_rules", nil
	default:
		return "", errInvalidImportantMonitoringKind
	}
}

var errInvalidImportantMonitoringKind = invalidImportantMonitoringKindError{}

type invalidImportantMonitoringKindError struct{}

func (invalidImportantMonitoringKindError) Error() string {
	return "Invalid monitoring kind"
}

func (h *Hub) authCanWriteSystem(e *core.RequestEvent, systemID string) bool {
	if e.Auth == nil || e.Auth.GetString("role") == "readonly" {
		return false
	}
	if systemID == "" {
		return false
	}
	if value, _ := utils.GetEnv("SHARE_ALL_SYSTEMS"); value == "true" {
		return true
	}
	record, err := e.App.FindRecordById("systems", systemID)
	if err != nil {
		return false
	}
	for _, userID := range record.GetStringSlice("users") {
		if userID == e.Auth.Id {
			return true
		}
	}
	return false
}
