package hub

import (
	"fmt"
	"slices"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

var agentConnectableAssetTypes = []string{"physical_host", "nas", "server", "mini_pc"}

func (h *Hub) bindAssetBindingValidationHooks() {
	h.App.OnRecordCreateRequest("systems").BindFunc(func(e *core.RecordRequestEvent) error {
		if err := h.validateSystemAssetBindingRequest(e, true); err != nil {
			return err
		}
		return e.Next()
	})
	h.App.OnRecordUpdateRequest("systems").BindFunc(func(e *core.RecordRequestEvent) error {
		if err := h.validateSystemAssetBindingRequest(e, false); err != nil {
			return err
		}
		return e.Next()
	})
	h.App.OnRecordCreateRequest("website_monitors").BindFunc(func(e *core.RecordRequestEvent) error {
		if err := h.validateWebsiteMonitorAssetBindingRequest(e, true); err != nil {
			return err
		}
		return e.Next()
	})
	h.App.OnRecordUpdateRequest("website_monitors").BindFunc(func(e *core.RecordRequestEvent) error {
		if err := h.validateWebsiteMonitorAssetBindingRequest(e, false); err != nil {
			return err
		}
		return e.Next()
	})
}

func (h *Hub) validateSystemAssetBindingRequest(e *core.RecordRequestEvent, requireAsset bool) error {
	if e == nil || e.Record == nil {
		return nil
	}
	assetID := strings.TrimSpace(e.Record.GetString("asset"))
	if assetID == "" {
		if requireAsset || requestClearsAsset(e) {
			return e.BadRequestError("客户端监控必须先绑定资产中心里的主机类资产。", nil)
		}
		return nil
	}
	assetRecord, err := h.FindRecordById("assets", assetID)
	if err != nil {
		return e.BadRequestError("关联资产不存在。", err)
	}
	assetType := strings.TrimSpace(assetRecord.GetString("type"))
	if !slices.Contains(agentConnectableAssetTypes, assetType) {
		return e.BadRequestError("客户端监控只能绑定物理主机、NAS、服务器或迷你主机资产。", nil)
	}
	if !slices.Contains(e.Record.GetStringSlice("users"), assetRecord.GetString("user")) {
		return e.BadRequestError("关联资产不属于当前机器用户。", nil)
	}
	return nil
}

func (h *Hub) validateAgentPairingAsset(assetID string, userID string) error {
	assetID = strings.TrimSpace(assetID)
	userID = strings.TrimSpace(userID)
	if assetID == "" {
		return fmt.Errorf("客户端监控必须先绑定资产中心里的主机类资产。")
	}
	assetRecord, err := h.FindRecordById("assets", assetID)
	if err != nil {
		return fmt.Errorf("关联资产不存在。")
	}
	assetType := strings.TrimSpace(assetRecord.GetString("type"))
	if !slices.Contains(agentConnectableAssetTypes, assetType) {
		return fmt.Errorf("客户端监控只能绑定物理主机、NAS、服务器或迷你主机资产。")
	}
	if strings.TrimSpace(assetRecord.GetString("user")) != userID {
		return fmt.Errorf("关联资产不属于当前用户。")
	}
	return nil
}

func (h *Hub) validateWebsiteMonitorAssetBindingRequest(e *core.RecordRequestEvent, requireAsset bool) error {
	if e == nil || e.Record == nil {
		return nil
	}
	assetID := strings.TrimSpace(e.Record.GetString("asset"))
	if assetID == "" {
		if requireAsset || requestClearsAsset(e) {
			return e.BadRequestError("互联网服务监控必须先绑定资产中心里的互联网服务监控资产。", nil)
		}
		return nil
	}
	assetRecord, err := h.FindRecordById("assets", assetID)
	if err != nil {
		return e.BadRequestError("关联资产不存在。", err)
	}
	if strings.TrimSpace(assetRecord.GetString("type")) != "web_endpoint" {
		return e.BadRequestError("互联网服务监控只能绑定资产中心里的互联网服务监控资产。", nil)
	}
	if strings.TrimSpace(e.Record.GetString("user")) != strings.TrimSpace(assetRecord.GetString("user")) {
		return e.BadRequestError("关联资产不属于当前用户。", nil)
	}
	return nil
}

func requestClearsAsset(e *core.RecordRequestEvent) bool {
	if e == nil || e.RequestEvent == nil {
		return false
	}
	info, err := e.RequestInfo()
	if err != nil || info == nil {
		return false
	}
	value, ok := info.Body["asset"]
	if !ok {
		return false
	}
	return strings.TrimSpace(fmt.Sprint(value)) == ""
}
