package hub

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"gutenacht.site/pulse/internal/common"
	"gutenacht.site/pulse/internal/hub/systems"
	"gutenacht.site/pulse/internal/hub/transport"
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
	if status != "succeeded" {
		status = "failed"
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
	collection, err := e.App.FindCachedCollectionByNameOrId("operation_audit")
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
	record.Set("ip", getRealIP(e.Request))
	_ = e.App.SaveNoValidate(record)
}

type operationFailure struct {
	Code       string
	Message    string
	HTTPStatus int
}

func operationFailureForCode(code string, message string) operationFailure {
	message = strings.TrimSpace(message)
	switch code {
	case operationFailureOffline:
		if message == "" {
			message = "机器离线，操作未发送到 Agent。"
		}
		return operationFailure{Code: code, Message: message, HTTPStatus: http.StatusConflict}
	case operationFailureAgentDisconnected:
		if message == "" {
			message = "Agent 未连接，操作未发送。"
		}
		return operationFailure{Code: code, Message: message, HTTPStatus: http.StatusConflict}
	case operationFailureTimeout:
		if message == "" {
			message = "操作超时，Agent 未在限定时间内返回结果。"
		}
		return operationFailure{Code: code, Message: message, HTTPStatus: http.StatusGatewayTimeout}
	case operationFailureProtected:
		if message == "" {
			message = "目标受 Pulse 保护规则限制，操作未执行。"
		}
		return operationFailure{Code: code, Message: message, HTTPStatus: http.StatusForbidden}
	case operationFailureUnsupported:
		if message == "" {
			message = "当前 Agent 或部署方式不支持这个操作。"
		}
		return operationFailure{Code: code, Message: message, HTTPStatus: http.StatusForbidden}
	case operationFailureDenied:
		if message == "" {
			message = "Agent 或 Hub 拒绝执行这个操作。"
		}
		return operationFailure{Code: code, Message: message, HTTPStatus: http.StatusForbidden}
	case operationFailureInvalidRequest:
		if message == "" {
			message = "操作请求不完整或参数无效。"
		}
		return operationFailure{Code: code, Message: message, HTTPStatus: http.StatusBadRequest}
	case operationFailureNotFound:
		if message == "" {
			message = "目标不存在，操作未执行。"
		}
		return operationFailure{Code: code, Message: message, HTTPStatus: http.StatusNotFound}
	default:
		if message == "" {
			message = "操作执行失败。"
		}
		return operationFailure{Code: operationFailureFailed, Message: message, HTTPStatus: http.StatusInternalServerError}
	}
}

func operationFailureForError(err error) operationFailure {
	if err == nil {
		return operationFailureForCode(operationFailureFailed, "")
	}
	message := strings.TrimSpace(err.Error())
	lower := strings.ToLower(message)
	switch {
	case errors.Is(err, context.DeadlineExceeded), errors.Is(err, context.Canceled):
		return operationFailureForCode(operationFailureTimeout, "")
	case errors.Is(err, transport.ErrWebSocketNotConnected),
		strings.Contains(lower, "websocket") && strings.Contains(lower, "not connected"),
		strings.Contains(lower, "operation channel is not connected"):
		return operationFailureForCode(operationFailureAgentDisconnected, "")
	case strings.Contains(lower, "protected pulse"):
		return operationFailureForCode(operationFailureProtected, message)
	case strings.Contains(lower, "unsupported"):
		return operationFailureForCode(operationFailureUnsupported, message)
	case strings.Contains(lower, "denied"):
		return operationFailureForCode(operationFailureDenied, message)
	default:
		return operationFailureForCode(operationFailureFailed, message)
	}
}

func operationFailureForResult(result common.OperationResult) *operationFailure {
	status := strings.ToLower(strings.TrimSpace(result.Status))
	message := strings.TrimSpace(result.Message)
	var failure operationFailure
	switch status {
	case "denied":
		failure = operationFailureForCode(operationFailureDenied, message)
	case "unsupported":
		failure = operationFailureForCode(operationFailureUnsupported, message)
	case "failed", "":
		failure = operationFailureForCode(operationFailureFailed, message)
	default:
		failure = operationFailureForCode(operationFailureFailed, message)
	}
	return &failure
}

func operationFailureResponse(failure operationFailure, operationID string) map[string]any {
	response := map[string]any{
		"status":       "failed",
		"failure_code": failure.Code,
		"message":      failure.Message,
	}
	if operationID != "" {
		response["id"] = operationID
	}
	return response
}

func sanitizeOperationParams(params map[string]string) map[string]string {
	if params == nil {
		return map[string]string{}
	}
	out := make(map[string]string, len(params))
	for k, v := range params {
		lower := strings.ToLower(k)
		if strings.Contains(lower, "token") || strings.Contains(lower, "secret") || strings.Contains(lower, "password") {
			out[k] = "***"
			continue
		}
		out[k] = v
	}
	return out
}

func isAllowedOperationAction(action string) bool {
	for _, allowed := range allowedOperationActions {
		if action == allowed {
			return true
		}
	}
	return false
}

func validateOperationParams(action string, params map[string]string) error {
	if params == nil {
		if action == "update_agent" {
			return fmt.Errorf("release_id is required")
		}
		return nil
	}
	allowed := map[string]bool{}
	switch action {
	case "update_agent":
		allowed["release_id"] = true
		allowed["version"] = true
		allowed["channel"] = true
		allowed["platform"] = true
		allowed["arch"] = true
		allowed["download_url"] = true
		allowed["checksum"] = true
	default:
		if len(params) > 0 {
			return fmt.Errorf("operation %s does not accept parameters", action)
		}
	}
	for key, value := range params {
		if !allowed[key] {
			return fmt.Errorf("unsupported operation parameter: %s", key)
		}
		if action == "update_agent" {
			if err := validateAgentUpdateParam(key, value); err != nil {
				return err
			}
		}
	}
	if action == "update_agent" && strings.TrimSpace(params["release_id"]) == "" {
		return fmt.Errorf("release_id is required")
	}
	return nil
}

func loadAgentUpdateReleaseParams(app core.App, releaseID string) (map[string]string, error) {
	releaseID = strings.TrimSpace(releaseID)
	if releaseID == "" {
		return nil, fmt.Errorf("release_id is required")
	}
	record, err := app.FindRecordById("agent_releases", releaseID)
	if err != nil {
		return nil, fmt.Errorf("agent release was not found")
	}
	if !record.GetBool("enabled") {
		reason := strings.TrimSpace(record.GetString("disabled_reason"))
		if reason == "" {
			reason = "agent release is disabled"
		}
		return nil, errors.New(reason)
	}
	params := map[string]string{
		"release_id":   record.Id,
		"version":      strings.TrimSpace(record.GetString("version")),
		"channel":      strings.TrimSpace(record.GetString("channel")),
		"platform":     strings.TrimSpace(record.GetString("platform")),
		"arch":         strings.TrimSpace(record.GetString("arch")),
		"download_url": strings.TrimSpace(record.GetString("download_url")),
		"checksum":     strings.TrimSpace(record.GetString("checksum")),
	}
	if params["download_url"] == "" {
		if params["platform"] == "linux" {
			return nil, fmt.Errorf("agent release image is required")
		}
		return nil, fmt.Errorf("agent release download_url is required")
	}
	return params, nil
}

func validateAgentUpdateParam(key string, value string) error {
	value = strings.TrimSpace(value)
	switch key {
	case "release_id":
		if len(value) > 32 {
			return fmt.Errorf("release_id is too long")
		}
	case "version":
		if value == "" || len(value) > 64 || strings.ContainsAny(value, " \t\r\n/\\") {
			return fmt.Errorf("version is invalid")
		}
	case "channel":
		if value != "stable" && value != "beta" && value != "dev" {
			return fmt.Errorf("channel must be stable, beta, or dev")
		}
	case "platform":
		switch value {
		case "all", "windows", "linux", "darwin", "android", "freebsd":
		default:
			return fmt.Errorf("platform is invalid")
		}
	case "arch":
		if len(value) > 64 || strings.ContainsAny(value, " \t\r\n/\\") {
			return fmt.Errorf("arch is invalid")
		}
	case "download_url":
		if value == "" {
			return nil
		}
		if !strings.Contains(value, "://") {
			if len(value) > 512 || strings.ContainsAny(value, " \t\r\n") || strings.HasPrefix(value, "-") {
				return fmt.Errorf("download_url image reference is invalid")
			}
			return nil
		}
		parsed, err := url.Parse(value)
		if err != nil || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.Host == "" {
			return fmt.Errorf("download_url must be http or https")
		}
	case "checksum":
		if value != "" && len(value) > 256 {
			return fmt.Errorf("checksum is too long")
		}
	}
	return nil
}

func isServiceOperationAction(action string) bool {
	return isMonitoredServiceOperationAction(action)
}

func isContainerOperationAction(action string) bool {
	switch action {
	case "start_container", "stop_container", "restart_container", "update_container_image":
		return true
	default:
		return false
	}
}

func isContainerStackOperationAction(action string) bool {
	switch action {
	case "start_container_stack", "stop_container_stack", "restart_container_stack", "update_container_stack_images":
		return true
	default:
		return false
	}
}

func validateOperationCapability(systemRecord *core.Record, action string) error {
	required := requiredAgentOperationForAction(action)
	if required == "" {
		return nil
	}
	operations, reasons := agentCapabilityData(systemRecord)
	for _, operation := range operations {
		if operation == required {
			return nil
		}
	}
	if reason := strings.TrimSpace(reasons[required]); reason != "" {
		return fmt.Errorf("agent does not support %s: %s", required, reason)
	}
	return fmt.Errorf("agent does not support %s", required)
}

func requiredAgentOperationForAction(action string) string {
	switch {
	case isContainerOperationAction(action), isContainerStackOperationAction(action):
		return "container_control"
	case isServiceOperationAction(action):
		return "service_control"
	case action == "update_agent":
		return "agent_update"
	default:
		return ""
	}
}

func agentCapabilityData(systemRecord *core.Record) ([]string, map[string]string) {
	var info struct {
		Capabilities struct {
			Operations         []string          `json:"operations"`
			UnsupportedReasons map[string]string `json:"unsupported_reasons"`
		} `json:"cap"`
	}
	if err := systemRecord.UnmarshalJSONField("info", &info); err != nil {
		return nil, nil
	}
	return info.Capabilities.Operations, info.Capabilities.UnsupportedReasons
}

func agentCapabilityPlatform(systemRecord *core.Record) string {
	var info struct {
		OS           any `json:"os"`
		Capabilities struct {
			Platform string `json:"platform"`
		} `json:"cap"`
	}
	if err := systemRecord.UnmarshalJSONField("info", &info); err != nil {
		return ""
	}
	platform := strings.ToLower(strings.TrimSpace(info.Capabilities.Platform))
	if platform != "" {
		return platform
	}
	return strings.ToLower(strings.TrimSpace(fmt.Sprint(info.OS)))
}

func validateAgentUpdateRuntimeCompatibility(systemRecord *core.Record, params map[string]string) error {
	platform := strings.ToLower(strings.TrimSpace(params["platform"]))
	downloadURL := strings.TrimSpace(params["download_url"])
	if platform != "linux" || downloadURL == "" || strings.Contains(downloadURL, "://") {
		return nil
	}
	var info struct {
		Capabilities struct {
			AgentVersion string `json:"agent_version"`
		} `json:"cap"`
	}
	if err := systemRecord.UnmarshalJSONField("info", &info); err != nil {
		return nil
	}
	if compareLooseAgentVersion(info.Capabilities.AgentVersion, "1.0.1") >= 0 {
		return nil
	}
	return fmt.Errorf("Linux container image self-update requires Agent 1.0.1 or newer; manually upgrade this agent once")
}

func compareLooseAgentVersion(a string, b string) int {
	aParts := looseAgentVersionParts(a)
	bParts := looseAgentVersionParts(b)
	for i := 0; i < 3; i++ {
		if aParts[i] < bParts[i] {
			return -1
		}
		if aParts[i] > bParts[i] {
			return 1
		}
	}
	return 0
}

func looseAgentVersionParts(value string) [3]int {
	var parts [3]int
	raw := strings.Split(strings.TrimPrefix(strings.ToLower(strings.TrimSpace(value)), "v"), ".")
	for i := 0; i < len(raw) && i < 3; i++ {
		for _, r := range raw[i] {
			if r < '0' || r > '9' {
				break
			}
			parts[i] = parts[i]*10 + int(r-'0')
		}
	}
	return parts
}

func isMonitoredServiceOperationAction(action string) bool {
	switch action {
	case "start_monitored_service", "stop_monitored_service", "restart_monitored_service":
		return true
	default:
		return false
	}
}

func (h *Hub) updateMonitoredServiceStateAfterOperation(app core.App, req operationCreateRequest) {
	state, ok := monitoredServiceStateForOperation(req.Action)
	if !ok || strings.TrimSpace(req.System) == "" || strings.TrimSpace(req.Target) == "" {
		return
	}
	record, err := app.FindFirstRecordByFilter("monitored_services", "system = {:system} && name = {:name}", dbx.Params{
		"system": req.System,
		"name":   req.Target,
	})
	if err != nil {
		return
	}
	record.Set("state", state)
	record.Set("updated", time.Now().UTC().UnixMilli())
	_ = app.SaveNoValidate(record)
}

func monitoredServiceStateForOperation(action string) (uint8, bool) {
	switch action {
	case "start_monitored_service", "restart_monitored_service":
		return 1, true
	case "stop_monitored_service":
		return 2, true
	default:
		return 0, false
	}
}

func (h *Hub) updateContainerStateAfterOperation(app core.App, req operationCreateRequest) {
	status, ok := containerStatusForOperation(req.Action)
	if !ok || strings.TrimSpace(req.System) == "" || strings.TrimSpace(req.Target) == "" {
		return
	}
	if isContainerStackOperationAction(req.Action) {
		records, err := h.findStackOperationContainers(app, req.System, req.Target, req.Action)
		if err != nil {
			return
		}
		now := time.Now().UTC().UnixMilli()
		for _, record := range records {
			record.Set("status", status)
			record.Set("updated", now)
			_ = app.SaveNoValidate(record)
		}
		return
	}
	record, err := app.FindFirstRecordByFilter("containers", "system = {:system} && id = {:id}", dbx.Params{
		"system": req.System,
		"id":     req.Target,
	})
	if err != nil {
		return
	}
	record.Set("status", status)
	record.Set("updated", time.Now().UTC().UnixMilli())
	_ = app.SaveNoValidate(record)
}

func containerStatusForOperation(action string) (string, bool) {
	switch action {
	case "start_container", "restart_container", "start_container_stack", "restart_container_stack":
		return "Up just now", true
	case "stop_container", "stop_container_stack":
		return "Exited just now", true
	default:
		return "", false
	}
}

func containerActionForStackAction(action string) string {
	switch action {
	case "start_container_stack":
		return "start_container"
	case "stop_container_stack":
		return "stop_container"
	case "restart_container_stack":
		return "restart_container"
	case "update_container_stack_images":
		return "update_container_image"
	default:
		return ""
	}
}

func (h *Hub) findControllableStackContainers(app core.App, systemID string, stackProject string) ([]*core.Record, error) {
	return h.findStackOperationContainers(app, systemID, stackProject, "")
}

var errProtectedContainerInStack = errors.New("container stack contains protected Pulse related containers")

func (h *Hub) findStackOperationContainers(app core.App, systemID string, stackProject string, action string) ([]*core.Record, error) {
	stackProject = strings.TrimSpace(stackProject)
	if stackProject == "" {
		return nil, fmt.Errorf("container stack project is required")
	}
	records, err := app.FindRecordsByFilter(
		"containers",
		"system = {:system} && stack_project = {:stackProject}",
		"name",
		-1,
		0,
		dbx.Params{"system": systemID, "stackProject": stackProject},
	)
	if err != nil {
		return nil, err
	}
	controllable := make([]*core.Record, 0, len(records))
	for _, record := range records {
		if reason := protectedContainerReason(record.GetString("name"), record.GetString("image"), record.GetString("stack_project")); reason != "" {
			return nil, fmt.Errorf("%w: %s", errProtectedContainerInStack, reason)
		}
		controllable = append(controllable, record)
	}
	return controllable, nil
}

func (h *Hub) runContainerStackOperation(ctx context.Context, app core.App, system *systems.System, req operationCreateRequest) (common.OperationResult, error) {
	containerAction := containerActionForStackAction(req.Action)
	if containerAction == "" {
		return common.OperationResult{Status: "failed", Message: "unsupported container stack operation"}, nil
	}
	containers, err := h.findStackOperationContainers(app, req.System, req.Target, req.Action)
	if err != nil {
		return common.OperationResult{}, err
	}
	if len(containers) == 0 {
		return common.OperationResult{Status: "failed", Message: "container stack has no controllable containers"}, nil
	}
	failures := make([]string, 0)
	succeeded := 0
	for _, containerRecord := range containers {
		var result common.OperationResult
		err := system.RunOperation(ctx, common.OperationRequest{
			Action: containerAction,
			Target: containerRecord.Id,
		}, &result)
		if err != nil {
			failures = append(failures, fmt.Sprintf("%s: %s", containerRecord.GetString("name"), err.Error()))
			continue
		}
		if result.Status != "succeeded" {
			failures = append(failures, fmt.Sprintf("%s: %s", containerRecord.GetString("name"), result.Message))
			continue
		}
		succeeded++
	}
	if len(failures) > 0 {
		return common.OperationResult{
			Status:  "failed",
			Message: fmt.Sprintf("stack %s completed %d/%d containers; failures: %s", req.Target, succeeded, len(containers), strings.Join(failures, "; ")),
		}, nil
	}
	return common.OperationResult{
		Status:  "succeeded",
		Message: fmt.Sprintf("stack %s operation completed for %d containers", req.Target, succeeded),
	}, nil
}

func isProtectedMonitoredService(platform string, name string) bool {
	if strings.ToLower(strings.TrimSpace(platform)) != "windows" {
		return false
	}
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "eventlog",
		"lsm",
		"mpssvc",
		"nlasvc",
		"plugplay",
		"powershellremoting",
		"profsvc",
		"rpcss",
		"samss",
		"schedule",
		"seclogon",
		"securityhealthservice",
		"shellhwdetection",
		"themes",
		"trustedinstaller",
		"vaultsvc",
		"w32time",
		"wdiservicehost",
		"windefend",
		"winmgmt",
		"wlansvc",
		"wscsvc",
		"wuauserv":
		return true
	default:
		return false
	}
}

func isProtectedContainer(name string, image string) bool {
	return protectedContainerReason(name, image, "") != ""
}

func protectedContainerReason(name string, image string, stackProject string) string {
	name = strings.ToLower(strings.TrimSpace(name))
	image = strings.ToLower(strings.TrimSpace(image))
	if containsPulseRuntimeContainer(name, image, "pulse-hub") ||
		containsPulseRuntimeContainer(name, image, "pulse-agent") {
		return "Pulse related containers cannot be controlled from Pulse."
	}
	return ""
}

func containsPulseRuntimeContainer(name string, image string, identifiers ...string) bool {
	for _, identifier := range identifiers {
		identifier = strings.ToLower(strings.TrimSpace(identifier))
		if identifier == "" {
			continue
		}
		if name == identifier || strings.Contains(name, identifier) ||
			strings.Contains(image, "/"+identifier) || strings.Contains(image, "/"+identifier+":") ||
			strings.Contains(image, "/"+identifier+"@") || strings.HasSuffix(image, identifier) ||
			strings.HasSuffix(image, identifier+":latest") {
			return true
		}
	}
	return false
}
