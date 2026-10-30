package hub

import (
	"net/http"
	"regexp"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	"gutenacht.site/pulse/internal/hub/systems"
)

var containerIDPattern = regexp.MustCompile(`^[a-fA-F0-9]{12,64}$`)

// containerRequestHandler handles both container logs and info requests
func (h *Hub) containerRequestHandler(e *core.RequestEvent, fetchFunc func(*systems.System, string) (string, error), responseKey string) error {
	systemID := e.Request.URL.Query().Get("system")
	containerID := e.Request.URL.Query().Get("container")

	if systemID == "" || containerID == "" || !containerIDPattern.MatchString(containerID) {
		return e.BadRequestError("Invalid system or container parameter", nil)
	}

	system, err := h.sm.GetSystem(systemID)
	if err != nil || !system.HasUser(e.App, e.Auth) {
		return e.NotFoundError("", nil)
	}

	data, err := fetchFunc(system, containerID)
	if err != nil {
		return e.InternalServerError("", err)
	}

	return e.JSON(http.StatusOK, map[string]string{responseKey: data})
}

// getContainerLogs handles GET /api/pulse/containers/logs requests
func (h *Hub) getContainerLogs(e *core.RequestEvent) error {
	return h.containerRequestHandler(e, func(system *systems.System, containerID string) (string, error) {
		return system.FetchContainerLogsFromAgent(containerID)
	}, "logs")
}

func (h *Hub) getContainerInfo(e *core.RequestEvent) error {
	return h.containerRequestHandler(e, func(system *systems.System, containerID string) (string, error) {
		return system.FetchContainerInfoFromAgent(containerID)
	}, "info")
}

func (h *Hub) searchServices(e *core.RequestEvent) error {
	query := strings.TrimSpace(e.Request.URL.Query().Get("q"))
	systemID := e.Request.URL.Query().Get("system")
	if systemID == "" {
		return e.BadRequestError("Invalid system parameter", nil)
	}
	if query == "" {
		return e.BadRequestError("Search query is required", nil)
	}
	if len(query) < 2 {
		return e.BadRequestError("Search query must be at least 2 characters", nil)
	}
	system, err := h.sm.GetSystem(systemID)
	if err != nil || !system.HasUser(e.App, e.Auth) {
		return e.NotFoundError("", nil)
	}
	if !system.SupportsWindowsServiceMonitoring() {
		return e.BadRequestError("Current system does not support service monitoring", nil)
	}
	result, err := system.SearchServicesFromAgent(query, 50)
	if err != nil {
		return e.InternalServerError("", err)
	}
	return e.JSON(http.StatusOK, result)
}

func (h *Hub) searchSoftware(e *core.RequestEvent) error {
	query := strings.TrimSpace(e.Request.URL.Query().Get("q"))
	systemID := e.Request.URL.Query().Get("system")
	if systemID == "" {
		return e.BadRequestError("Invalid system parameter", nil)
	}
	if query == "" {
		return e.BadRequestError("Search query is required", nil)
	}
	if len(query) < 2 {
		return e.BadRequestError("Search query must be at least 2 characters", nil)
	}
	system, err := h.sm.GetSystem(systemID)
	if err != nil || !system.HasUser(e.App, e.Auth) {
		return e.NotFoundError("", nil)
	}
	if !system.SupportsSoftwareMonitoring() {
		return e.BadRequestError("Current system does not support software monitoring", nil)
	}
	result, err := system.SearchSoftwareFromAgent(query, 50)
	if err != nil {
		return e.InternalServerError("", err)
	}
	return e.JSON(http.StatusOK, result)
}

func (h *Hub) deleteServiceControlRule(e *core.RequestEvent) error {
	id := e.Request.PathValue("id")
	if id == "" {
		return e.BadRequestError("Invalid rule id", nil)
	}
	rule, err := h.FindRecordById("service_control_rules", id)
	if err != nil {
		return e.NotFoundError("", err)
	}
	system, err := h.sm.GetSystem(rule.GetString("system"))
	if err != nil || !system.HasUser(e.App, e.Auth) {
		return e.NotFoundError("", nil)
	}
	if e.Auth.GetString("role") == "readonly" {
		h.createOperationAudit(e, rule.GetString("system"), "delete_service_control_rule", rule.GetString("name"), "", "failed", "Readonly users cannot remove service monitoring rules", operationFailureDenied)
		return e.ForbiddenError("Readonly users cannot remove service monitoring rules", nil)
	}
	if err := h.Delete(rule); err != nil {
		h.createOperationAudit(e, rule.GetString("system"), "delete_service_control_rule", rule.GetString("name"), "", "failed", err.Error(), operationFailureFailed)
		return e.InternalServerError("", err)
	}
	h.createOperationAudit(e, rule.GetString("system"), "delete_service_control_rule", rule.GetString("name"), "", "success", "服务控制规则已删除")
	return e.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

// refreshSmartData handles POST /api/pulse/smart/refresh requests
// Fetches fresh SMART data from the agent and updates the collection
func (h *Hub) refreshSmartData(e *core.RequestEvent) error {
	systemID := e.Request.URL.Query().Get("system")
	if systemID == "" {
		h.createOperationAudit(e, "", "refresh_smart", "", "", "failed", "Invalid system parameter", operationFailureInvalidRequest)
		return e.BadRequestError("Invalid system parameter", nil)
	}

	system, err := h.sm.GetSystem(systemID)
	if err != nil || !system.HasUser(e.App, e.Auth) {
		return e.NotFoundError("", nil)
	}

	if err := system.FetchAndSaveSmartDevices(); err != nil {
		h.createOperationAudit(e, systemID, "refresh_smart", "", "", "failed", err.Error(), operationFailureFailed)
		return e.InternalServerError("", err)
	}

	h.createOperationAudit(e, systemID, "refresh_smart", "", "", "success", "S.M.A.R.T. 数据已刷新")
	return e.JSON(http.StatusOK, map[string]string{"status": "ok"})
}
