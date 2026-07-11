package hub

import (
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

func (h *Hub) requirePulseModule(moduleID string) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return e.UnauthorizedError("The request requires valid record authorization token.", nil)
		}
		enabled, blockedBy, err := h.pulseModuleEnabledForUser(e.Auth.Id, moduleID)
		if err != nil {
			return e.InternalServerError("Failed to load module state.", err)
		}
		if enabled {
			return e.Next()
		}

		policy := pulseModulePolicies[moduleID]
		return e.JSON(http.StatusServiceUnavailable, map[string]any{
			"code":       "module_disabled",
			"module_id":  moduleID,
			"module":     policy.Name,
			"blocked_by": blockedBy,
			"message":    policy.Name + "已关闭，当前接口暂不可用。",
		})
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
