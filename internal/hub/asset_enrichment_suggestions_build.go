package hub

import (
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

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
		memoryProfile := summarizeMemoryModules(detail)
		if memoryProfile.Layout != "" {
			suggestions = append(suggestions, buildRecordSuggestion(asset, asset.Id, "metadata.memory_detail", "内存规格", recordMetadataString(asset, "memory_detail"), memoryProfile.Layout, "local", 78, false, "来自 Agent 内存条容量组合，例如 16 GB x 2。", nil))
		}
		if memoryProfile.Vendor != "" {
			suggestions = append(suggestions, buildRecordSuggestion(asset, asset.Id, "metadata.memory_vendor", "内存品牌", recordMetadataString(asset, "memory_vendor"), memoryProfile.Vendor, "local", 76, false, "来自 Agent 内存条厂商。", nil))
		}
		if memoryProfile.Type != "" {
			suggestions = append(suggestions, buildRecordSuggestion(asset, asset.Id, "metadata.memory_type", "内存类型", recordMetadataString(asset, "memory_type"), memoryProfile.Type, "local", 76, false, "来自 Agent 内存条类型。", nil))
		}
		if memoryProfile.SpeedMHz > 0 {
			suggestions = append(suggestions, buildRecordSuggestion(asset, asset.Id, "metadata.memory_speed_mhz", "内存频率", recordMetadataString(asset, "memory_speed_mhz"), strconv.Itoa(memoryProfile.SpeedMHz), "local", 76, false, "来自 Agent 内存条频率。", map[string]any{"value_type": "number"}))
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
		if speed := networkSpeedMbps(intFromMap(matched, "link_speed")); speed > 0 {
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

func bytesToRoundedGB(value float64) int {
	if value <= 0 || !isFiniteNumber(value) {
		return 0
	}
	return int(math.Round(value / 1024 / 1024 / 1024))
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

type memoryModuleSummary struct {
	Layout   string
	Vendor   string
	Type     string
	SpeedMHz int
}

func summarizeMemoryModules(detail *core.Record) memoryModuleSummary {
	if detail == nil {
		return memoryModuleSummary{}
	}
	var modules []map[string]any
	if err := detail.UnmarshalJSONField("memory_modules", &modules); err != nil || len(modules) == 0 {
		return memoryModuleSummary{}
	}
	capacities := map[int]int{}
	vendors := make([]string, 0, len(modules))
	types := make([]string, 0, len(modules))
	speeds := make([]int, 0, len(modules))
	seenVendors := map[string]bool{}
	seenTypes := map[string]bool{}
	seenSpeeds := map[int]bool{}
	for _, module := range modules {
		if capacity := intFromMap(module, "capacity"); capacity > 0 {
			capacities[bytesToRoundedGB(float64(capacity))]++
		}
		if vendor := stringFromMap(module, "manufacturer"); vendor != "" && !seenVendors[vendor] {
			seenVendors[vendor] = true
			vendors = append(vendors, vendor)
		}
		if memoryType := stringFromMap(module, "memory_type"); memoryType != "" && !seenTypes[memoryType] {
			seenTypes[memoryType] = true
			types = append(types, memoryType)
		}
		speed := intFromMap(module, "configured_mhz")
		if speed <= 0 {
			speed = intFromMap(module, "speed_mhz")
		}
		if speed > 0 && !seenSpeeds[speed] {
			seenSpeeds[speed] = true
			speeds = append(speeds, speed)
		}
	}
	capacityValues := make([]int, 0, len(capacities))
	for capacity := range capacities {
		capacityValues = append(capacityValues, capacity)
	}
	sort.Ints(capacityValues)
	layout := make([]string, 0, len(capacityValues))
	for _, capacity := range capacityValues {
		layout = append(layout, fmt.Sprintf("%d GB x %d", capacity, capacities[capacity]))
	}
	if len(speeds) > 1 {
		speeds = nil
	}
	speedMHz := 0
	if len(speeds) == 1 {
		speedMHz = speeds[0]
	}
	return memoryModuleSummary{
		Layout:   strings.Join(layout, " + "),
		Vendor:   strings.Join(vendors, " / "),
		Type:     strings.Join(types, " / "),
		SpeedMHz: speedMHz,
	}
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
		if value := networkSpeedMbps(intFromMap(item, "link_speed")); value > 0 {
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
		if speed := networkSpeedMbps(intFromMap(item, "link_speed")); speed > maxSpeed {
			maxSpeed = speed
		}
	}
	return maxSpeed
}

// Agent network details keep link_speed in bits per second; asset profile fields use Mbps.
func networkSpeedMbps(speed int) int {
	if speed >= 1_000_000 {
		return speed / 1_000_000
	}
	return speed
}

func sortedMapKeys(values map[string]any) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}
