package hub

import (
	"errors"
	"net/http"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type pulseModulePolicy struct {
	Name         string
	Default      bool
	Required     bool
	Dependencies []string
}

var pulseModulePolicies = map[string]pulseModulePolicy{
	"foundation":         {Name: "基础底座", Default: true, Required: true},
	"asset-center":       {Name: "资产中心", Default: true, Required: true, Dependencies: []string{"foundation"}},
	"smarthome":          {Name: "智能家居", Default: true, Dependencies: []string{"asset-center"}},
	"client-monitoring":  {Name: "客户端监控", Default: true, Dependencies: []string{"asset-center", "agent-management"}},
	"website-monitoring": {Name: "网站监控", Default: true, Dependencies: []string{"asset-center"}},
	"network-topology":   {Name: "网络拓扑", Default: true, Dependencies: []string{"asset-center"}},
	"alerts":             {Name: "告警中心", Default: true, Dependencies: []string{"asset-center"}},
	"notifications":      {Name: "通知模块", Default: true, Dependencies: []string{"alerts"}},
	"agent-management":   {Name: "Agent 管理", Default: true},
	"account-access":     {Name: "账号管理与权限", Default: true, Required: true},
	"maintenance":        {Name: "备份日志与审计", Default: true},
}

var pulseCollectionModulePolicies = map[string]string{
	"systems":                     "client-monitoring",
	"system_details":              "client-monitoring",
	"system_stats":                "client-monitoring",
	"containers":                  "client-monitoring",
	"container_stats":             "client-monitoring",
	"smart_devices":               "client-monitoring",
	"monitored_services":          "client-monitoring",
	"monitored_software":          "client-monitoring",
	"service_control_rules":       "client-monitoring",
	"container_monitor_rules":     "client-monitoring",
	"software_monitor_rules":      "client-monitoring",
	"website_monitors":            "website-monitoring",
	"website_monitor_checks":      "website-monitoring",
	"alerts":                      "alerts",
	"alerts_history":              "alerts",
	"alert_policies":              "alerts",
	"notification_failures":       "notifications",
	"notification_channel_health": "notifications",
	"alert_notification_states":   "notifications",
	"agent_pairing_codes":         "agent-management",
	"fingerprints":                "agent-management",
	"universal_tokens":            "agent-management",
	"network_layouts":             "network-topology",
	"operation_audit":             "maintenance",
}

func (h *Hub) bindModuleCollectionGates() {
	for collection, moduleID := range pulseCollectionModulePolicies {
		h.App.OnRecordsListRequest(collection).BindFunc(h.moduleRecordsListGate(moduleID))
		h.App.OnRecordViewRequest(collection).BindFunc(h.moduleRecordGate(moduleID))
		h.App.OnRecordCreateRequest(collection).BindFunc(h.moduleRecordGate(moduleID))
		h.App.OnRecordUpdateRequest(collection).BindFunc(h.moduleRecordGate(moduleID))
		h.App.OnRecordDeleteRequest(collection).BindFunc(h.moduleRecordGate(moduleID))
	}
	h.App.OnRealtimeSubscribeRequest().BindFunc(h.moduleRealtimeGate)
}

// RealtimeSubscriptionModule returns the Pulse module that owns a realtime topic.
// It is exported so the topic-to-module contract can be tested without starting a server.
func RealtimeSubscriptionModule(subscription string) (string, bool) {
	topic := strings.TrimSpace(subscription)
	if index := strings.IndexByte(topic, '?'); index >= 0 {
		topic = topic[:index]
	}
	if topic == "rt_metrics" {
		return "client-monitoring", true
	}
	collection := topic
	if index := strings.IndexByte(collection, '/'); index >= 0 {
		collection = collection[:index]
	}
	moduleID, ok := pulseCollectionModulePolicies[collection]
	return moduleID, ok
}

func (h *Hub) moduleRealtimeGate(e *core.RealtimeSubscribeRequestEvent) error {
	for _, subscription := range e.Subscriptions {
		moduleID, ok := RealtimeSubscriptionModule(subscription)
		if !ok {
			continue
		}
		allowed, err := h.ensurePulseModuleEnabled(e.RequestEvent, moduleID)
		if err != nil {
			return err
		}
		if !allowed {
			return nil
		}
	}
	return e.Next()
}

func (h *Hub) moduleRecordsListGate(moduleID string) func(*core.RecordsListRequestEvent) error {
	return func(e *core.RecordsListRequestEvent) error {
		allowed, err := h.ensurePulseModuleEnabled(e.RequestEvent, moduleID)
		if err != nil {
			return err
		}
		if !allowed {
			return nil
		}
		return e.Next()
	}
}

func (h *Hub) moduleRecordGate(moduleID string) func(*core.RecordRequestEvent) error {
	return func(e *core.RecordRequestEvent) error {
		allowed, err := h.ensurePulseModuleEnabled(e.RequestEvent, moduleID)
		if err != nil {
			return err
		}
		if !allowed {
			return nil
		}
		return e.Next()
	}
}

func (h *Hub) ensurePulseModuleEnabled(e *core.RequestEvent, moduleID string) (bool, error) {
	if e == nil {
		return false, errors.New("missing request event")
	}
	if e.Auth == nil {
		return true, nil
	}
	return h.ensurePulseModuleEnabledForUser(e, moduleID, e.Auth.Id)
}

func (h *Hub) ensurePulseModuleEnabledForUser(e *core.RequestEvent, moduleID string, userID string) (bool, error) {
	enabled, blockedBy, err := h.pulseModuleEnabledForUser(userID, moduleID)
	if err != nil {
		return false, e.InternalServerError("Failed to load module state.", err)
	}
	if enabled {
		return true, nil
	}
	policy := pulseModulePolicies[moduleID]
	if err := e.JSON(http.StatusServiceUnavailable, map[string]any{
		"code":       "module_disabled",
		"module_id":  moduleID,
		"module":     policy.Name,
		"blocked_by": blockedBy,
		"message":    policy.Name + "已关闭，当前接口暂不可用。",
	}); err != nil {
		return false, err
	}
	return false, nil
}

func (h *Hub) requirePulseModule(moduleID string) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		allowed, err := h.ensurePulseModuleEnabled(e, moduleID)
		if err != nil {
			return err
		}
		if !allowed {
			return nil
		}
		return e.Next()
	}
}

func (h *Hub) pulseModuleEnabledForUser(userID string, moduleID string) (bool, []string, error) {
	moduleID = strings.TrimSpace(moduleID)
	policy, ok := pulseModulePolicies[moduleID]
	if !ok || policy.Required {
		return true, nil, nil
	}

	records, err := h.FindRecordsByFilter(
		"module_settings",
		"user = {:user}",
		"module_id",
		-1,
		0,
		dbx.Params{"user": userID},
	)
	if err != nil {
		return false, nil, err
	}

	enabled := make(map[string]bool, len(pulseModulePolicies))
	for id, item := range pulseModulePolicies {
		enabled[id] = item.Default || item.Required
	}
	for _, record := range records {
		if _, exists := enabled[record.GetString("module_id")]; exists {
			enabled[record.GetString("module_id")] = record.GetBool("enabled")
		}
	}

	visiting := map[string]bool{}
	var resolve func(string) (bool, []string)
	resolve = func(id string) (bool, []string) {
		item := pulseModulePolicies[id]
		if item.Required {
			return true, nil
		}
		if !enabled[id] {
			return false, nil
		}
		if visiting[id] {
			return false, []string{id}
		}
		visiting[id] = true
		defer delete(visiting, id)
		for _, dependency := range item.Dependencies {
			dependencyEnabled, dependencyBlockedBy := resolve(dependency)
			if !dependencyEnabled {
				if len(dependencyBlockedBy) > 0 {
					return false, dependencyBlockedBy
				}
				return false, []string{dependency}
			}
		}
		return true, nil
	}

	enabledForModule, blockedBy := resolve(moduleID)
	return enabledForModule, blockedBy, nil
}
