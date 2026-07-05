package hub

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type assetEnrichmentActionRequest struct {
	Reason string `json:"reason"`
}

type assetEnrichmentSuggestionInput struct {
	TargetCollection string
	TargetRecord     string
	TargetField      string
	TargetLabel      string
	CurrentValue     string
	CollectedValue   string
	OnlineValue      string
	RecommendedValue string
	Source           string
	Confidence       int
	Conflict         bool
	Notes            string
	Metadata         map[string]any
}

func (h *Hub) generateAssetEnrichmentReport(e *core.RequestEvent) error {
	assetID := strings.TrimSpace(e.Request.PathValue("id"))
	if assetID == "" {
		return e.BadRequestError("Missing asset id.", nil)
	}
	asset, err := h.findUserAssetRecord(assetID, e.Auth.Id)
	if err != nil {
		return e.NotFoundError("Asset not found.", err)
	}

	systems, err := h.FindRecordsByFilter(
		"systems",
		"asset = {:asset}",
		"name",
		-1,
		0,
		dbx.Params{"asset": asset.Id},
	)
	if err != nil {
		return e.InternalServerError("Failed to load bound systems.", err)
	}
	systems = filterSystemRecordsForUser(systems, e.Auth.Id)

	interfaces, err := h.FindRecordsByFilter(
		"asset_interfaces",
		"asset = {:asset} && user = {:user}",
		"-primary,kind,name",
		-1,
		0,
		dbx.Params{"asset": asset.Id, "user": e.Auth.Id},
	)
	if err != nil {
		return e.InternalServerError("Failed to load asset interfaces.", err)
	}

	details, err := h.loadSystemDetailRecords(systems)
	if err != nil {
		return e.InternalServerError("Failed to load Agent detail records.", err)
	}

	localSuggestions := h.buildAssetEnrichmentSuggestions(asset, systems, details, interfaces)
	onlineResult := h.collectAssetOnlineEnrichment(asset)
	suggestions := append(localSuggestions, onlineResult.Suggestions...)
	suggestions = dedupeEnrichmentSuggestions(suggestions)
	reportRecord, err := h.createAssetEnrichmentReportRecord(e.Auth.Id, asset, systems, details, suggestions, onlineResult)
	if err != nil {
		return e.InternalServerError("Failed to create enrichment report.", err)
	}
	for _, suggestion := range suggestions {
		if err := h.createAssetEnrichmentSuggestionRecord(e.Auth.Id, asset.Id, reportRecord.Id, suggestion); err != nil {
			return e.InternalServerError("Failed to create enrichment suggestion.", err)
		}
	}
	if err := h.createAssetEnrichmentAITask(e.Auth.Id, asset, reportRecord.Id, onlineResult, suggestions); err != nil {
		return e.InternalServerError("Failed to create enrichment AI task.", err)
	}

	h.createOperationAudit(e, "", "asset_enrichment_report", asset.Id, "", "success", "资产补全报告已生成")
	return e.JSON(http.StatusOK, map[string]any{
		"report":      reportRecord,
		"suggestions": len(suggestions),
	})
}

func (h *Hub) createAssetEnrichmentAITask(userID string, asset *core.Record, reportID string, onlineResult assetOnlineEnrichmentResult, suggestions []assetEnrichmentSuggestionInput) error {
	config := h.assetOnlineAIConfig()
	if !config.Enabled {
		return nil
	}
	collection, err := h.FindCachedCollectionByNameOrId("ai_tasks")
	if err != nil {
		return err
	}
	record := core.NewRecord(collection)
	status := "ready"
	errorMessage := ""
	if onlineResult.AI.Status == "failed" {
		status = "failed"
		errorMessage = onlineResult.AI.Error
	}
	if strings.TrimSpace(config.Endpoint) == "" || strings.TrimSpace(config.APIKey) == "" || strings.TrimSpace(config.Model) == "" {
		status = "failed"
		errorMessage = "AI 识别未配置完整 endpoint/api key/model"
	}
	record.Set("user", userID)
	record.Set("asset", asset.Id)
	record.Set("kind", "asset_enrichment")
	record.Set("status", status)
	record.Set("provider", config.Provider)
	record.Set("model", config.Model)
	record.Set("input_summary", map[string]any{
		"report":         reportID,
		"query":          onlineResult.Query,
		"source_count":   len(onlineResult.Sources),
		"endpoint_host":  safeAssetOnlineEndpointHost(config.Endpoint),
		"manual_trigger": true,
	})
	record.Set("output_summary", map[string]any{
		"ai_status":         firstNonEmpty(onlineResult.AI.Status, status),
		"ai_suggestions":    onlineResult.AI.Suggestions,
		"total_suggestions": len(suggestions),
		"providers":         onlineResult.Providers,
	})
	record.Set("error", errorMessage)
	record.Set("metadata", map[string]any{
		"report":         reportID,
		"source":         "asset_center_enrichment",
		"manual_trigger": true,
	})
	return h.Save(record)
}

func (h *Hub) acceptAssetEnrichmentSuggestion(e *core.RequestEvent) error {
	suggestionID := strings.TrimSpace(e.Request.PathValue("id"))
	if suggestionID == "" {
		return e.BadRequestError("Missing suggestion id.", nil)
	}
	suggestion, err := h.findUserEnrichmentSuggestion(suggestionID, e.Auth.Id)
	if err != nil {
		return e.NotFoundError("Suggestion not found.", err)
	}
	if suggestion.GetString("status") != "pending" {
		return e.BadRequestError("Suggestion is not pending.", nil)
	}
	if err := h.applyAssetEnrichmentSuggestion(e.Auth.Id, suggestion); err != nil {
		if errors.Is(err, errAssetEnrichmentStale) {
			suggestion.Set("status", "stale")
			_ = h.Save(suggestion)
			_ = h.updateAssetEnrichmentReportStatus(suggestion.GetString("report"))
			return e.BadRequestError("资产主档当前值已变化，请重新生成补全报告。", err)
		}
		return e.BadRequestError(err.Error(), err)
	}
	suggestion.Set("status", "accepted")
	if err := h.Save(suggestion); err != nil {
		return e.InternalServerError("Failed to update suggestion status.", err)
	}
	if err := h.updateAssetEnrichmentReportStatus(suggestion.GetString("report")); err != nil {
		return e.InternalServerError("Failed to update report status.", err)
	}
	h.createOperationAudit(e, "", "asset_enrichment_accept", suggestion.GetString("asset"), "", "success", "资产补全建议已写入")
	return e.JSON(http.StatusOK, map[string]string{"status": "accepted"})
}

func (h *Hub) rejectAssetEnrichmentSuggestion(e *core.RequestEvent) error {
	suggestionID := strings.TrimSpace(e.Request.PathValue("id"))
	if suggestionID == "" {
		return e.BadRequestError("Missing suggestion id.", nil)
	}
	suggestion, err := h.findUserEnrichmentSuggestion(suggestionID, e.Auth.Id)
	if err != nil {
		return e.NotFoundError("Suggestion not found.", err)
	}
	if suggestion.GetString("status") != "pending" {
		return e.BadRequestError("Suggestion is not pending.", nil)
	}
	var req assetEnrichmentActionRequest
	_ = json.NewDecoder(e.Request.Body).Decode(&req)
	metadata := recordJSONMap(suggestion, "metadata")
	if strings.TrimSpace(req.Reason) != "" {
		metadata["reject_reason"] = strings.TrimSpace(req.Reason)
	}
	suggestion.Set("metadata", metadata)
	suggestion.Set("status", "rejected")
	if err := h.Save(suggestion); err != nil {
		return e.InternalServerError("Failed to reject suggestion.", err)
	}
	if err := h.updateAssetEnrichmentReportStatus(suggestion.GetString("report")); err != nil {
		return e.InternalServerError("Failed to update report status.", err)
	}
	h.createOperationAudit(e, "", "asset_enrichment_reject", suggestion.GetString("asset"), "", "success", "资产补全建议已忽略")
	return e.JSON(http.StatusOK, map[string]string{"status": "rejected"})
}

func (h *Hub) findUserAssetRecord(assetID string, userID string) (*core.Record, error) {
	return h.FindFirstRecordByFilter(
		"assets",
		"id = {:id} && user = {:user}",
		dbx.Params{"id": assetID, "user": userID},
	)
}

func (h *Hub) findUserEnrichmentSuggestion(suggestionID string, userID string) (*core.Record, error) {
	return h.FindFirstRecordByFilter(
		"asset_enrichment_suggestions",
		"id = {:id} && user = {:user}",
		dbx.Params{"id": suggestionID, "user": userID},
	)
}

func filterSystemRecordsForUser(records []*core.Record, userID string) []*core.Record {
	filtered := make([]*core.Record, 0, len(records))
	for _, record := range records {
		for _, value := range record.GetStringSlice("users") {
			if value == userID {
				filtered = append(filtered, record)
				break
			}
		}
	}
	return filtered
}

func (h *Hub) loadSystemDetailRecords(systems []*core.Record) ([]*core.Record, error) {
	if len(systems) == 0 {
		return nil, nil
	}
	parts := make([]string, 0, len(systems))
	params := dbx.Params{}
	for index, system := range systems {
		key := fmt.Sprintf("system%d", index)
		parts = append(parts, "system = {:"+key+"}")
		params[key] = system.Id
	}
	return h.FindRecordsByFilter("system_details", strings.Join(parts, " || "), "system", -1, 0, params)
}

func (h *Hub) createAssetEnrichmentReportRecord(userID string, asset *core.Record, systems []*core.Record, details []*core.Record, suggestions []assetEnrichmentSuggestionInput, onlineResult assetOnlineEnrichmentResult) (*core.Record, error) {
	collection, err := h.FindCachedCollectionByNameOrId("asset_enrichment_reports")
	if err != nil {
		return nil, err
	}
	record := core.NewRecord(collection)
	strategy := assetEnrichmentStrategy(asset.GetString("type"))
	sourceSummary := map[string]any{
		"strategy": map[string]any{
			"id":     strategy.ID,
			"label":  strategy.Label,
			"detail": strategy.Detail,
		},
		"manual_master": map[string]any{
			"type":          asset.GetString("type"),
			"name":          asset.GetString("name"),
			"ip":            firstNonEmpty(asset.GetString("management_ip"), recordMetadataString(asset, "fixed_ipv4")),
			"model":         asset.GetString("model"),
			"vendor":        asset.GetString("vendor"),
			"location":      asset.GetString("location"),
			"support_url":   recordMetadataString(asset, "support_url"),
			"metadata_keys": sortedMapKeys(recordJSONMap(asset, "metadata")),
		},
		"local_collection": map[string]any{
			"bound_agent_systems": len(systems),
			"system_details":      len(details),
		},
		"online_match": onlineResult.SourceSummary(strategy.OnlineDetail, asset),
	}
	confidence := 40
	if len(details) > 0 {
		confidence = 75
	}
	if len(suggestions) == 0 && len(details) == 0 {
		confidence = 25
	}
	record.Set("user", userID)
	record.Set("asset", asset.Id)
	record.Set("trigger", "manual")
	record.Set("status", "ready")
	record.Set("confidence", confidence)
	record.Set("source_summary", sourceSummary)
	record.Set("metadata", map[string]any{
		"pending_suggestions": len(suggestions),
		"conflict_count":      countEnrichmentConflicts(suggestions),
	})
	record.Set("report", buildAssetEnrichmentReportText(asset, systems, details, suggestions, onlineResult))
	if err := h.Save(record); err != nil {
		return nil, err
	}
	return record, nil
}

func (h *Hub) createAssetEnrichmentSuggestionRecord(userID string, assetID string, reportID string, suggestion assetEnrichmentSuggestionInput) error {
	collection, err := h.FindCachedCollectionByNameOrId("asset_enrichment_suggestions")
	if err != nil {
		return err
	}
	record := core.NewRecord(collection)
	record.Set("user", userID)
	record.Set("asset", assetID)
	record.Set("report", reportID)
	record.Set("target_collection", suggestion.TargetCollection)
	record.Set("target_record", suggestion.TargetRecord)
	record.Set("target_field", suggestion.TargetField)
	record.Set("target_label", suggestion.TargetLabel)
	record.Set("current_value", suggestion.CurrentValue)
	record.Set("collected_value", suggestion.CollectedValue)
	record.Set("online_value", suggestion.OnlineValue)
	record.Set("recommended_value", suggestion.RecommendedValue)
	record.Set("source", firstNonEmpty(suggestion.Source, "local"))
	record.Set("confidence", suggestion.Confidence)
	record.Set("conflict", suggestion.Conflict)
	record.Set("status", "pending")
	record.Set("notes", suggestion.Notes)
	record.Set("metadata", suggestion.Metadata)
	return h.Save(record)
}

func (h *Hub) buildAssetEnrichmentSuggestions(asset *core.Record, systems []*core.Record, details []*core.Record, interfaces []*core.Record) []assetEnrichmentSuggestionInput {
	var suggestions []assetEnrichmentSuggestionInput
	detailBySystem := map[string]*core.Record{}
	for _, detail := range details {
		detailBySystem[detail.GetString("system")] = detail
	}
	for _, system := range systems {
		source := firstNonEmpty(system.GetString("display_name"), system.GetString("name"), system.Id)
		detail := detailBySystem[system.Id]
		info := recordJSONMap(system, "info")
		if asset.GetString("name") != "" && source != "" && !sameNormalizedText(asset.GetString("name"), source) {
			suggestions = append(suggestions, buildRecordSuggestion(asset, asset.Id, "name", "资产名称", source, source, "local", 70, true, "Agent 主机名和资产名称不同。确认它就是同一台设备后再写入。", nil))
		}
		collectedIP := firstNonEmpty(system.GetString("target_ip"), system.GetString("connect_ip"), stringFromMap(info, "ip"))
		if collectedIP == "" {
			collectedIP = firstCollectedIPv4(detail)
		}
		if collectedIP != "" {
			suggestions = append(suggestions, buildRecordSuggestion(asset, asset.Id, "management_ip", "管理 IP", asset.GetString("management_ip"), collectedIP, "local", 85, asset.GetString("management_ip") != "" && normalizeAssetIP(asset.GetString("management_ip")) != normalizeAssetIP(collectedIP), "IP 是建档和 Agent 接入线索；确认 DHCP 保留或固定地址后再写入。", nil))
			suggestions = append(suggestions, buildRecordSuggestion(asset, asset.Id, "metadata.fixed_ipv4", "建档 IP / 接入 IP", recordMetadataString(asset, "fixed_ipv4"), collectedIP, "local", 85, recordMetadataString(asset, "fixed_ipv4") != "" && normalizeAssetIP(recordMetadataString(asset, "fixed_ipv4")) != normalizeAssetIP(collectedIP), "该字段用于后续接入和绑定，不作为普通临时采集字段。", nil))
		}
		if detail == nil {
			continue
		}
		suggestions = append(suggestions,
			buildRecordSuggestion(asset, asset.Id, "metadata.os", "操作系统", recordMetadataString(asset, "os"), firstNonEmpty(detail.GetString("os_name"), stringFromMap(info, "o")), "local", 88, false, "来自 Agent 系统详情。", nil),
			buildRecordSuggestion(asset, asset.Id, "metadata.cpu_vendor", "CPU 厂商", recordMetadataString(asset, "cpu_vendor"), detail.GetString("cpu_vendor"), "local", 86, false, "来自 Agent CPU 详情。", nil),
			buildRecordSuggestion(asset, asset.Id, "metadata.cpu_model", "CPU 型号", recordMetadataString(asset, "cpu_model"), firstNonEmpty(detail.GetString("cpu"), stringFromMap(info, "m")), "local", 86, false, "来自 Agent CPU 详情。", nil),
		)
		if memoryGB := bytesToRoundedGB(detail.GetFloat("memory")); memoryGB > 0 {
			suggestions = append(suggestions, buildRecordSuggestion(asset, asset.Id, "metadata.memory_gb", "内存 GB", metadataValueString(asset, "memory_gb"), strconv.Itoa(memoryGB), "local", 82, false, "来自 Agent 内存容量，写入后仍作为长期档案字段。", map[string]any{"value_type": "number"}))
		}
		if memoryDetail := formatMemoryModules(detail); memoryDetail != "" {
			suggestions = append(suggestions, buildRecordSuggestion(asset, asset.Id, "metadata.memory_detail", "内存条摘要", recordMetadataString(asset, "memory_detail"), memoryDetail, "local", 78, false, "来自 Agent 内存条摘要，品牌和颗粒后续可由专项识别继续补全。", nil))
		}
		if speed := primaryNicSpeed(detail); speed > 0 {
			suggestions = append(suggestions, buildRecordSuggestion(asset, asset.Id, "metadata.primary_nic_speed_mbps", "主网卡速率", metadataValueString(asset, "primary_nic_speed_mbps"), strconv.Itoa(speed), "local", 78, false, "来自 Agent 物理网卡链路速率。", map[string]any{"value_type": "number"}))
		}
		if nicDetail := formatNetworkInterfaces(detail); nicDetail != "" {
			suggestions = append(suggestions, buildRecordSuggestion(asset, asset.Id, "metadata.nic_detail", "物理网卡摘要", recordMetadataString(asset, "nic_detail"), nicDetail, "local", 76, false, "来自 Agent 物理网卡列表，芯片级型号后续由专项识别补齐。", nil))
		}
	}
	suggestions = append(suggestions, buildInterfaceSuggestions(asset, details, interfaces)...)
	return dedupeEnrichmentSuggestions(suggestions)
}

func buildRecordSuggestion(asset *core.Record, targetRecord string, field string, label string, current string, recommended string, source string, confidence int, conflict bool, notes string, metadata map[string]any) assetEnrichmentSuggestionInput {
	current = strings.TrimSpace(current)
	recommended = strings.TrimSpace(recommended)
	if recommended == "" || sameSuggestionValue(current, recommended) {
		return assetEnrichmentSuggestionInput{}
	}
	if metadata == nil {
		metadata = map[string]any{}
	}
	if strings.HasPrefix(field, "metadata.") {
		metadata["field_scope"] = "metadata"
	}
	return assetEnrichmentSuggestionInput{
		TargetCollection: "assets",
		TargetRecord:     targetRecord,
		TargetField:      field,
		TargetLabel:      label,
		CurrentValue:     current,
		CollectedValue:   recommended,
		RecommendedValue: recommended,
		Source:           source,
		Confidence:       confidence,
		Conflict:         conflict || current != "",
		Notes:            notes,
		Metadata:         metadata,
	}
}

func buildInterfaceSuggestions(asset *core.Record, details []*core.Record, interfaces []*core.Record) []assetEnrichmentSuggestionInput {
	var suggestions []assetEnrichmentSuggestionInput
	collected := collectNetworkInterfaces(details)
	for _, assetInterface := range interfaces {
		matched := matchCollectedInterface(assetInterface, collected)
		if matched == nil {
			continue
		}
		labelPrefix := firstNonEmpty(assetInterface.GetString("name"), assetInterface.GetString("kind"), "接口")
		if mac := strings.TrimSpace(stringFromMap(matched, "mac")); mac != "" {
			suggestions = append(suggestions, buildInterfaceSuggestion(assetInterface, "mac", labelPrefix+" MAC", assetInterface.GetString("mac"), mac, 90, "Agent 物理网卡 MAC。"))
		}
		if ipv4 := firstStringSliceValue(matched["ipv4"]); ipv4 != "" {
			suggestions = append(suggestions, buildInterfaceSuggestion(assetInterface, "ipv4", labelPrefix+" IPv4", assetInterface.GetString("ipv4"), ipv4, 86, "Agent 物理网卡 IPv4。"))
		}
		if ipv6 := firstStringSliceValue(matched["ipv6"]); ipv6 != "" {
			suggestions = append(suggestions, buildInterfaceSuggestion(assetInterface, "ipv6", labelPrefix+" IPv6", assetInterface.GetString("ipv6"), ipv6, 72, "IPv6 可能随前缀和隐私地址变化，只在确认长期固定时写入。"))
		}
		if speed := intFromMap(matched, "link_speed"); speed > 0 {
			suggestions = append(suggestions, buildInterfaceSuggestion(assetInterface, "speed_mbps", labelPrefix+" 链路速率", recordNumberString(assetInterface, "speed_mbps"), strconv.Itoa(speed), 84, "Agent 物理网卡链路速率。"))
		}
	}
	return suggestions
}

func buildInterfaceSuggestion(record *core.Record, field string, label string, current string, recommended string, confidence int, notes string) assetEnrichmentSuggestionInput {
	current = strings.TrimSpace(current)
	recommended = strings.TrimSpace(recommended)
	if recommended == "" || sameSuggestionValue(current, recommended) {
		return assetEnrichmentSuggestionInput{}
	}
	metadata := map[string]any{}
	if field == "speed_mbps" {
		metadata["value_type"] = "number"
	}
	return assetEnrichmentSuggestionInput{
		TargetCollection: "asset_interfaces",
		TargetRecord:     record.Id,
		TargetField:      field,
		TargetLabel:      label,
		CurrentValue:     current,
		CollectedValue:   recommended,
		RecommendedValue: recommended,
		Source:           "local",
		Confidence:       confidence,
		Conflict:         current != "",
		Notes:            notes,
		Metadata:         metadata,
	}
}

var errAssetEnrichmentStale = errors.New("asset enrichment suggestion stale")

func (h *Hub) applyAssetEnrichmentSuggestion(userID string, suggestion *core.Record) error {
	targetCollection := suggestion.GetString("target_collection")
	targetField := suggestion.GetString("target_field")
	targetRecordID := firstNonEmpty(suggestion.GetString("target_record"), suggestion.GetString("asset"))
	if !isAllowedAssetEnrichmentField(targetCollection, targetField) {
		return fmt.Errorf("字段不允许通过补全建议写入：%s.%s", targetCollection, targetField)
	}
	record, err := h.FindRecordById(targetCollection, targetRecordID)
	if err != nil {
		return fmt.Errorf("目标记录不存在")
	}
	assetID := suggestion.GetString("asset")
	if err := h.validateAssetEnrichmentTargetOwnership(userID, assetID, targetCollection, record); err != nil {
		return err
	}
	current := currentAssetEnrichmentFieldValue(record, targetField)
	if strings.TrimSpace(current) != strings.TrimSpace(suggestion.GetString("current_value")) {
		return errAssetEnrichmentStale
	}
	value, err := h.parseAssetEnrichmentRecommendedValue(suggestion)
	if err != nil {
		return err
	}
	if strings.HasPrefix(targetField, "metadata.") {
		metadata := recordJSONMap(record, "metadata")
		metadata[strings.TrimPrefix(targetField, "metadata.")] = value
		record.Set("metadata", metadata)
	} else {
		record.Set(targetField, value)
	}
	if err := h.validateAssetEnrichmentDuplicateBeforeSave(userID, targetCollection, record); err != nil {
		return err
	}
	if err := h.Save(record); err != nil {
		return err
	}
	return h.createAssetChange(
		userID,
		assetID,
		targetCollection,
		record.Id,
		"update",
		"确认补全建议："+suggestion.GetString("target_label"),
		map[string]any{
			"source_collection": "asset_enrichment_suggestions",
			"source_record":     suggestion.Id,
			"field":             targetField,
			"previous":          suggestion.GetString("current_value"),
			"recommended":       suggestion.GetString("recommended_value"),
			"source":            suggestion.GetString("source"),
			"confidence":        suggestion.GetInt("confidence"),
		},
	)
}

func (h *Hub) validateAssetEnrichmentTargetOwnership(userID string, assetID string, targetCollection string, record *core.Record) error {
	if record.GetString("user") != userID {
		return fmt.Errorf("目标记录不属于当前用户")
	}
	switch targetCollection {
	case "assets":
		if record.Id != assetID {
			return fmt.Errorf("目标资产和建议资产不一致")
		}
	case "asset_interfaces", "asset_maintenance", "asset_attachments":
		if record.GetString("asset") != assetID {
			return fmt.Errorf("目标记录和建议资产不一致")
		}
	default:
		return fmt.Errorf("当前阶段不支持写入该集合")
	}
	return nil
}

func isAllowedAssetEnrichmentField(collection string, field string) bool {
	switch collection {
	case "assets":
		switch field {
		case "name", "vendor", "model", "serial_number", "management_ip", "location", "role":
			return true
		default:
			return allowedAssetEnrichmentMetadataFields[strings.TrimPrefix(field, "metadata.")]
		}
	case "asset_interfaces":
		switch field {
		case "mac", "ipv4", "ipv6", "speed_mbps":
			return true
		}
	}
	return false
}

var allowedAssetEnrichmentMetadataFields = map[string]bool{
	"fixed_ipv4":                true,
	"fixed_ipv6":                true,
	"mac":                       true,
	"support_url":               true,
	"os":                        true,
	"device_os":                 true,
	"online_specs_summary":      true,
	"internal_model":            true,
	"cpu_process":               true,
	"gpu_model":                 true,
	"screen_size":               true,
	"display_type":              true,
	"display_resolution":        true,
	"screen_refresh_rate":       true,
	"display_brightness":        true,
	"display_protection":        true,
	"battery_capacity_mah":      true,
	"battery_type":              true,
	"charging_power_w":          true,
	"wireless_charging":         true,
	"camera_summary":            true,
	"rear_camera_detail":        true,
	"front_camera_detail":       true,
	"video_recording":           true,
	"bluetooth_version":         true,
	"mobile_network":            true,
	"sim_detail":                true,
	"positioning":               true,
	"usb_detail":                true,
	"nfc":                       true,
	"infrared":                  true,
	"dimensions":                true,
	"weight":                    true,
	"water_resistance":          true,
	"speaker_detail":            true,
	"sensor_detail":             true,
	"storage_gb":                true,
	"storage_detail":            true,
	"cpu_vendor":                true,
	"cpu_model":                 true,
	"memory_gb":                 true,
	"memory_detail":             true,
	"primary_nic_speed_mbps":    true,
	"nic_detail":                true,
	"motherboard_vendor":        true,
	"motherboard_model":         true,
	"motherboard_support_url":   true,
	"bios_vendor":               true,
	"bios_version":              true,
	"bios_release_date":         true,
	"gpu_vendor":                true,
	"gpu_detail":                true,
	"memory_vendor":             true,
	"memory_model":              true,
	"memory_type":               true,
	"memory_speed_mhz":          true,
	"storage_vendor":            true,
	"storage_model":             true,
	"storage_media":             true,
	"storage_serial_note":       true,
	"nic_vendor":                true,
	"nic_model":                 true,
	"wifi_vendor":               true,
	"wifi_model":                true,
	"hardware_fingerprint_note": true,
	"hardware_match_note":       true,
}

func (h *Hub) parseAssetEnrichmentRecommendedValue(suggestion *core.Record) (any, error) {
	value := strings.TrimSpace(suggestion.GetString("recommended_value"))
	metadata := recordJSONMap(suggestion, "metadata")
	if stringFromMap(metadata, "value_type") == "number" {
		number, err := strconv.ParseFloat(value, 64)
		if err != nil || !isFiniteNumber(number) {
			return nil, fmt.Errorf("建议值不是有效数字")
		}
		if math.Trunc(number) == number {
			return int(number), nil
		}
		return number, nil
	}
	return value, nil
}

func (h *Hub) validateAssetEnrichmentDuplicateBeforeSave(userID string, collection string, record *core.Record) error {
	switch collection {
	case "assets":
		currentIPs := recordAssetIPValues(record)
		currentMAC := normalizeAssetMAC(recordMetadataString(record, "mac"))
		assets, err := h.FindRecordsByFilter("assets", "user = {:user} && id != {:id}", "", -1, 0, dbx.Params{"user": userID, "id": record.Id})
		if err != nil {
			return err
		}
		for _, existing := range assets {
			if duplicateLabel := duplicateAssetIPLabel(currentIPs, recordAssetIPValues(existing)); duplicateLabel != "" {
				return fmt.Errorf("%s 已被其他资产使用", duplicateLabel)
			}
			if currentMAC != "" && currentMAC == normalizeAssetMAC(recordMetadataString(existing, "mac")) {
				return fmt.Errorf("资产 MAC 已被其他资产使用")
			}
		}
		interfaces, err := h.FindRecordsByFilter("asset_interfaces", "user = {:user}", "", -1, 0, dbx.Params{"user": userID})
		if err != nil {
			return err
		}
		for _, existing := range interfaces {
			if strings.TrimSpace(existing.GetString("asset")) == record.Id {
				continue
			}
			if duplicateLabel := duplicateAssetIPLabel(currentIPs, recordAssetInterfaceIPValues(existing)); duplicateLabel != "" {
				return fmt.Errorf("%s 已被其他资产接口使用", duplicateLabel)
			}
			if currentMAC != "" && currentMAC == normalizeAssetMAC(existing.GetString("mac")) {
				return fmt.Errorf("资产 MAC 已被其他资产接口使用")
			}
		}
	case "asset_interfaces":
		currentIPs := recordAssetInterfaceIPValues(record)
		currentMAC := normalizeAssetMAC(record.GetString("mac"))
		interfaces, err := h.FindRecordsByFilter("asset_interfaces", "user = {:user} && id != {:id}", "", -1, 0, dbx.Params{"user": userID, "id": record.Id})
		if err != nil {
			return err
		}
		for _, existing := range interfaces {
			if duplicateLabel := duplicateAssetIPLabel(currentIPs, recordAssetInterfaceIPValues(existing)); duplicateLabel != "" {
				return fmt.Errorf("%s 已被其他接口使用", duplicateLabel)
			}
			if currentMAC != "" && currentMAC == normalizeAssetMAC(existing.GetString("mac")) {
				return fmt.Errorf("接口 MAC 已被其他接口使用")
			}
		}
		assets, err := h.FindRecordsByFilter("assets", "user = {:user} && id != {:asset}", "", -1, 0, dbx.Params{"user": userID, "asset": record.GetString("asset")})
		if err != nil {
			return err
		}
		for _, existing := range assets {
			if duplicateLabel := duplicateAssetIPLabel(currentIPs, recordAssetIPValues(existing)); duplicateLabel != "" {
				return fmt.Errorf("%s 已被其他资产使用", duplicateLabel)
			}
			if currentMAC != "" && currentMAC == normalizeAssetMAC(recordMetadataString(existing, "mac")) {
				return fmt.Errorf("接口 MAC 已被其他资产使用")
			}
		}
	}
	return nil
}

func (h *Hub) updateAssetEnrichmentReportStatus(reportID string) error {
	if strings.TrimSpace(reportID) == "" {
		return nil
	}
	report, err := h.FindRecordById("asset_enrichment_reports", reportID)
	if err != nil {
		return err
	}
	suggestions, err := h.FindRecordsByFilter("asset_enrichment_suggestions", "report = {:report}", "", -1, 0, dbx.Params{"report": reportID})
	if err != nil {
		return err
	}
	if len(suggestions) == 0 {
		report.Set("status", "ready")
		return h.Save(report)
	}
	counts := map[string]int{}
	for _, suggestion := range suggestions {
		counts[suggestion.GetString("status")]++
	}
	status := "ready"
	if counts["pending"] == 0 {
		if counts["accepted"] > 0 && counts["rejected"] == 0 && counts["stale"] == 0 {
			status = "applied"
		} else if counts["accepted"] > 0 {
			status = "partially_applied"
		} else if counts["rejected"] == len(suggestions) {
			status = "dismissed"
		}
	} else if counts["accepted"] > 0 || counts["rejected"] > 0 || counts["stale"] > 0 {
		status = "partially_applied"
	}
	report.Set("status", status)
	metadata := recordJSONMap(report, "metadata")
	metadata["pending_suggestions"] = counts["pending"]
	metadata["accepted_suggestions"] = counts["accepted"]
	metadata["rejected_suggestions"] = counts["rejected"]
	metadata["stale_suggestions"] = counts["stale"]
	report.Set("metadata", metadata)
	return h.Save(report)
}

func currentAssetEnrichmentFieldValue(record *core.Record, field string) string {
	if strings.HasPrefix(field, "metadata.") {
		return metadataValueString(record, strings.TrimPrefix(field, "metadata."))
	}
	if value := record.Get(field); value != nil {
		switch typed := value.(type) {
		case string:
			return strings.TrimSpace(typed)
		case int:
			return strconv.Itoa(typed)
		case int64:
			return strconv.FormatInt(typed, 10)
		case float64:
			return formatSuggestionNumber(typed)
		}
	}
	return strings.TrimSpace(record.GetString(field))
}

func buildAssetEnrichmentReportText(asset *core.Record, systems []*core.Record, details []*core.Record, suggestions []assetEnrichmentSuggestionInput, onlineResult assetOnlineEnrichmentResult) string {
	strategy := assetEnrichmentStrategy(asset.GetString("type"))
	lines := []string{
		"资产补全报告",
		"资产：" + firstNonEmpty(asset.GetString("name"), asset.Id),
		"补全策略：" + strategy.Label + "。 " + strategy.Detail,
		"主档线索：IP=" + firstNonEmpty(asset.GetString("management_ip"), recordMetadataString(asset, "fixed_ipv4"), "未填写") + "，型号=" + firstNonEmpty(asset.GetString("model"), "未填写"),
		fmt.Sprintf("本地采集：已绑定 Agent %d 台，系统详情 %d 条。", len(systems), len(details)),
		fmt.Sprintf("待确认建议：%d 条，其中冲突 %d 条。", len(suggestions), countEnrichmentConflicts(suggestions)),
		"资料补全 Agent：" + onlineResult.ReportLine(strategy.OnlineDetail),
		"写回规则：所有建议必须人工逐项确认后才会写入资产主档。",
	}
	return strings.Join(lines, "\n")
}

type assetEnrichmentStrategyInfo struct {
	ID           string
	Label        string
	Detail       string
	OnlineDetail string
}

func assetEnrichmentStrategy(assetType string) assetEnrichmentStrategyInfo {
	switch strings.TrimSpace(assetType) {
	case "physical_host", "nas", "server", "mini_pc", "vm":
		return assetEnrichmentStrategyInfo{
			ID:           "staged_hardware_identification",
			Label:        "分阶段硬件识别",
			Detail:       "这类资产的内部硬件可能被更换或自定义，详细型号只作为整机、机箱或平台线索；CPU、主板、内存、网卡、硬盘、显卡等以 Agent 和后续专项识别报告为准。",
			OnlineDetail: "第一阶段不把整机型号联网结果当成内部硬件真相；后续只作为可追溯候选进入报告。",
		}
	default:
		return assetEnrichmentStrategyInfo{
			ID:           "fixed_spec_model_match",
			Label:        "固定规格型号匹配",
			Detail:       "这类资产通常由厂商型号决定主要规格，可优先用详细型号联网匹配厂商、支持页、规格、固件和保修资料。",
			OnlineDetail: "第一阶段未接入可追溯外部资料源，本报告不会伪造厂商规格或支持页；接入后优先按详细型号生成候选。",
		}
	}
}

func countEnrichmentConflicts(suggestions []assetEnrichmentSuggestionInput) int {
	count := 0
	for _, suggestion := range suggestions {
		if suggestion.TargetCollection != "" && suggestion.Conflict {
			count++
		}
	}
	return count
}

func dedupeEnrichmentSuggestions(items []assetEnrichmentSuggestionInput) []assetEnrichmentSuggestionInput {
	seen := map[string]bool{}
	result := make([]assetEnrichmentSuggestionInput, 0, len(items))
	for _, item := range items {
		if item.TargetCollection == "" || item.TargetField == "" || strings.TrimSpace(item.RecommendedValue) == "" {
			continue
		}
		key := strings.Join([]string{item.TargetCollection, item.TargetRecord, item.TargetField, normalizeComparableSuggestion(item.RecommendedValue)}, "\x00")
		if seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, item)
	}
	sort.SliceStable(result, func(i, j int) bool {
		if result[i].Conflict != result[j].Conflict {
			return result[i].Conflict
		}
		return result[i].Confidence > result[j].Confidence
	})
	return result
}

func sameSuggestionValue(left string, right string) bool {
	return normalizeComparableSuggestion(left) == normalizeComparableSuggestion(right)
}

func normalizeComparableSuggestion(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func sameNormalizedText(left string, right string) bool {
	return normalizeComparableSuggestion(left) == normalizeComparableSuggestion(right)
}

func recordJSONMap(record *core.Record, field string) map[string]any {
	if record == nil {
		return map[string]any{}
	}
	if raw, ok := record.Get(field).(map[string]any); ok {
		copy := make(map[string]any, len(raw))
		for key, value := range raw {
			copy[key] = value
		}
		return copy
	}
	var result map[string]any
	if err := record.UnmarshalJSONField(field, &result); err != nil || result == nil {
		return map[string]any{}
	}
	return result
}

func metadataValueString(record *core.Record, key string) string {
	metadata := recordJSONMap(record, "metadata")
	value, ok := metadata[key]
	if !ok || value == nil {
		return ""
	}
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case int:
		return strconv.Itoa(typed)
	case int64:
		return strconv.FormatInt(typed, 10)
	case float64:
		return formatSuggestionNumber(typed)
	case json.Number:
		return typed.String()
	default:
		return strings.TrimSpace(fmt.Sprint(typed))
	}
}

func recordNumberString(record *core.Record, field string) string {
	value := record.Get(field)
	switch typed := value.(type) {
	case int:
		return strconv.Itoa(typed)
	case int64:
		return strconv.FormatInt(typed, 10)
	case float64:
		return formatSuggestionNumber(typed)
	default:
		return strings.TrimSpace(record.GetString(field))
	}
}

func formatSuggestionNumber(value float64) string {
	if !isFiniteNumber(value) || value == 0 {
		return ""
	}
	if math.Trunc(value) == value {
		return strconv.FormatInt(int64(value), 10)
	}
	return strings.TrimRight(strings.TrimRight(strconv.FormatFloat(value, 'f', 2, 64), "0"), ".")
}

func bytesToRoundedGB(value float64) int {
	if value <= 0 || !isFiniteNumber(value) {
		return 0
	}
	return int(math.Round(value / 1024 / 1024 / 1024))
}

func stringFromMap(values map[string]any, key string) string {
	value, ok := values[key]
	if !ok || value == nil {
		return ""
	}
	if text, ok := value.(string); ok {
		return strings.TrimSpace(text)
	}
	return strings.TrimSpace(fmt.Sprint(value))
}

func intFromMap(values map[string]any, key string) int {
	value, ok := values[key]
	if !ok || value == nil {
		return 0
	}
	switch typed := value.(type) {
	case int:
		return typed
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	case json.Number:
		number, _ := typed.Int64()
		return int(number)
	default:
		number, _ := strconv.Atoi(strings.TrimSpace(fmt.Sprint(typed)))
		return number
	}
}

func firstCollectedIPv4(detail *core.Record) string {
	if detail == nil {
		return ""
	}
	for _, item := range collectNetworkInterfaces([]*core.Record{detail}) {
		if value := firstStringSliceValue(item["ipv4"]); value != "" {
			return value
		}
	}
	return ""
}

func firstStringSliceValue(value any) string {
	switch typed := value.(type) {
	case []string:
		if len(typed) > 0 {
			return strings.TrimSpace(typed[0])
		}
	case []any:
		for _, item := range typed {
			if text := strings.TrimSpace(fmt.Sprint(item)); text != "" {
				return text
			}
		}
	}
	return ""
}

func collectNetworkInterfaces(details []*core.Record) []map[string]any {
	var result []map[string]any
	for _, detail := range details {
		var interfaces []map[string]any
		if err := detail.UnmarshalJSONField("network_interfaces", &interfaces); err != nil {
			continue
		}
		result = append(result, interfaces...)
	}
	return result
}

func matchCollectedInterface(assetInterface *core.Record, collected []map[string]any) map[string]any {
	if assetInterface == nil {
		return nil
	}
	if mac := normalizeAssetMAC(assetInterface.GetString("mac")); mac != "" {
		for _, item := range collected {
			if normalizeAssetMAC(stringFromMap(item, "mac")) == mac {
				return item
			}
		}
	}
	if ipv4 := normalizeAssetIP(assetInterface.GetString("ipv4")); ipv4 != "" {
		for _, item := range collected {
			for _, value := range stringsFromUnknownSlice(item["ipv4"]) {
				if normalizeAssetIP(value) == ipv4 {
					return item
				}
			}
		}
	}
	if ipv6 := normalizeAssetIP(assetInterface.GetString("ipv6")); ipv6 != "" {
		for _, item := range collected {
			for _, value := range stringsFromUnknownSlice(item["ipv6"]) {
				if normalizeAssetIP(value) == ipv6 {
					return item
				}
			}
		}
	}
	if assetInterface.GetBool("primary") && len(collected) == 1 {
		return collected[0]
	}
	return nil
}

func stringsFromUnknownSlice(value any) []string {
	switch typed := value.(type) {
	case []string:
		return typed
	case []any:
		result := make([]string, 0, len(typed))
		for _, item := range typed {
			if text := strings.TrimSpace(fmt.Sprint(item)); text != "" {
				result = append(result, text)
			}
		}
		return result
	default:
		return nil
	}
}

func formatMemoryModules(detail *core.Record) string {
	if detail == nil {
		return ""
	}
	var modules []map[string]any
	if err := detail.UnmarshalJSONField("memory_modules", &modules); err != nil || len(modules) == 0 {
		return ""
	}
	parts := make([]string, 0, len(modules))
	for _, module := range modules {
		size := ""
		if capacity := intFromMap(module, "capacity"); capacity > 0 {
			size = strconv.Itoa(bytesToRoundedGB(float64(capacity))) + "GB"
		}
		text := strings.Join(nonEmptyStrings(
			stringFromMap(module, "manufacturer"),
			stringFromMap(module, "part_number"),
			size,
			formatMHz(intFromMap(module, "speed_mhz")),
		), " ")
		if text != "" {
			parts = append(parts, text)
		}
	}
	if len(parts) > 4 {
		parts = parts[:4]
	}
	return strings.Join(parts, " / ")
}

func formatNetworkInterfaces(detail *core.Record) string {
	if detail == nil {
		return ""
	}
	interfaces := collectNetworkInterfaces([]*core.Record{detail})
	parts := make([]string, 0, len(interfaces))
	for _, item := range interfaces {
		name := firstNonEmpty(stringFromMap(item, "display_name"), stringFromMap(item, "name"))
		if name == "" {
			continue
		}
		speed := ""
		if value := intFromMap(item, "link_speed"); value > 0 {
			speed = strconv.Itoa(value) + "Mbps"
		}
		parts = append(parts, strings.Join(nonEmptyStrings(name, stringFromMap(item, "mac"), speed), " "))
	}
	if len(parts) > 4 {
		parts = parts[:4]
	}
	return strings.Join(parts, " / ")
}

func primaryNicSpeed(detail *core.Record) int {
	maxSpeed := 0
	for _, item := range collectNetworkInterfaces([]*core.Record{detail}) {
		if speed := intFromMap(item, "link_speed"); speed > maxSpeed {
			maxSpeed = speed
		}
	}
	return maxSpeed
}

func formatMHz(value int) string {
	if value <= 0 {
		return ""
	}
	return strconv.Itoa(value) + "MHz"
}

func nonEmptyStrings(values ...string) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func sortedMapKeys(values map[string]any) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func isFiniteNumber(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}
