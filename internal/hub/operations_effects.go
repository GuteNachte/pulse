package hub

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"gutenacht.site/pulse/internal/common"
	"gutenacht.site/pulse/internal/hub/systems"
)

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
