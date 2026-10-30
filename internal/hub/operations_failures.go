package hub

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"gutenacht.site/pulse/internal/common"
	"gutenacht.site/pulse/internal/hub/transport"
)

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
