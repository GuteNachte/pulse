package hub

import (
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const (
	assetMonitorProviderAgent   = "agent"
	assetMonitorProviderWebsite = "website"

	assetMonitorStatePending = "pending"
	assetMonitorStateHealthy = "healthy"
	assetMonitorStateError   = "error"
	assetMonitorStatePaused  = "paused"
)

var assetMonitorAgentAssetTypes = []string{"physical_host", "nas", "server", "mini_pc"}

// 2026-10-21 资产接入监控统一注册表：provider 记录仍是配置和监控数据源，
// binding 负责唯一性、统一状态和删除边界。
func (h *Hub) bindAssetMonitorHooks() {
	for _, collection := range []string{"systems", "website_monitors"} {
		h.App.OnRecordAfterCreateSuccess(collection).BindFunc(func(e *core.RecordEvent) error {
			h.syncAssetMonitorBindingForTarget(e.Record)
			return e.Next()
		})
		h.App.OnRecordAfterUpdateSuccess(collection).BindFunc(func(e *core.RecordEvent) error {
			h.syncAssetMonitorBindingForTarget(e.Record)
			return e.Next()
		})
		h.App.OnRecordAfterDeleteSuccess(collection).BindFunc(func(e *core.RecordEvent) error {
			if e.Record != nil {
				h.deleteAssetMonitorBindingByTarget(e.Record)
			}
			return e.Next()
		})
	}
	h.App.OnRecordDeleteRequest("assets").BindFunc(h.validateAssetMonitorDeleteRequest)
	h.App.OnRecordUpdateRequest("assets").BindFunc(h.validateAssetMonitorAssetTypeChange)
}

func (h *Hub) validateAssetMonitorBindingUniqueness(assetID, provider, targetID string) error {
	if strings.TrimSpace(assetID) == "" {
		return nil
	}
	binding, err := h.FindFirstRecordByFilter(
		"asset_monitor_bindings",
		"asset = {:asset}",
		dbx.Params{"asset": assetID},
	)
	if err == nil {
		existingTarget := strings.TrimSpace(binding.GetString("target_id"))
		if existingTarget != strings.TrimSpace(targetID) {
			return errors.New("该资产已有监控接入，请打开现有记录")
		}
	} else if !isNotFoundError(err) {
		return err
	}
	switch provider {
	case assetMonitorProviderAgent:
		other, findErr := h.FindFirstRecordByFilter("systems", "asset = {:asset}", dbx.Params{"asset": assetID})
		if findErr == nil && other.Id != strings.TrimSpace(targetID) {
			return errors.New("该资产已有客户端监控接入，请打开现有记录")
		}
	case assetMonitorProviderWebsite:
		other, findErr := h.FindFirstRecordByFilter("website_monitors", "asset = {:asset}", dbx.Params{"asset": assetID})
		if findErr == nil && other.Id != strings.TrimSpace(targetID) {
			return errors.New("该资产已有网站监控接入，请打开现有记录")
		}
	}
	return nil
}

func (h *Hub) validateAssetMonitorDeleteRequest(e *core.RecordRequestEvent) error {
	if e == nil || e.Record == nil {
		return e.Next()
	}
	assetID := strings.TrimSpace(e.Record.Id)
	if assetID == "" {
		return e.Next()
	}
	if _, err := h.FindFirstRecordByFilter(
		"asset_monitor_bindings",
		"asset = {:asset}",
		dbx.Params{"asset": assetID},
	); err == nil {
		return e.BadRequestError("该资产已接入监控，请先在资产监控中删除监控目标", nil)
	}
	if _, err := h.FindFirstRecordByFilter("systems", "asset = {:asset}", dbx.Params{"asset": assetID}); err == nil {
		return e.BadRequestError("该资产仍有客户端监控记录，请先删除监控目标", nil)
	}
	if _, err := h.FindFirstRecordByFilter("website_monitors", "asset = {:asset}", dbx.Params{"asset": assetID}); err == nil {
		return e.BadRequestError("该资产仍有网站监控记录，请先删除监控目标", nil)
	}
	return e.Next()
}

func (h *Hub) validateAssetMonitorAssetTypeChange(e *core.RecordRequestEvent) error {
	if e == nil || e.Record == nil {
		return e.Next()
	}
	original := e.Record.Original()
	if original == nil {
		return e.Next()
	}
	oldType := strings.TrimSpace(original.GetString("type"))
	newType := strings.TrimSpace(e.Record.GetString("type"))
	if oldType == "" || newType == "" || oldType == newType {
		return e.Next()
	}
	if _, err := h.FindFirstRecordByFilter(
		"asset_monitor_bindings",
		"asset = {:asset}",
		dbx.Params{"asset": e.Record.Id},
	); err == nil {
		return e.BadRequestError("资产已接入监控，不能修改资产类型；请先删除监控目标。", nil)
	}
	return e.Next()
}

func (h *Hub) syncAssetMonitorBindingForTarget(record *core.Record) {
	if record == nil {
		return
	}
	var provider string
	switch record.Collection().Name {
	case "systems":
		provider = assetMonitorProviderAgent
	case "website_monitors":
		provider = assetMonitorProviderWebsite
	default:
		return
	}
	if err := h.syncAssetMonitorBinding(provider, record.Id); err != nil {
		h.Logger().Warn("sync asset monitor binding failed", "provider", provider, "target", record.Id, "err", err)
	}
}

func (h *Hub) syncAssetMonitorBinding(provider string, targetID string) error {
	if strings.TrimSpace(targetID) == "" {
		return nil
	}
	var target *core.Record
	var err error
	switch provider {
	case assetMonitorProviderAgent:
		target, err = h.FindRecordById("systems", targetID)
	case assetMonitorProviderWebsite:
		target, err = h.FindRecordById("website_monitors", targetID)
	default:
		return nil
	}
	if err != nil {
		if isNotFoundError(err) {
			return h.deleteAssetMonitorBindingByProviderTarget(provider, targetID)
		}
		return err
	}
	assetID := strings.TrimSpace(target.GetString("asset"))
	if assetID == "" {
		return h.deleteAssetMonitorBindingByProviderTarget(provider, targetID)
	}
	asset, err := h.FindRecordById("assets", assetID)
	if err != nil {
		return err
	}
	if provider == assetMonitorProviderAgent && !isAssetMonitorAgentType(asset.GetString("type")) {
		return nil
	}
	if provider == assetMonitorProviderWebsite && asset.GetString("type") != "web_endpoint" {
		return nil
	}
	state, lastChecked, lastError := assetMonitorStateForProvider(provider, target)
	return h.upsertAssetMonitorBinding(asset, provider, targetID, state, lastChecked, lastError)
}

func (h *Hub) upsertAssetMonitorBinding(
	asset *core.Record,
	provider string,
	targetID string,
	state string,
	lastChecked string,
	lastError string,
) error {
	if asset == nil {
		return nil
	}
	existing, err := h.FindFirstRecordByFilter(
		"asset_monitor_bindings",
		"asset = {:asset}",
		dbx.Params{"asset": asset.Id},
	)
	if err != nil && !isNotFoundError(err) {
		return err
	}
	record := existing
	if record == nil {
		collection, err := h.FindCollectionByNameOrId("asset_monitor_bindings")
		if err != nil {
			return err
		}
		record = core.NewRecord(collection)
		record.Set("user", asset.GetString("user"))
		record.Set("asset", asset.Id)
	} else if strings.TrimSpace(record.GetString("provider")) != provider || strings.TrimSpace(record.GetString("target_id")) != targetID {
		return errors.New("该资产已有其他监控接入记录")
	}
	record.Set("provider", provider)
	record.Set("target_id", targetID)
	record.Set("state", state)
	record.Set("last_checked", lastChecked)
	record.Set("last_error", truncateText(lastError, 500))
	metadata := map[string]any{"provider": provider}
	if provider == assetMonitorProviderAgent {
		metadata["display_name"] = targetDisplayName(h, targetID)
		metadata["status"] = ""
	} else {
		metadata["last_status"] = ""
	}
	record.Set("metadata", metadata)
	return h.Save(record)
}

func (h *Hub) deleteAssetMonitorBindingByTarget(target *core.Record) {
	if target == nil {
		return
	}
	provider := ""
	switch target.Collection().Name {
	case "systems":
		provider = assetMonitorProviderAgent
	case "website_monitors":
		provider = assetMonitorProviderWebsite
	}
	if provider == "" {
		return
	}
	if err := h.deleteAssetMonitorBindingByProviderTarget(provider, target.Id); err != nil {
		h.Logger().Warn("delete asset monitor binding failed", "provider", provider, "target", target.Id, "err", err)
	}
}

func (h *Hub) deleteAssetMonitorBindingByProviderTarget(provider string, targetID string) error {
	record, err := h.FindFirstRecordByFilter(
		"asset_monitor_bindings",
		"provider = {:provider} && target_id = {:target}",
		dbx.Params{"provider": provider, "target": targetID},
	)
	if err != nil {
		if isNotFoundError(err) {
			return nil
		}
		return err
	}
	return h.Delete(record)
}

func (h *Hub) deleteAssetMonitorBindingByID(bindingID string) error {
	record, err := h.FindRecordById("asset_monitor_bindings", bindingID)
	if err != nil {
		return err
	}
	provider := strings.TrimSpace(record.GetString("provider"))
	targetID := strings.TrimSpace(record.GetString("target_id"))
	if targetID != "" {
		switch provider {
		case assetMonitorProviderAgent:
			if err := h.deleteAgentMonitorTarget(targetID); err != nil {
				return err
			}
		case assetMonitorProviderWebsite:
			if err := h.deleteWebsiteMonitorTarget(targetID); err != nil {
				return err
			}
		}
	}
	if _, err := h.FindRecordById("asset_monitor_bindings", bindingID); err != nil {
		return nil
	}
	return h.Delete(record)
}

func (h *Hub) deleteAgentMonitorTarget(systemID string) error {
	if err := ensureSystemCanBeDeleted(h.App, systemID); err != nil {
		return err
	}
	if err := deleteSystemRelatedData(h.App, systemID); err != nil {
		return err
	}
	if record, err := h.FindRecordById("systems", systemID); err == nil {
		if err := h.Delete(record); err != nil {
			return err
		}
	} else if !isNotFoundError(err) {
		return err
	}
	_ = h.sm.RemoveSystem(systemID)
	return nil
}

func (h *Hub) deleteWebsiteMonitorTarget(monitorID string) error {
	record, err := h.FindRecordById("website_monitors", monitorID)
	if err != nil {
		if isNotFoundError(err) {
			return nil
		}
		return err
	}
	assetID := strings.TrimSpace(record.GetString("asset"))
	if assetID != "" {
		relations, err := h.FindRecordsByFilter(
			"asset_relations",
			"kind = {:kind} && source_asset = {:asset} && target_asset != ''",
			"",
			-1,
			0,
			dbx.Params{"kind": "hosted_on", "asset": assetID},
		)
		if err == nil {
			for _, relation := range relations {
				metadata := relation.GetString("metadata")
				if strings.Contains(metadata, monitorID) {
					_ = h.Delete(relation)
				}
			}
		}
	}
	return h.Delete(record)
}

func (h *Hub) reconcileAssetMonitorBindings() error {
	systems, err := h.FindRecordsByFilter("systems", "asset != ''", "", -1, 0, nil)
	if err != nil && !isNotFoundError(err) {
		return err
	}
	for _, system := range systems {
		if err := h.syncAssetMonitorBinding(assetMonitorProviderAgent, system.Id); err != nil {
			h.Logger().Warn("reconcile agent binding failed", "system", system.Id, "err", err)
		}
	}
	monitors, err := h.FindRecordsByFilter("website_monitors", "asset != ''", "", -1, 0, nil)
	if err != nil && !isNotFoundError(err) {
		return err
	}
	for _, monitor := range monitors {
		if err := h.syncAssetMonitorBinding(assetMonitorProviderWebsite, monitor.Id); err != nil {
			h.Logger().Warn("reconcile website binding failed", "monitor", monitor.Id, "err", err)
		}
	}
	bindings, err := h.FindRecordsByFilter("asset_monitor_bindings", "", "", -1, 0, nil)
	if err != nil && !isNotFoundError(err) {
		return err
	}
	for _, binding := range bindings {
		provider := strings.TrimSpace(binding.GetString("provider"))
		targetID := strings.TrimSpace(binding.GetString("target_id"))
		if provider == "" || targetID == "" {
			_ = h.Delete(binding)
			continue
		}
		if err := h.syncAssetMonitorBinding(provider, targetID); err != nil {
			if isNotFoundError(err) {
				_ = h.Delete(binding)
			}
		}
	}
	return nil
}

func assetMonitorStateForProvider(provider string, record *core.Record) (string, string, string) {
	if record == nil {
		return assetMonitorStatePending, "", ""
	}
	switch provider {
	case assetMonitorProviderAgent:
		status := strings.TrimSpace(record.GetString("status"))
		lastChecked := strings.TrimSpace(record.GetString("updated"))
		switch status {
		case assetMonitorStatePaused:
			return assetMonitorStatePaused, lastChecked, ""
		case "up":
			if record.GetBool("pairing_confirmed") || record.GetBool("is_local") {
				return assetMonitorStateHealthy, lastChecked, ""
			}
			return assetMonitorStatePending, lastChecked, "等待确认 Agent 接入"
		case "down":
			return assetMonitorStateError, lastChecked, "Agent 离线"
		default:
			return assetMonitorStatePending, lastChecked, "等待 Agent 接入"
		}
	case assetMonitorProviderWebsite:
		lastChecked := strings.TrimSpace(record.GetString("last_checked"))
		lastError := strings.TrimSpace(record.GetString("last_error"))
		if !record.GetBool("enabled") {
			return assetMonitorStatePaused, lastChecked, lastError
		}
		switch strings.TrimSpace(record.GetString("last_status")) {
		case "up":
			if websiteMonitorBindingStale(record) {
				if lastError == "" {
					lastError = "检测结果已过期"
				}
				return assetMonitorStateError, lastChecked, lastError
			}
			return assetMonitorStateHealthy, lastChecked, ""
		case "down":
			if lastError == "" {
				lastError = "网站检测异常"
			}
			return assetMonitorStateError, lastChecked, lastError
		default:
			return assetMonitorStatePending, lastChecked, lastError
		}
	}
	return assetMonitorStatePending, "", ""
}

func websiteMonitorBindingStale(record *core.Record) bool {
	lastChecked := record.GetDateTime("last_checked")
	if lastChecked.IsZero() {
		return true
	}
	interval := record.GetInt("interval_seconds")
	if interval < 60 {
		interval = 300
	}
	staleAfter := time.Duration(interval)*time.Second*2 + time.Minute
	return time.Since(lastChecked.Time()) > staleAfter
}

func isAssetMonitorAgentType(assetType string) bool {
	for _, candidate := range assetMonitorAgentAssetTypes {
		if candidate == assetType {
			return true
		}
	}
	return false
}

func isNotFoundError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, sql.ErrNoRows) {
		return true
	}
	return strings.Contains(strings.ToLower(err.Error()), "no rows")
}

func targetDisplayName(h *Hub, targetID string) string {
	record, err := h.FindRecordById("systems", targetID)
	if err != nil {
		return ""
	}
	if value := strings.TrimSpace(record.GetString("display_name")); value != "" {
		return value
	}
	return strings.TrimSpace(record.GetString("name"))
}

func truncateText(value string, max int) string {
	value = strings.TrimSpace(value)
	if max <= 0 || len([]rune(value)) <= max {
		return value
	}
	runes := []rune(value)
	return string(runes[:max])
}
