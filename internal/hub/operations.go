package hub

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"gutenacht.site/pulse/internal/common"
)

type operationCreateRequest struct {
	System  string            `json:"system"`
	Action  string            `json:"action"`
	Target  string            `json:"target"`
	Params  map[string]string `json:"params"`
	Confirm bool              `json:"confirm"`
}

type operationAuditListResponse struct {
	Items   []*core.Record `json:"items"`
	Page    int            `json:"page"`
	PerPage int            `json:"perPage"`
	HasMore bool           `json:"hasMore"`
}

type operationActorInfo struct {
	Id       string `json:"id"`
	Username string `json:"username,omitempty"`
	Email    string `json:"email,omitempty"`
}

var allowedOperationActions = []string{
	"refresh_services",
	"start_monitored_service",
	"stop_monitored_service",
	"restart_monitored_service",
	"start_container",
	"stop_container",
	"restart_container",
	"update_container_image",
	"start_container_stack",
	"stop_container_stack",
	"restart_container_stack",
	"update_container_stack_images",
	"update_agent",
}

const (
	operationFailureOffline           = "offline"
	operationFailureAgentDisconnected = "agent_disconnected"
	operationFailureTimeout           = "timeout"
	operationFailureProtected         = "protected"
	operationFailureUnsupported       = "unsupported"
	operationFailureDenied            = "denied"
	operationFailureInvalidRequest    = "invalid_request"
	operationFailureNotFound          = "not_found"
	operationFailureFailed            = "failed"
)

var operationFailureCodes = []string{
	operationFailureOffline,
	operationFailureAgentDisconnected,
	operationFailureTimeout,
	operationFailureProtected,
	operationFailureUnsupported,
	operationFailureDenied,
	operationFailureInvalidRequest,
	operationFailureNotFound,
	operationFailureFailed,
}

func AllowedOperationActions() []string {
	return append([]string(nil), allowedOperationActions...)
}

func OperationFailureCodes() []string {
	return append([]string(nil), operationFailureCodes...)
}

func (h *Hub) createOperation(e *core.RequestEvent) error {
	var req operationCreateRequest
	if err := e.BindBody(&req); err != nil {
		return e.BadRequestError("Invalid request body", err)
	}
	req.Action = strings.TrimSpace(req.Action)
	req.Target = strings.TrimSpace(req.Target)
	if !req.Confirm {
		failure := operationFailureForCode(operationFailureInvalidRequest, "操作需要先确认。")
		h.createOperationAudit(e, req.System, req.Action, req.Target, "", "failed", failure.Message, failure.Code)
		return e.JSON(failure.HTTPStatus, operationFailureResponse(failure, ""))
	}
	if !isAllowedOperationAction(req.Action) {
		failure := operationFailureForCode(operationFailureUnsupported, "当前版本不允许执行这个操作。")
		h.createOperationAudit(e, req.System, req.Action, req.Target, "", "failed", failure.Message, failure.Code)
		return e.JSON(failure.HTTPStatus, operationFailureResponse(failure, ""))
	}
	if err := validateOperationParams(req.Action, req.Params); err != nil {
		failure := operationFailureForCode(operationFailureInvalidRequest, err.Error())
		h.createOperationAudit(e, req.System, req.Action, req.Target, "", "failed", failure.Message, failure.Code)
		return e.JSON(failure.HTTPStatus, operationFailureResponse(failure, ""))
	}
	if isServiceOperationAction(req.Action) && req.Target == "" {
		failure := operationFailureForCode(operationFailureInvalidRequest, "操作目标不能为空。")
		h.createOperationAudit(e, req.System, req.Action, req.Target, "", "failed", failure.Message, failure.Code)
		return e.JSON(failure.HTTPStatus, operationFailureResponse(failure, ""))
	}
	if isContainerOperationAction(req.Action) && req.Target == "" {
		failure := operationFailureForCode(operationFailureInvalidRequest, "容器 ID 不能为空。")
		h.createOperationAudit(e, req.System, req.Action, req.Target, "", "failed", failure.Message, failure.Code)
		return e.JSON(failure.HTTPStatus, operationFailureResponse(failure, ""))
	}
	if isContainerStackOperationAction(req.Action) && req.Target == "" {
		failure := operationFailureForCode(operationFailureInvalidRequest, "Compose 编排名称不能为空。")
		h.createOperationAudit(e, req.System, req.Action, req.Target, "", "failed", failure.Message, failure.Code)
		return e.JSON(failure.HTTPStatus, operationFailureResponse(failure, ""))
	}

	system, err := h.sm.GetSystem(req.System)
	if err != nil || !system.HasUser(e.App, e.Auth) {
		return e.NotFoundError("", nil)
	}
	if isMonitoredServiceOperationAction(req.Action) {
		serviceRecord, err := e.App.FindFirstRecordByFilter("monitored_services", "system = {:system} && name = {:name}", dbx.Params{
			"system": req.System,
			"name":   req.Target,
		})
		if err != nil {
			failure := operationFailureForCode(operationFailureNotFound, "这台机器没有找到该服务，操作未执行。")
			h.createOperationAudit(e, req.System, req.Action, req.Target, "", "failed", failure.Message, failure.Code)
			return e.JSON(failure.HTTPStatus, operationFailureResponse(failure, ""))
		}
		if isProtectedMonitoredService(serviceRecord.GetString("platform"), req.Target) {
			failure := operationFailureForCode(operationFailureProtected, "这是受保护的 Windows 服务，Pulse 不允许远程控制。")
			h.createOperationAudit(e, req.System, req.Action, req.Target, "", "failed", failure.Message, failure.Code)
			return e.JSON(failure.HTTPStatus, operationFailureResponse(failure, ""))
		}
		if _, err := e.App.FindFirstRecordByFilter("service_control_rules", "system = {:system} && platform = 'windows' && name = {:name} && enabled = true", dbx.Params{
			"system": req.System,
			"name":   req.Target,
		}); err != nil {
			failure := operationFailureForCode(operationFailureDenied, "该服务未加入控制白名单，操作未执行。")
			h.createOperationAudit(e, req.System, req.Action, req.Target, "", "failed", failure.Message, failure.Code)
			return e.JSON(failure.HTTPStatus, operationFailureResponse(failure, ""))
		}
	}
	if isContainerOperationAction(req.Action) {
		containerRecord, err := e.App.FindFirstRecordByFilter("containers", "system = {:system} && id = {:id}", dbx.Params{
			"system": req.System,
			"id":     req.Target,
		})
		if err != nil {
			failure := operationFailureForCode(operationFailureNotFound, "这台机器没有找到该容器，操作未执行。")
			h.createOperationAudit(e, req.System, req.Action, req.Target, "", "failed", failure.Message, failure.Code)
			return e.JSON(failure.HTTPStatus, operationFailureResponse(failure, ""))
		}
		if reason := protectedContainerReason(containerRecord.GetString("name"), containerRecord.GetString("image"), containerRecord.GetString("stack_project")); reason != "" {
			failure := operationFailureForCode(operationFailureProtected, reason)
			h.createOperationAudit(e, req.System, req.Action, req.Target, "", "failed", failure.Message, failure.Code)
			return e.JSON(failure.HTTPStatus, operationFailureResponse(failure, ""))
		}
	}
	if isContainerStackOperationAction(req.Action) {
		containers, err := h.findStackOperationContainers(e.App, req.System, req.Target, req.Action)
		if err != nil {
			code := operationFailureInvalidRequest
			if errors.Is(err, errProtectedContainerInStack) {
				code = operationFailureProtected
			}
			failure := operationFailureForCode(code, err.Error())
			h.createOperationAudit(e, req.System, req.Action, req.Target, "", "failed", failure.Message, failure.Code)
			return e.JSON(failure.HTTPStatus, operationFailureResponse(failure, ""))
		}
		if len(containers) == 0 {
			failure := operationFailureForCode(operationFailureInvalidRequest, "该 Compose 编排没有可控制的容器。")
			h.createOperationAudit(e, req.System, req.Action, req.Target, "", "failed", failure.Message, failure.Code)
			return e.JSON(failure.HTTPStatus, operationFailureResponse(failure, ""))
		}
	}
	systemRecord, err := e.App.FindRecordById("systems", req.System)
	if err != nil {
		return e.NotFoundError("", err)
	}
	if systemRecord.GetString("status") != "up" {
		failure := operationFailureForCode(operationFailureOffline, "")
		h.createOperationAudit(e, req.System, req.Action, req.Target, "", "failed", failure.Message, failure.Code)
		return e.JSON(failure.HTTPStatus, operationFailureResponse(failure, ""))
	}
	if err := validateOperationCapability(systemRecord, req.Action); err != nil {
		failure := operationFailureForCode(operationFailureUnsupported, err.Error())
		h.createOperationAudit(e, req.System, req.Action, req.Target, "", "failed", failure.Message, failure.Code)
		return e.JSON(failure.HTTPStatus, operationFailureResponse(failure, ""))
	}
	if req.Action == "update_agent" {
		req.Params, err = loadAgentUpdateReleaseParams(e.App, req.Params["release_id"])
		if err != nil {
			failure := operationFailureForCode(operationFailureInvalidRequest, err.Error())
			h.createOperationAudit(e, req.System, req.Action, req.Target, "", "failed", failure.Message, failure.Code)
			return e.JSON(failure.HTTPStatus, operationFailureResponse(failure, ""))
		}
		systemPlatform := agentCapabilityPlatform(systemRecord)
		releasePlatform := strings.ToLower(strings.TrimSpace(req.Params["platform"]))
		if releasePlatform != "" && releasePlatform != "all" && systemPlatform != "" && releasePlatform != systemPlatform {
			message := fmt.Sprintf("agent release platform %s does not match system platform %s", releasePlatform, systemPlatform)
			failure := operationFailureForCode(operationFailureDenied, message)
			h.createOperationAudit(e, req.System, req.Action, req.Target, "", "failed", failure.Message, failure.Code)
			return e.JSON(failure.HTTPStatus, operationFailureResponse(failure, ""))
		}
		if err := validateAgentUpdateRuntimeCompatibility(systemRecord, req.Params); err != nil {
			failure := operationFailureForCode(operationFailureUnsupported, err.Error())
			h.createOperationAudit(e, req.System, req.Action, req.Target, "", "failed", failure.Message, failure.Code)
			return e.JSON(failure.HTTPStatus, operationFailureResponse(failure, ""))
		}
		if err := validateOperationParams(req.Action, req.Params); err != nil {
			failure := operationFailureForCode(operationFailureInvalidRequest, err.Error())
			h.createOperationAudit(e, req.System, req.Action, req.Target, "", "failed", failure.Message, failure.Code)
			return e.JSON(failure.HTTPStatus, operationFailureResponse(failure, ""))
		}
	}

	operationTimeout := timeoutForOperation(req.Action)
	actionRecord, err := h.createOperationAction(e, req, "running", "", "", operationTimeout)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), operationTimeout)
	defer cancel()
	var result common.OperationResult
	if isContainerStackOperationAction(req.Action) {
		result, err = h.runContainerStackOperation(ctx, e.App, system, req)
	} else {
		err = system.RunOperation(ctx, common.OperationRequest{
			Action: req.Action,
			Target: req.Target,
			Params: req.Params,
		}, &result)
	}
	if err != nil {
		failure := operationFailureForError(err)
		actionRecord.Set("status", "failed")
		actionRecord.Set("failure_code", failure.Code)
		actionRecord.Set("error", failure.Message)
		completeOperationAction(actionRecord, "failed", "", failure.Message, failure.Code)
		_ = e.App.SaveNoValidate(actionRecord)
		h.createOperationAudit(e, req.System, req.Action, req.Target, actionRecord.Id, "failed", failure.Message, failure.Code)
		return e.JSON(failure.HTTPStatus, operationFailureResponse(failure, actionRecord.Id))
	}
	status := result.Status
	if status != "succeeded" && status != "pending" {
		status = "failed"
	}
	if req.Action == "update_agent" && status == "pending" {
		actionRecord.Set("status", "running")
		actionRecord.Set("stage", "waiting_reconnect")
		actionRecord.Set("result", result.Message)
		if err := e.App.SaveNoValidate(actionRecord); err != nil {
			return err
		}
		go h.monitorAgentUpdate(req.System, actionRecord.Id, req.Params["version"])
		return e.JSON(http.StatusOK, map[string]any{
			"id": actionRecord.Id, "status": "running", "stage": "waiting_reconnect",
			"duration_ms": actionRecord.GetInt("duration_ms"), "message": "更新已开始，正在等待 Agent 重连并核对版本。",
		})
	}
	actionRecord.Set("status", status)
	actionRecord.Set("result", result.Message)
	failureCode := ""
	if status == "failed" {
		failure := operationFailureForResult(result)
		if failure == nil {
			defaultFailure := operationFailureForCode(operationFailureFailed, result.Message)
			failure = &defaultFailure
		}
		failureCode = failure.Code
		actionRecord.Set("error", failure.Message)
		actionRecord.Set("failure_code", failure.Code)
		result.Message = failure.Message
	}
	completeOperationAction(actionRecord, status, result.Message, actionRecord.GetString("error"), failureCode)
	if err := e.App.SaveNoValidate(actionRecord); err != nil {
		return err
	}
	if status == "succeeded" {
		h.updateMonitoredServiceStateAfterOperation(e.App, req)
		h.updateContainerStateAfterOperation(e.App, req)
	}
	auditResult := "success"
	if status == "failed" {
		auditResult = "failed"
	}
	h.createOperationAudit(e, req.System, req.Action, req.Target, actionRecord.Id, auditResult, result.Message, failureCode)
	return e.JSON(http.StatusOK, map[string]any{
		"id":           actionRecord.Id,
		"status":       status,
		"stage":        actionRecord.GetString("stage"),
		"duration_ms":  actionRecord.GetInt("duration_ms"),
		"failure_code": failureCode,
		"message":      result.Message,
	})
}

func (h *Hub) monitorAgentUpdate(systemID, operationID, targetVersion string) {
	deadline := time.Now().Add(5 * time.Minute)
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()
	for time.Now().Before(deadline) {
		<-ticker.C
		sys, err := h.sm.GetSystem(systemID)
		if err != nil {
			continue
		}
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		data, fetchErr := sys.FetchDataForAgentUpdate(ctx)
		cancel()
		if fetchErr != nil || data == nil {
			continue
		}
		if data.Info.Capabilities != nil && data.Info.Capabilities.LastUpdate != nil {
			lastUpdate := data.Info.Capabilities.LastUpdate
			if lastUpdate.Status == "failed" && compareLooseAgentVersion(lastUpdate.Version, targetVersion) == 0 {
				h.finishAgentUpdateOperation(operationID, "failed", "Agent 更新失败："+lastUpdate.Message)
				return
			}
		}
		if compareLooseAgentVersion(data.Info.AgentVersion, targetVersion) != 0 {
			continue
		}
		h.finishAgentUpdateOperation(operationID, "succeeded", "Agent 已重新连接并运行目标版本 "+targetVersion+"。")
		return
	}
	h.finishAgentUpdateOperation(operationID, "failed", "更新超时：Agent 未在规定时间内以目标版本重新连接。")
}

func (h *Hub) finishAgentUpdateOperation(operationID, status, message string) {
	record, err := h.FindRecordById("operation_actions", operationID)
	if err != nil {
		return
	}
	record.Set("status", status)
	record.Set("stage", "completed")
	record.Set("result", message)
	record.Set("error", "")
	record.Set("failure_code", "")
	if status == "failed" {
		record.Set("error", message)
		record.Set("failure_code", operationFailureFailed)
	}
	record.Set("completed_at", time.Now().UTC())
	startedAt := record.GetDateTime("started_at")
	if !startedAt.IsZero() {
		record.Set("duration_ms", int(time.Since(startedAt.Time()).Milliseconds()))
	}
	_ = h.SaveNoValidate(record)
}

func (h *Hub) getOperations(e *core.RequestEvent) error {
	systemID := e.Request.URL.Query().Get("system")
	filter := ""
	params := dbx.Params{}
	if systemID != "" {
		system, err := h.sm.GetSystem(systemID)
		if err != nil || !system.HasUser(e.App, e.Auth) {
			return e.NotFoundError("", nil)
		}
		filter = "system = {:system}"
		params["system"] = systemID
	}
	records, err := e.App.FindRecordsByFilter("operation_actions", filter, "-created", 50, 0, params)
	if err != nil {
		return err
	}
	h.enrichOperationActors(e.App, records)
	return e.JSON(http.StatusOK, records)
}

func (h *Hub) getOperationAudit(e *core.RequestEvent) error {
	systemID := e.Request.URL.Query().Get("system")
	operationID := strings.TrimSpace(e.Request.URL.Query().Get("operation"))
	page := clampQueryInt(e.Request.URL.Query().Get("page"), 1, 1, 10_000)
	perPage := clampQueryInt(e.Request.URL.Query().Get("perPage"), 80, 1, 100)
	search := strings.TrimSpace(e.Request.URL.Query().Get("search"))
	action := strings.TrimSpace(e.Request.URL.Query().Get("action"))
	result := strings.TrimSpace(e.Request.URL.Query().Get("result"))
	filter := ""
	params := dbx.Params{}
	if operationID != "" {
		actionRecord, err := e.App.FindRecordById("operation_actions", operationID)
		if err != nil {
			return e.NotFoundError("", nil)
		}
		actionSystemID := actionRecord.GetString("system")
		system, err := h.sm.GetSystem(actionSystemID)
		if err != nil || !system.HasUser(e.App, e.Auth) {
			return e.NotFoundError("", nil)
		}
		filter = "operation = {:operation}"
		params["operation"] = operationID
	}
	if systemID != "" {
		system, err := h.sm.GetSystem(systemID)
		if err != nil || !system.HasUser(e.App, e.Auth) {
			return e.NotFoundError("", nil)
		}
		if filter != "" {
			filter += " && "
		}
		filter += "system = {:system}"
		params["system"] = systemID
	}
	if filter == "" && (e.Auth == nil || (!e.Auth.IsSuperuser() && e.Auth.GetString("role") != "admin")) {
		filter = "user = {:user}"
		if e.Auth != nil {
			params["user"] = e.Auth.Id
		} else {
			params["user"] = ""
		}
	}
	if action != "" && action != "all" {
		appendPocketBaseFilter(&filter, "action = {:action}")
		params["action"] = action
	}
	if result != "" && result != "all" {
		appendPocketBaseFilter(&filter, "result = {:result}")
		params["result"] = result
	}
	if search != "" {
		appendPocketBaseFilter(&filter, operationAuditSearchFilter(search))
		params["search"] = "%" + search + "%"
	}
	if e.Request.URL.Query().Get("paged") == "1" || e.Request.URL.Query().Has("page") || e.Request.URL.Query().Has("perPage") || e.Request.URL.Query().Has("search") || e.Request.URL.Query().Has("action") || e.Request.URL.Query().Has("result") || e.Request.URL.Query().Has("operation") {
		records, err := e.App.FindRecordsByFilter("operation_audit", filter, "-created", perPage+1, (page-1)*perPage, params)
		if err != nil {
			return err
		}
		hasMore := len(records) > perPage
		if hasMore {
			records = records[:perPage]
		}
		h.enrichOperationActors(e.App, records)
		return e.JSON(http.StatusOK, operationAuditListResponse{
			Items:   records,
			Page:    page,
			PerPage: perPage,
			HasMore: hasMore,
		})
	}
	records, err := e.App.FindRecordsByFilter("operation_audit", filter, "-created", 80, 0, params)
	if err != nil {
		return err
	}
	h.enrichOperationActors(e.App, records)
	return e.JSON(http.StatusOK, records)
}

func (h *Hub) enrichOperationActors(app core.App, records []*core.Record) {
	if len(records) == 0 {
		return
	}
	userIDs := make([]string, 0, len(records))
	seen := map[string]struct{}{}
	for _, record := range records {
		userID := strings.TrimSpace(record.GetString("user"))
		if userID == "" {
			continue
		}
		if _, ok := seen[userID]; ok {
			continue
		}
		seen[userID] = struct{}{}
		userIDs = append(userIDs, userID)
	}
	if len(userIDs) == 0 {
		return
	}
	users, err := app.FindRecordsByIds("users", userIDs)
	if err != nil {
		return
	}
	actors := make(map[string]operationActorInfo, len(users))
	for _, user := range users {
		actors[user.Id] = operationActorInfo{
			Id:       user.Id,
			Username: strings.TrimSpace(user.GetString("username")),
			Email:    strings.TrimSpace(user.GetString("email")),
		}
	}
	for _, record := range records {
		userID := strings.TrimSpace(record.GetString("user"))
		if userID == "" {
			continue
		}
		actor, ok := actors[userID]
		if !ok {
			actor = operationActorInfo{Id: userID}
		}
		record.WithCustomData(true)
		record.Set("actor", actor)
		expand := record.Expand()
		if expand == nil {
			expand = map[string]any{}
		}
		expand["user"] = actor
		record.SetExpand(expand)
	}
}

func appendPocketBaseFilter(filter *string, clause string) {
	if *filter != "" {
		*filter += " && "
	}
	*filter += clause
}

func operationAuditSearchFilter(search string) string {
	clauses := []string{
		"action ~ {:search}",
		"target ~ {:search}",
		"detail ~ {:search}",
		"system ~ {:search}",
		"operation ~ {:search}",
		"ip ~ {:search}",
		"failure_code ~ {:search}",
	}
	return "(" + strings.Join(clauses, " || ") + ")"
}

func clampQueryInt(raw string, fallback int, minValue int, maxValue int) int {
	value, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil {
		return fallback
	}
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}

func (h *Hub) createOperationAction(e *core.RequestEvent, req operationCreateRequest, status string, result string, errorMessage string, timeout time.Duration) (*core.Record, error) {
	collection, err := e.App.FindCachedCollectionByNameOrId("operation_actions")
	if err != nil {
		return nil, err
	}
	record := core.NewRecord(collection)
	record.Set("system", req.System)
	record.Set("user", e.Auth.Id)
	record.Set("action", req.Action)
	record.Set("target", req.Target)
	record.Set("params", sanitizeOperationParams(req.Params))
	record.Set("status", status)
	record.Set("stage", operationStageForStatus(status))
	record.Set("result", result)
	record.Set("error", errorMessage)
	if errorMessage != "" {
		record.Set("failure_code", operationFailureFailed)
	}
	record.Set("timeout_seconds", int(timeout.Seconds()))
	if status == "running" {
		record.Set("started_at", time.Now().UTC())
	}
	return record, e.App.SaveNoValidate(record)
}

func completeOperationAction(record *core.Record, status string, result string, errorMessage string, failureCode ...string) {
	completedAt := time.Now().UTC()
	record.Set("stage", "completed")
	record.Set("status", status)
	record.Set("result", result)
	record.Set("error", errorMessage)
	code := ""
	if len(failureCode) > 0 {
		code = strings.TrimSpace(failureCode[0])
	}
	if status != "failed" || errorMessage == "" {
		code = ""
	}
	record.Set("failure_code", code)
	record.Set("completed_at", completedAt)
	startedAt := record.GetDateTime("started_at")
	if !startedAt.IsZero() {
		duration := completedAt.Sub(startedAt.Time())
		if duration < 0 {
			duration = 0
		}
		record.Set("duration_ms", int(duration.Milliseconds()))
	}
}

func operationStageForStatus(status string) string {
	switch status {
	case "pending":
		return "queued"
	case "running":
		return "executing"
	case "succeeded", "failed":
		return "completed"
	default:
		return "validating"
	}
}

func timeoutForOperation(action string) time.Duration {
	switch action {
	case "update_agent":
		return 5 * time.Minute
	case "update_container_image", "update_container_stack_images":
		return 5 * time.Minute
	case "start_container_stack", "stop_container_stack", "restart_container_stack":
		return 10 * time.Minute
	case "start_container", "stop_container", "restart_container":
		return 2 * time.Minute
	default:
		return 15 * time.Second
	}
}

func (h *Hub) createOperationAudit(e *core.RequestEvent, systemID string, action string, target string, operationID string, result string, detail string, failureCode ...string) {
	userID := ""
	if e.Auth != nil && e.Auth.Id != "" {
		userID = e.Auth.Id
	}
	h.createOperationAuditForUser(e, userID, systemID, action, target, operationID, result, detail, failureCode...)
}

func (h *Hub) createOperationAuditForUser(e *core.RequestEvent, userID string, systemID string, action string, target string, operationID string, result string, detail string, failureCode ...string) {
	ip := ""
	if e != nil && e.Request != nil {
		ip = getRealIP(e.Request)
	}
	h.createOperationAuditRecord(userID, systemID, action, target, operationID, result, detail, ip, failureCode...)
}

func (h *Hub) createOperationAuditRecord(userID string, systemID string, action string, target string, operationID string, result string, detail string, ip string, failureCode ...string) {
	collection, err := h.FindCachedCollectionByNameOrId("operation_audit")
	if err != nil {
		return
	}
	record := core.NewRecord(collection)
	if userID != "" {
		record.Set("user", userID)
	}
	record.Set("system", systemID)
	if strings.TrimSpace(operationID) != "" {
		record.Set("operation", strings.TrimSpace(operationID))
	}
	record.Set("action", action)
	record.Set("target", common.RedactSensitiveText(target))
	record.Set("result", result)
	record.Set("detail", common.RedactSensitiveText(detail))
	if len(failureCode) > 0 {
		record.Set("failure_code", strings.TrimSpace(failureCode[0]))
	}
	record.Set("ip", strings.TrimSpace(ip))
	_ = h.SaveNoValidate(record)
}

var errProtectedContainerInStack = errors.New("container stack contains protected Pulse related containers")
