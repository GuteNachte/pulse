package hub

import (
	"errors"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

var errLocalSystemCannotBeDeleted = errors.New("Hub 机器记录不能删除")

func (h *Hub) bindSystemDeleteProtectionHooks() {
	h.App.OnRecordUpdateRequest("systems").BindFunc(func(e *core.RecordRequestEvent) error {
		info, err := e.RequestInfo()
		if err == nil && info != nil {
			if _, ok := info.Body["is_local"]; ok {
				return e.BadRequestError("Hub 标签只能由 Hub 自动维护", nil)
			}
			if _, ok := info.Body["name"]; ok {
				return e.BadRequestError("机器真实主机名只能由 Agent 自动维护，请修改显示名称", nil)
			}
		}
		return e.Next()
	})
	h.App.OnRecordDeleteRequest("systems").BindFunc(func(e *core.RecordRequestEvent) error {
		if isLocalSystemRecord(e.Record) {
			return e.BadRequestError(errLocalSystemCannotBeDeleted.Error(), errLocalSystemCannotBeDeleted)
		}
		return e.Next()
	})
	h.App.OnRecordDelete("systems").BindFunc(func(e *core.RecordEvent) error {
		if isLocalSystemRecord(e.Record) {
			return errLocalSystemCannotBeDeleted
		}
		return e.Next()
	})
}

func (h *Hub) deleteSystemAndRelatedData(e *core.RequestEvent) error {
	systemID := strings.TrimSpace(e.Request.PathValue("id"))
	if systemID == "" {
		h.createOperationAudit(e, "", "delete_system", "", "", "failed", "System id is required", operationFailureInvalidRequest)
		return e.BadRequestError("System id is required", nil)
	}
	if !h.authCanWriteSystem(e, systemID) {
		return e.NotFoundError("", nil)
	}
	if err := ensureSystemCanBeDeleted(e.App, systemID); err != nil {
		h.createOperationAudit(e, systemID, "delete_system", systemID, "", "failed", errLocalSystemCannotBeDeleted.Error(), operationFailureProtected)
		return e.BadRequestError(errLocalSystemCannotBeDeleted.Error(), err)
	}
	if err := deleteSystemRelatedData(e.App, systemID); err != nil {
		h.createOperationAudit(e, systemID, "delete_system", systemID, "", "failed", err.Error(), operationFailureFailed)
		return e.BadRequestError("Failed to delete system data", err)
	}
	if record, err := e.App.FindRecordById("systems", systemID); err == nil {
		if err := e.App.Delete(record); err != nil {
			// Fallback to a raw delete if the generic record delete path is not
			// available in the current PocketBase request context.
			if _, rawErr := e.App.DB().NewQuery("DELETE FROM systems WHERE id = {:system}").Bind(dbx.Params{"system": systemID}).Execute(); rawErr != nil {
				h.createOperationAudit(e, systemID, "delete_system", systemID, "", "failed", err.Error(), operationFailureFailed)
				return e.BadRequestError("Failed to delete system", err)
			}
		}
	} else {
		if _, rawErr := e.App.DB().NewQuery("DELETE FROM systems WHERE id = {:system}").Bind(dbx.Params{"system": systemID}).Execute(); rawErr != nil {
			h.createOperationAudit(e, "", "delete_system", systemID, "", "failed", err.Error(), operationFailureNotFound)
			return e.NotFoundError("", err)
		}
	}
	_ = h.sm.RemoveSystem(systemID)
	h.createOperationAudit(e, "", "delete_system", systemID, "", "success", "机器已删除")
	return e.JSON(200, map[string]string{"id": systemID, "status": "deleted"})
}

func ensureSystemCanBeDeleted(app core.App, systemID string) error {
	record, err := app.FindRecordById("systems", systemID)
	if err != nil {
		return err
	}
	if isLocalSystemRecord(record) {
		return errLocalSystemCannotBeDeleted
	}
	return nil
}

func isLocalSystemRecord(record *core.Record) bool {
	return record != nil && record.GetBool("is_local")
}

func deleteSystemRelatedData(app core.App, systemID string) error {
	_, monitorsErr := app.FindCollectionByNameOrId("website_monitors")
	_, checksErr := app.FindCollectionByNameOrId("website_monitor_checks")
	if monitorsErr == nil && checksErr == nil {
		if _, err := app.DB().NewQuery(
			"DELETE FROM website_monitor_checks WHERE monitor IN (SELECT id FROM website_monitors WHERE system = {:system})",
		).Bind(dbx.Params{"system": systemID}).Execute(); err != nil {
			return err
		}
	}

	tables := []string{
		"fingerprints",
		"system_details",
		"system_stats",
		"containers",
		"container_stats",
		"service_control_rules",
		"software_monitor_rules",
		"container_monitor_rules",
		"monitored_services",
		"monitored_software",
		"operation_actions",
		"operation_audit",
		"alerts_history",
		"website_monitors",
	}
	for _, table := range tables {
		if _, err := app.FindCollectionByNameOrId(table); err != nil {
			continue
		}
		if _, err := app.DB().NewQuery("DELETE FROM " + table + " WHERE system = {:system}").Bind(dbx.Params{"system": systemID}).Execute(); err != nil {
			if table == "operation_actions" || table == "operation_audit" || table == "alerts_history" {
				continue
			}
			return err
		}
	}
	return nil
}
