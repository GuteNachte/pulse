package hub

import (
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

type assetMonitorListItem struct {
	Asset    map[string]any `json:"asset"`
	Binding  map[string]any `json:"binding,omitempty"`
	Provider string         `json:"provider"`
	State    string         `json:"state"`
	Summary  map[string]any `json:"summary,omitempty"`
}

type assetMonitorCounts struct {
	Total       int `json:"total"`
	Monitorable int `json:"monitorable"`
	Unbound     int `json:"unbound"`
	Pending     int `json:"pending"`
	Healthy     int `json:"healthy"`
	Error       int `json:"error"`
	Paused      int `json:"paused"`
	Unsupported int `json:"unsupported"`
}

// 2026-10-21 资产监控列表：assets 为主表，binding 为统一接入状态，
// systems / website_monitors 提供真实 provider 摘要。
func (h *Hub) listAssetMonitorAssets(e *core.RequestEvent) error {
	assets, err := h.FindRecordsByFilter("assets", "", "name", -1, 0, nil)
	if err != nil {
		return e.InternalServerError("读取资产失败", err)
	}
	bindings, err := h.FindRecordsByFilter("asset_monitor_bindings", "", "created", -1, 0, nil)
	if err != nil && !isNotFoundError(err) {
		return e.InternalServerError("读取资产监控失败", err)
	}
	systems, _ := h.FindRecordsByFilter("systems", "asset != ''", "", -1, 0, nil)
	monitors, _ := h.FindRecordsByFilter("website_monitors", "asset != ''", "", -1, 0, nil)
	bindingByAsset := make(map[string]*core.Record, len(bindings))
	for _, binding := range bindings {
		bindingByAsset[binding.GetString("asset")] = binding
	}
	systemsByID := make(map[string]*core.Record, len(systems))
	for _, system := range systems {
		systemsByID[system.Id] = system
	}
	monitorsByID := make(map[string]*core.Record, len(monitors))
	for _, monitor := range monitors {
		monitorsByID[monitor.Id] = monitor
	}
	query := e.Request.URL.Query()
	stateFilter := strings.TrimSpace(query.Get("state"))
	providerFilter := strings.TrimSpace(query.Get("provider"))
	search := strings.ToLower(strings.TrimSpace(query.Get("search")))
	counts := assetMonitorCounts{}
	items := make([]assetMonitorListItem, 0, len(assets))
	for _, asset := range assets {
		assetType := strings.TrimSpace(asset.GetString("type"))
		inferredProvider := ""
		if isAssetMonitorAgentType(assetType) {
			inferredProvider = assetMonitorProviderAgent
		} else if assetType == "web_endpoint" {
			inferredProvider = assetMonitorProviderWebsite
		}
		binding := bindingByAsset[asset.Id]
		provider := inferredProvider
		state := "unbound"
		if binding != nil {
			provider = strings.TrimSpace(binding.GetString("provider"))
			state = strings.TrimSpace(binding.GetString("state"))
			if state == "" {
				state = assetMonitorStatePending
			}
		} else if inferredProvider == "" {
			state = "unsupported"
		}
		counts.Total++
		if inferredProvider != "" {
			counts.Monitorable++
		}
		switch state {
		case "unbound":
			counts.Unbound++
		case assetMonitorStatePending:
			counts.Pending++
		case assetMonitorStateHealthy:
			counts.Healthy++
		case assetMonitorStateError:
			counts.Error++
		case assetMonitorStatePaused:
			counts.Paused++
		case "unsupported":
			counts.Unsupported++
		}
		item := assetMonitorListItem{
			Asset: map[string]any{
				"id":            asset.Id,
				"name":          asset.GetString("name"),
				"type":          assetType,
				"status":        asset.GetString("status"),
				"model":         asset.GetString("model"),
				"location":      asset.GetString("location"),
				"management_ip": asset.GetString("management_ip"),
				"role":          asset.GetString("role"),
			},
			Provider: provider,
			State:    state,
			Summary:  map[string]any{},
		}
		if binding != nil {
			item.Binding = map[string]any{
				"id":           binding.Id,
				"provider":     provider,
				"target_id":    binding.GetString("target_id"),
				"state":        state,
				"last_checked": binding.GetString("last_checked"),
				"last_error":   binding.GetString("last_error"),
			}
		}
		if provider == assetMonitorProviderAgent && binding != nil {
			if system := systemsByID[binding.GetString("target_id")]; system != nil {
				item.Summary = map[string]any{
					"display_name":  system.GetString("display_name"),
					"name":          system.GetString("name"),
					"status":        system.GetString("status"),
					"agent_profile": system.GetString("agent_profile"),
					"pairing":       system.GetBool("pairing_confirmed"),
					"last_seen":     system.GetString("updated"),
				}
				// 2026-10-21 左侧列表实时预览：info 里的占用率与网速由 Agent 心跳写入。
				var liveInfo struct {
					Cpu          float64 `json:"cpu"`
					Mem          float64 `json:"mp"`
					Disk         float64 `json:"dp"`
					Gpu          float64 `json:"g"`
					GpuSupported bool    `json:"gs"`
					Bandwidth    [2]any  `json:"bbd"`
				}
				if err := system.UnmarshalJSONField("info", &liveInfo); err == nil {
					item.Summary["cpu"] = liveInfo.Cpu
					item.Summary["mem"] = liveInfo.Mem
					item.Summary["disk"] = liveInfo.Disk
					item.Summary["gpu"] = liveInfo.Gpu
					item.Summary["gpu_supported"] = liveInfo.GpuSupported
					// bbd: [上传 bytes/s, 下载 bytes/s]，cbor/json 解出来可能是整数或浮点。
					for index, key := range []string{"upload", "download"} {
						switch value := liveInfo.Bandwidth[index].(type) {
						case float64:
							item.Summary[key] = value
						case int64:
							item.Summary[key] = float64(value)
						case int:
							item.Summary[key] = float64(value)
						case uint64:
							item.Summary[key] = float64(value)
						}
					}
				}
			}
		}
		if provider == assetMonitorProviderWebsite && binding != nil {
			if monitor := monitorsByID[binding.GetString("target_id")]; monitor != nil {
				item.Summary = map[string]any{
					"name":            monitor.GetString("name"),
					"system":          monitor.GetString("system"),
					"last_status":     monitor.GetString("last_status"),
					"enabled":         monitor.GetBool("enabled"),
					"last_checked":    monitor.GetString("last_checked"),
					"last_latency_ms": monitor.GetInt("last_latency_ms"),
					"uptime_24h":      monitor.GetFloat("uptime_24h"),
				}
			}
		}
		if stateFilter != "" && state != stateFilter {
			continue
		}
		if providerFilter != "" && provider != providerFilter {
			continue
		}
		if search != "" {
			haystack := strings.ToLower(strings.Join([]string{
				asset.GetString("name"),
				asset.GetString("model"),
				asset.GetString("management_ip"),
				asset.GetString("location"),
			}, " "))
			if !strings.Contains(haystack, search) {
				continue
			}
		}
		items = append(items, item)
	}
	return e.JSON(200, map[string]any{"items": items, "counts": counts})
}

func (h *Hub) deleteAssetMonitorBinding(e *core.RequestEvent) error {
	bindingID := strings.TrimSpace(e.Request.PathValue("id"))
	if bindingID == "" {
		return e.BadRequestError("缺少监控接入记录。", nil)
	}
	if err := h.deleteAssetMonitorBindingByID(bindingID); err != nil {
		h.createOperationAudit(e, "", "delete_asset_monitor", bindingID, "", "failed", err.Error(), operationFailureFailed)
		return e.BadRequestError("删除监控目标失败，请稍后重试。", err)
	}
	h.createOperationAudit(e, "", "delete_asset_monitor", bindingID, "", "success", "监控目标及历史数据已删除")
	return e.JSON(200, map[string]string{"id": bindingID, "status": "deleted"})
}
