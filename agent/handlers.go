package agent

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/fxamacker/cbor/v2"
	"gutenacht.site/pulse/internal/common"
	"gutenacht.site/pulse/internal/entities/smart"

	"log/slog"
)

// HandlerContext provides context for request handlers
type HandlerContext struct {
	Client      *WebSocketClient
	Agent       *Agent
	Request     *common.HubRequest[cbor.RawMessage]
	RequestID   *uint32
	HubVerified bool
	// SendResponse sends handler responses over the active WebSocket channel.
	SendResponse func(data any, requestID *uint32) error
}

// RequestHandler defines the interface for handling specific websocket request types
type RequestHandler interface {
	// Handle processes the request and returns an error if unsuccessful
	Handle(hctx *HandlerContext) error
}

// Responder sends handler responses back to the hub.
type Responder interface {
	SendResponse(data any, requestID *uint32) error
}

// HandlerRegistry manages the mapping between actions and their handlers
type HandlerRegistry struct {
	handlers map[common.WebSocketAction]RequestHandler
}

// NewHandlerRegistry creates a new handler registry with default handlers
func NewHandlerRegistry() *HandlerRegistry {
	registry := &HandlerRegistry{
		handlers: make(map[common.WebSocketAction]RequestHandler),
	}

	registry.Register(common.GetData, &GetDataHandler{})
	registry.Register(common.CheckFingerprint, &CheckFingerprintHandler{})
	registry.Register(common.GetContainerLogs, &GetContainerLogsHandler{})
	registry.Register(common.GetContainerInfo, &GetContainerInfoHandler{})
	registry.Register(common.GetSmartData, &GetSmartDataHandler{})
	registry.Register(common.RunOperation, &RunOperationHandler{})
	registry.Register(common.SearchServices, &SearchServicesHandler{})
	registry.Register(common.SearchSoftware, &SearchSoftwareHandler{})

	return registry
}

// Register registers a handler for a specific action type
func (hr *HandlerRegistry) Register(action common.WebSocketAction, handler RequestHandler) {
	hr.handlers[action] = handler
}

// Handle routes the request to the appropriate handler
func (hr *HandlerRegistry) Handle(hctx *HandlerContext) error {
	handler, exists := hr.handlers[hctx.Request.Action]
	if !exists {
		return fmt.Errorf("unknown action: %d", hctx.Request.Action)
	}

	// Check verification requirement - default to requiring verification
	if hctx.Request.Action != common.CheckFingerprint && !hctx.HubVerified {
		return errors.New("hub not verified")
	}

	// Log handler execution for debugging
	// slog.Debug("Executing handler", "action", hctx.Request.Action)

	return handler.Handle(hctx)
}

// GetHandler returns the handler for a specific action
func (hr *HandlerRegistry) GetHandler(action common.WebSocketAction) (RequestHandler, bool) {
	handler, exists := hr.handlers[action]
	return handler, exists
}

////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////

// GetDataHandler handles system data requests
type GetDataHandler struct{}

func (h *GetDataHandler) Handle(hctx *HandlerContext) error {
	var options common.DataRequestOptions
	_ = cbor.Unmarshal(hctx.Request.Data, &options)

	sysStats := hctx.Agent.gatherStats(options)
	return hctx.SendResponse(sysStats, hctx.RequestID)
}

////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////

// CheckFingerprintHandler handles authentication challenges
type CheckFingerprintHandler struct{}

func (h *CheckFingerprintHandler) Handle(hctx *HandlerContext) error {
	return hctx.Client.handleAuthChallenge(hctx.Request, hctx.RequestID)
}

////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////

// GetContainerLogsHandler handles container log requests
type GetContainerLogsHandler struct{}

func (h *GetContainerLogsHandler) Handle(hctx *HandlerContext) error {
	if hctx.Agent.dockerManager == nil {
		return hctx.SendResponse("", hctx.RequestID)
	}

	var req common.ContainerLogsRequest
	if err := cbor.Unmarshal(hctx.Request.Data, &req); err != nil {
		return err
	}

	ctx := context.Background()
	logContent, err := hctx.Agent.dockerManager.getLogs(ctx, req.ContainerID)
	if err != nil {
		return err
	}

	return hctx.SendResponse(logContent, hctx.RequestID)
}

////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////

// GetContainerInfoHandler handles container info requests
type GetContainerInfoHandler struct{}

func (h *GetContainerInfoHandler) Handle(hctx *HandlerContext) error {
	if hctx.Agent.dockerManager == nil {
		return hctx.SendResponse("", hctx.RequestID)
	}

	var req common.ContainerInfoRequest
	if err := cbor.Unmarshal(hctx.Request.Data, &req); err != nil {
		return err
	}

	ctx := context.Background()
	info, err := hctx.Agent.dockerManager.getContainerInfo(ctx, req.ContainerID)
	if err != nil {
		return err
	}

	return hctx.SendResponse(string(info), hctx.RequestID)
}

////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////

// GetSmartDataHandler handles SMART data requests
type GetSmartDataHandler struct{}

func (h *GetSmartDataHandler) Handle(hctx *HandlerContext) error {
	if hctx.Agent.smartManager == nil {
		// return empty map to indicate no data
		return hctx.SendResponse(map[string]smart.SmartData{}, hctx.RequestID)
	}
	if err := hctx.Agent.smartManager.Refresh(false); err != nil {
		slog.Debug("smart refresh failed", "err", err)
		return err
	}
	data := hctx.Agent.smartManager.GetCurrentData()
	return hctx.SendResponse(data, hctx.RequestID)
}

// RunOperationHandler handles constrained operation requests from the hub.
type RunOperationHandler struct{}

type SearchServicesHandler struct{}

type SearchSoftwareHandler struct{}

func (h *SearchServicesHandler) Handle(hctx *HandlerContext) error {
	if hctx.Agent.serviceManager == nil {
		return hctx.SendResponse(common.ServiceSearchResult{}, hctx.RequestID)
	}
	var req common.ServiceSearchRequest
	if err := cbor.Unmarshal(hctx.Request.Data, &req); err != nil {
		return err
	}
	return hctx.SendResponse(common.ServiceSearchResult{
		Services: hctx.Agent.serviceManager.searchServices(req.Query, req.Limit),
	}, hctx.RequestID)
}

func (h *SearchSoftwareHandler) Handle(hctx *HandlerContext) error {
	if hctx.Agent.softwareManager == nil {
		return hctx.SendResponse(common.SoftwareSearchResult{}, hctx.RequestID)
	}
	var req common.ServiceSearchRequest
	if err := cbor.Unmarshal(hctx.Request.Data, &req); err != nil {
		return err
	}
	return hctx.SendResponse(common.SoftwareSearchResult{
		Software: hctx.Agent.softwareManager.searchSoftware(req.Query, req.Limit),
	}, hctx.RequestID)
}

////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////

func (h *RunOperationHandler) Handle(hctx *HandlerContext) error {
	var req common.OperationRequest
	if err := cbor.Unmarshal(hctx.Request.Data, &req); err != nil {
		return err
	}

	switch req.Action {
	case "refresh_services":
		refreshed := 0
		if hctx.Agent.serviceManager != nil {
			refreshed += len(hctx.Agent.serviceManager.getServiceStats(nil))
		}
		return hctx.SendResponse(common.OperationResult{
			Status:  "succeeded",
			Message: fmt.Sprintf("refreshed %d services", refreshed),
		}, hctx.RequestID)
	case "start_monitored_service", "stop_monitored_service", "restart_monitored_service":
		if hctx.Agent.serviceManager == nil {
			return hctx.SendResponse(common.OperationResult{
				Status:  "unsupported",
				Message: "service manager is not available on this agent",
			}, hctx.RequestID)
		}
		if req.Target == "" {
			return hctx.SendResponse(common.OperationResult{
				Status:  "failed",
				Message: "service name is required",
			}, hctx.RequestID)
		}
		if err := hctx.Agent.serviceManager.controlService(req.Action, req.Target); err != nil {
			return hctx.SendResponse(common.OperationResult{
				Status:  "failed",
				Message: err.Error(),
			}, hctx.RequestID)
		}
		return hctx.SendResponse(common.OperationResult{
			Status:  "succeeded",
			Message: fmt.Sprintf("service %s operation completed", req.Target),
		}, hctx.RequestID)
	case "start_container", "stop_container", "restart_container", "update_container_image":
		if hctx.Agent.dockerManager == nil {
			return hctx.SendResponse(common.OperationResult{
				Status:  "unsupported",
				Message: "Docker / Podman socket is not available on this agent",
			}, hctx.RequestID)
		}
		if req.Target == "" {
			return hctx.SendResponse(common.OperationResult{
				Status:  "failed",
				Message: "container id is required",
			}, hctx.RequestID)
		}
		timeout := dockerControlTimeout
		if req.Action == "update_container_image" {
			timeout = 5 * time.Minute
		}
		ctx, cancel := context.WithTimeout(context.Background(), timeout)
		defer cancel()
		if err := hctx.Agent.dockerManager.controlContainer(ctx, req.Action, req.Target); err != nil {
			return hctx.SendResponse(common.OperationResult{
				Status:  "failed",
				Message: err.Error(),
			}, hctx.RequestID)
		}
		return hctx.SendResponse(common.OperationResult{
			Status:  "succeeded",
			Message: fmt.Sprintf("container %s operation completed", req.Target),
		}, hctx.RequestID)
	case "update_agent":
		return hctx.SendResponse(hctx.Agent.controlAgentUpdate(req.Params), hctx.RequestID)
	default:
		return hctx.SendResponse(common.OperationResult{
			Status:  "denied",
			Message: "operation is not allowed",
		}, hctx.RequestID)
	}
}
