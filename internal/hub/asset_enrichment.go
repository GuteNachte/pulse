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

type assetEnrichmentBatchAcceptRequest struct {
	SuggestionIDs []string `json:"suggestion_ids"`
}

type assetEnrichmentReportRequest struct {
	Focus string `json:"focus"`
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

type assetEnrichmentSuggestionApplication struct {
	Suggestion       *core.Record
	Record           *core.Record
	TargetCollection string
	TargetField      string
	AssetID          string
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
	var req assetEnrichmentReportRequest
	_ = json.NewDecoder(e.Request.Body).Decode(&req)
	focus := normalizeAssetEnrichmentReportFocus(req.Focus)

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
	onlineResult := h.collectAssetOnlineEnrichment(e.Request.Context(), asset, focus)
	suggestions := append(localSuggestions, onlineResult.Suggestions...)
	suggestions = filterAssetEnrichmentSuggestionsByFocus(suggestions, focus)
	suggestions = dedupeEnrichmentSuggestions(suggestions)
	reportRecord, err := h.createAssetEnrichmentReportRecord(e.Auth.Id, asset, systems, details, suggestions, onlineResult, focus)
	if err != nil {
		return e.InternalServerError("Failed to create enrichment report.", err)
	}
	for _, suggestion := range suggestions {
		if err := h.createAssetEnrichmentSuggestionRecord(e.Auth.Id, asset.Id, reportRecord.Id, suggestion); err != nil {
			return e.InternalServerError("Failed to create enrichment suggestion.", err)
		}
	}
	if err := h.createAssetEnrichmentAITask(e.Auth.Id, asset, reportRecord.Id, onlineResult, suggestions, focus); err != nil {
		return e.InternalServerError("Failed to create enrichment AI task.", err)
	}

	auditMessage := "资产补全报告已生成"
	if focus == "official_colors" {
		auditMessage = "资产官方配色补全报告已生成"
	}
	h.createOperationAudit(e, "", "asset_enrichment_report", asset.Id, "", "success", auditMessage)
	return e.JSON(http.StatusOK, map[string]any{
		"report":      reportRecord,
		"suggestions": len(suggestions),
		"focus":       focus,
	})
}

func (h *Hub) createAssetEnrichmentAITask(userID string, asset *core.Record, reportID string, onlineResult assetOnlineEnrichmentResult, suggestions []assetEnrichmentSuggestionInput, focus string) error {
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
		"focus":          focus,
	})
	record.Set("output_summary", map[string]any{
		"ai_status":                     firstNonEmpty(onlineResult.AI.Status, status),
		"ai_attempts":                   onlineResult.AI.Attempts,
		"ai_suggestions":                onlineResult.AI.Suggestions,
		"source_discovery_status":       onlineResult.Discovery.Status,
		"source_discovery_attempts":     onlineResult.Discovery.Attempts,
		"source_discovery_source_count": onlineResult.Discovery.Suggestions,
		"source_discovery_error":        onlineResult.Discovery.Error,
		"total_suggestions":             len(suggestions),
		"providers":                     onlineResult.Providers,
		"focus":                         focus,
	})
	record.Set("error", errorMessage)
	record.Set("metadata", map[string]any{
		"report":         reportID,
		"source":         "asset_center_enrichment",
		"manual_trigger": true,
		"focus":          focus,
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
	applications, records, err := h.prepareAssetEnrichmentBatchApplications(e.Auth.Id, []*core.Record{suggestion})
	if err != nil {
		if errors.Is(err, errAssetEnrichmentStale) {
			suggestion.Set("status", "stale")
			_ = h.Save(suggestion)
			_ = h.updateAssetEnrichmentReportStatus(suggestion.GetString("report"))
			return e.BadRequestError("资产主档当前值已变化，请重新生成补全报告。", err)
		}
		return e.BadRequestError(err.Error(), err)
	}
	if err := h.saveAssetEnrichmentBatchApplications(e.Auth.Id, applications, records); err != nil {
		return e.InternalServerError("Failed to accept enrichment suggestion.", err)
	}
	h.createOperationAudit(e, "", "asset_enrichment_accept", suggestion.GetString("asset"), "", "success", "资产补全建议已写入")
	return e.JSON(http.StatusOK, map[string]string{"status": "accepted"})
}

func (h *Hub) acceptAssetEnrichmentSuggestionsBatch(e *core.RequestEvent) error {
	var req assetEnrichmentBatchAcceptRequest
	if err := json.NewDecoder(e.Request.Body).Decode(&req); err != nil {
		return e.BadRequestError("Invalid request body.", err)
	}
	suggestionIDs := uniqueNonEmptyStrings(req.SuggestionIDs)
	if len(suggestionIDs) == 0 {
		return e.BadRequestError("Missing suggestion ids.", nil)
	}
	if len(suggestionIDs) > 50 {
		return e.BadRequestError("一次最多确认 50 条补全建议。", nil)
	}
	suggestions := make([]*core.Record, 0, len(suggestionIDs))
	for _, suggestionID := range suggestionIDs {
		suggestion, err := h.findUserEnrichmentSuggestion(suggestionID, e.Auth.Id)
		if err != nil {
			return e.NotFoundError("Suggestion not found.", err)
		}
		if suggestion.GetString("status") != "pending" {
			return e.BadRequestError("Suggestion is not pending.", nil)
		}
		suggestions = append(suggestions, suggestion)
	}
	applications, records, err := h.prepareAssetEnrichmentBatchApplications(e.Auth.Id, suggestions)
	if err != nil {
		if errors.Is(err, errAssetEnrichmentStale) {
			return e.BadRequestError("资产主档当前值已变化，请重新生成补全报告。", err)
		}
		return e.BadRequestError(err.Error(), err)
	}
	if err := h.saveAssetEnrichmentBatchApplications(e.Auth.Id, applications, records); err != nil {
		return e.InternalServerError("Failed to accept enrichment suggestions.", err)
	}
	h.createOperationAudit(e, "", "asset_enrichment_accept_batch", firstNonEmpty(suggestions[0].GetString("asset"), ""), "", "success", fmt.Sprintf("资产补全建议已批量写入 %d 条", len(applications)))
	return e.JSON(http.StatusOK, map[string]any{"status": "accepted", "accepted": len(applications)})
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

func (h *Hub) createAssetEnrichmentReportRecord(userID string, asset *core.Record, systems []*core.Record, details []*core.Record, suggestions []assetEnrichmentSuggestionInput, onlineResult assetOnlineEnrichmentResult, focus string) (*core.Record, error) {
	collection, err := h.FindCachedCollectionByNameOrId("asset_enrichment_reports")
	if err != nil {
		return nil, err
	}
	record := core.NewRecord(collection)
	strategy := assetEnrichmentStrategy(asset.GetString("type"))
	sourceSummary := map[string]any{
		"focus": focus,
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
			"product_url":   recordMetadataString(asset, "product_url"),
			"official_url":  recordMetadataString(asset, "official_url"),
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

func (h *Hub) prepareAssetEnrichmentBatchApplications(userID string, suggestions []*core.Record) ([]assetEnrichmentSuggestionApplication, map[string]*core.Record, error) {
	records := map[string]*core.Record{}
	fieldSeen := map[string]bool{}
	applications := make([]assetEnrichmentSuggestionApplication, 0, len(suggestions))
	for _, suggestion := range suggestions {
		application, err := h.prepareAssetEnrichmentSuggestionApplication(userID, suggestion, records)
		if err != nil {
			return nil, nil, err
		}
		fieldKey := strings.Join([]string{application.TargetCollection, application.Record.Id, application.TargetField}, "\x00")
		if fieldSeen[fieldKey] {
			return nil, nil, fmt.Errorf("同一批次里存在重复目标字段：%s.%s", application.TargetCollection, application.TargetField)
		}
		fieldSeen[fieldKey] = true
		applications = append(applications, application)
	}
	recordKeys := sortedStringKeys(records)
	for _, key := range recordKeys {
		record := records[key]
		if err := h.validateAssetEnrichmentDuplicateBeforeSave(userID, record.Collection().Name, record); err != nil {
			return nil, nil, err
		}
	}
	return applications, records, nil
}

func (h *Hub) prepareAssetEnrichmentSuggestionApplication(userID string, suggestion *core.Record, records map[string]*core.Record) (assetEnrichmentSuggestionApplication, error) {
	targetCollection := suggestion.GetString("target_collection")
	targetField := suggestion.GetString("target_field")
	targetRecordID := firstNonEmpty(suggestion.GetString("target_record"), suggestion.GetString("asset"))
	recordKey := targetCollection + ":" + targetRecordID
	record := records[recordKey]
	if record == nil {
		loaded, err := h.FindRecordById(targetCollection, targetRecordID)
		if err != nil {
			return assetEnrichmentSuggestionApplication{}, fmt.Errorf("目标记录不存在")
		}
		record = loaded.Clone()
		records[recordKey] = record
	}
	assetID := suggestion.GetString("asset")
	if err := h.validateAssetEnrichmentTargetOwnership(userID, assetID, targetCollection, record); err != nil {
		return assetEnrichmentSuggestionApplication{}, err
	}
	if !isAllowedAssetEnrichmentField(record.GetString("type"), targetCollection, targetField) {
		return assetEnrichmentSuggestionApplication{}, fmt.Errorf("字段不允许通过当前资产类型的补全建议写入：%s.%s", targetCollection, targetField)
	}
	current := currentAssetEnrichmentFieldValue(record, targetField)
	if strings.TrimSpace(current) != strings.TrimSpace(suggestion.GetString("current_value")) {
		return assetEnrichmentSuggestionApplication{}, errAssetEnrichmentStale
	}
	value, err := h.parseAssetEnrichmentRecommendedValue(suggestion)
	if err != nil {
		return assetEnrichmentSuggestionApplication{}, err
	}
	if err := validateAssetEnrichmentRecommendedValue(targetCollection, targetField, value, suggestion); err != nil {
		return assetEnrichmentSuggestionApplication{}, err
	}
	if strings.HasPrefix(targetField, "metadata.") {
		metadata := recordJSONMap(record, "metadata")
		metadata[strings.TrimPrefix(targetField, "metadata.")] = value
		record.Set("metadata", metadata)
	} else {
		record.Set(targetField, value)
	}
	return assetEnrichmentSuggestionApplication{
		Suggestion:       suggestion,
		Record:           record,
		TargetCollection: targetCollection,
		TargetField:      targetField,
		AssetID:          assetID,
	}, nil
}

func (h *Hub) saveAssetEnrichmentBatchApplications(userID string, applications []assetEnrichmentSuggestionApplication, records map[string]*core.Record) error {
	reportIDs := map[string]bool{}
	return h.RunInTransaction(func(txApp core.App) error {
		for _, key := range sortedStringKeys(records) {
			if err := txApp.Save(records[key]); err != nil {
				return err
			}
		}
		for _, application := range applications {
			suggestion := application.Suggestion
			if err := createAssetChangeWithApp(
				txApp,
				userID,
				application.AssetID,
				application.TargetCollection,
				application.Record.Id,
				"update",
				"确认补全建议："+suggestion.GetString("target_label"),
				map[string]any{
					"source_collection": "asset_enrichment_suggestions",
					"source_record":     suggestion.Id,
					"field":             application.TargetField,
					"previous":          suggestion.GetString("current_value"),
					"recommended":       suggestion.GetString("recommended_value"),
					"source":            suggestion.GetString("source"),
					"confidence":        suggestion.GetInt("confidence"),
				},
			); err != nil {
				return err
			}
			suggestion.Set("status", "accepted")
			if err := txApp.Save(suggestion); err != nil {
				return err
			}
			if reportID := strings.TrimSpace(suggestion.GetString("report")); reportID != "" {
				reportIDs[reportID] = true
			}
		}
		for _, reportID := range sortedBoolMapKeys(reportIDs) {
			if err := updateAssetEnrichmentReportStatusWithApp(txApp, reportID); err != nil {
				return err
			}
		}
		return nil
	})
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

func isAllowedAssetEnrichmentField(assetType string, collection string, field string) bool {
	switch collection {
	case "assets":
		switch field {
		case "name", "vendor", "model", "serial_number", "management_ip", "location", "role":
			return true
		default:
			if !strings.HasPrefix(field, "metadata.") {
				return false
			}
			return assetEnrichmentAllowedMetadataFieldSet(assetType)[strings.TrimPrefix(field, "metadata.")]
		}
	case "asset_interfaces":
		switch field {
		case "mac", "ipv4", "ipv6", "speed_mbps":
			return true
		}
	}
	return false
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

func validateAssetEnrichmentRecommendedValue(collection string, field string, value any, suggestion *core.Record) error {
	if collection == "assets" && field == "metadata.official_image_url" {
		text := strings.TrimSpace(fmt.Sprint(value))
		if text != "" && !isLikelyImageURL(text) {
			return fmt.Errorf("官方图片必须是可识别的图片 URL")
		}
		if text != "" && !assetEnrichmentOfficialImageWritebackAllowed(text, suggestion) {
			return fmt.Errorf("官方图片必须来自官方图片来源")
		}
	}
	return nil
}

func assetEnrichmentOfficialImageWritebackAllowed(value string, suggestion *core.Record) bool {
	if classifyAssetOnlineURL(value) == "official_image" {
		return true
	}
	metadata := recordJSONMap(suggestion, "metadata")
	sources := assetEnrichmentSourcesFromSuggestionMetadata(metadata)
	if len(sources) == 0 {
		return false
	}
	return assetOfficialImageSuggestionValueAllowed(value, sources)
}

func assetEnrichmentSourcesFromSuggestionMetadata(metadata map[string]any) []assetOnlineSource {
	if sources := assetEnrichmentSourceRowsFromSuggestionMetadata(metadata); len(sources) > 0 {
		return sources
	}
	sourceURLs := stringSliceFromMap(metadata, "source_urls")
	sourceTypes := stringSliceFromMap(metadata, "source_types")
	sourceTitles := stringSliceFromMap(metadata, "source_titles")
	maxLen := maxInt(len(sourceURLs), len(sourceTypes), len(sourceTitles))
	result := make([]assetOnlineSource, 0, maxLen)
	for index := 0; index < maxLen; index++ {
		source := assetOnlineSource{
			URL:   stringAt(sourceURLs, index),
			Type:  stringAt(sourceTypes, index),
			Title: stringAt(sourceTitles, index),
		}
		if source.Type == "" && source.URL != "" {
			source.Type = classifyAssetOnlineURL(source.URL)
		}
		if source.ImageURL == "" && isLikelyImageURL(source.URL) {
			source.ImageURL = source.URL
		}
		if source.URL == "" && source.ImageURL == "" {
			continue
		}
		result = append(result, source)
	}
	return result
}

func assetEnrichmentSourceRowsFromSuggestionMetadata(metadata map[string]any) []assetOnlineSource {
	raw, ok := metadata["sources"]
	if !ok || raw == nil {
		return nil
	}
	switch typed := raw.(type) {
	case []assetOnlineSource:
		return normalizeAssetEnrichmentSources(typed)
	case []map[string]any:
		result := make([]assetOnlineSource, 0, len(typed))
		for _, row := range typed {
			if source, ok := assetEnrichmentSourceFromMetadataMap(row); ok {
				result = append(result, source)
			}
		}
		return result
	case []any:
		result := make([]assetOnlineSource, 0, len(typed))
		for _, item := range typed {
			if row, ok := item.(map[string]any); ok {
				if source, ok := assetEnrichmentSourceFromMetadataMap(row); ok {
					result = append(result, source)
				}
			}
		}
		return result
	default:
		return nil
	}
}

func normalizeAssetEnrichmentSources(sources []assetOnlineSource) []assetOnlineSource {
	result := make([]assetOnlineSource, 0, len(sources))
	for _, source := range sources {
		source.Provider = strings.TrimSpace(source.Provider)
		source.Type = strings.TrimSpace(source.Type)
		source.Title = strings.TrimSpace(source.Title)
		source.URL = strings.TrimSpace(source.URL)
		source.ImageURL = strings.TrimSpace(source.ImageURL)
		if source.Type == "" && source.URL != "" {
			source.Type = classifyAssetOnlineURL(source.URL)
		}
		if source.ImageURL == "" && isLikelyImageURL(source.URL) {
			source.ImageURL = source.URL
		}
		if source.URL == "" && source.ImageURL == "" {
			continue
		}
		result = append(result, source)
	}
	return result
}

func assetEnrichmentSourceFromMetadataMap(row map[string]any) (assetOnlineSource, bool) {
	source := assetOnlineSource{
		Provider:   stringFromMap(row, "provider"),
		Type:       stringFromMap(row, "type"),
		Title:      stringFromMap(row, "title"),
		URL:        stringFromMap(row, "url"),
		ImageURL:   stringFromMap(row, "image_url"),
		Confidence: intFromMap(row, "confidence"),
	}
	if source.Type == "" && source.URL != "" {
		source.Type = classifyAssetOnlineURL(source.URL)
	}
	if source.ImageURL == "" && isLikelyImageURL(source.URL) {
		source.ImageURL = source.URL
	}
	if source.URL == "" && source.ImageURL == "" {
		return assetOnlineSource{}, false
	}
	return source, true
}

func (h *Hub) validateAssetEnrichmentDuplicateBeforeSave(userID string, collection string, record *core.Record) error {
	switch collection {
	case "assets":
		currentName := normalizeAssetText(record.GetString("name"))
		currentType := strings.TrimSpace(record.GetString("type"))
		currentSerial := normalizeAssetText(record.GetString("serial_number"))
		currentIPs := recordAssetIPValues(record)
		currentMAC := normalizeAssetMAC(recordMetadataString(record, "mac"))
		assets, err := h.FindRecordsByFilter("assets", "user = {:user} && id != {:id}", "", -1, 0, dbx.Params{"user": userID, "id": record.Id})
		if err != nil {
			return err
		}
		for _, existing := range assets {
			existingName := normalizeAssetText(existing.GetString("name"))
			if currentName != "" && currentType != "" && currentType == strings.TrimSpace(existing.GetString("type")) && currentName == existingName {
				return fmt.Errorf("同类型同名资产已存在，请不要重复添加")
			}
			if currentSerial != "" && currentSerial == normalizeAssetText(existing.GetString("serial_number")) {
				return fmt.Errorf("资产序列号已存在，请不要重复添加")
			}
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
	return updateAssetEnrichmentReportStatusWithApp(h.App, reportID)
}

func updateAssetEnrichmentReportStatusWithApp(app core.App, reportID string) error {
	if strings.TrimSpace(reportID) == "" {
		return nil
	}
	report, err := app.FindRecordById("asset_enrichment_reports", reportID)
	if err != nil {
		return err
	}
	suggestions, err := app.FindRecordsByFilter("asset_enrichment_suggestions", "report = {:report}", "", -1, 0, dbx.Params{"report": reportID})
	if err != nil {
		return err
	}
	if len(suggestions) == 0 {
		report.Set("status", "ready")
		return app.Save(report)
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
	return app.Save(report)
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

func stringSliceFromMap(values map[string]any, key string) []string {
	value, ok := values[key]
	if !ok || value == nil {
		return nil
	}
	switch typed := value.(type) {
	case []string:
		result := make([]string, 0, len(typed))
		for _, item := range typed {
			if trimmed := strings.TrimSpace(item); trimmed != "" {
				result = append(result, trimmed)
			}
		}
		return result
	case []any:
		result := make([]string, 0, len(typed))
		for _, item := range typed {
			if trimmed := strings.TrimSpace(fmt.Sprint(item)); trimmed != "" {
				result = append(result, trimmed)
			}
		}
		return result
	case string:
		if trimmed := strings.TrimSpace(typed); trimmed != "" {
			return []string{trimmed}
		}
	}
	return nil
}

func stringAt(values []string, index int) string {
	if index < 0 || index >= len(values) {
		return ""
	}
	return strings.TrimSpace(values[index])
}

func maxInt(values ...int) int {
	maximum := 0
	for _, value := range values {
		if value > maximum {
			maximum = value
		}
	}
	return maximum
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

func sortedStringKeys[T any](values map[string]T) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func sortedBoolMapKeys(values map[string]bool) []string {
	return sortedStringKeys(values)
}

func isFiniteNumber(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}
