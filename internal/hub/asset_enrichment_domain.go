package hub

import (
	"fmt"
	"sort"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

func normalizeAssetEnrichmentReportFocus(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "official_colors", "colors", "device_colors":
		return "official_colors"
	default:
		return ""
	}
}

func filterAssetEnrichmentSuggestionsByFocus(suggestions []assetEnrichmentSuggestionInput, focus string) []assetEnrichmentSuggestionInput {
	if focus == "" {
		return suggestions
	}
	result := make([]assetEnrichmentSuggestionInput, 0, len(suggestions))
	for _, suggestion := range suggestions {
		if assetEnrichmentSuggestionMatchesFocus(suggestion, focus) {
			result = append(result, suggestion)
		}
	}
	return result
}

func assetEnrichmentSuggestionMatchesFocus(suggestion assetEnrichmentSuggestionInput, focus string) bool {
	field := strings.TrimPrefix(strings.TrimSpace(suggestion.TargetField), "metadata.")
	switch focus {
	case "official_colors":
		return field == "colors_available" || field == "official_colors" || field == "official_image_url"
	default:
		return true
	}
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
	seen := map[string]int{}
	result := make([]assetEnrichmentSuggestionInput, 0, len(items))
	for _, item := range items {
		if item.TargetCollection == "" || item.TargetField == "" || strings.TrimSpace(item.RecommendedValue) == "" {
			continue
		}
		key := strings.Join([]string{item.TargetCollection, item.TargetRecord, item.TargetField, normalizeComparableSuggestion(item.RecommendedValue)}, "\x00")
		if index, ok := seen[key]; ok {
			mergeAssetEnrichmentSuggestionSources(&result[index], item)
			continue
		}
		seen[key] = len(result)
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

func mergeAssetEnrichmentSuggestionSources(target *assetEnrichmentSuggestionInput, incoming assetEnrichmentSuggestionInput) {
	if target == nil {
		return
	}
	if target.CollectedValue == "" {
		target.CollectedValue = incoming.CollectedValue
	}
	if target.OnlineValue == "" {
		target.OnlineValue = incoming.OnlineValue
	}
	if incoming.Confidence > target.Confidence {
		target.Confidence = incoming.Confidence
		target.Notes = incoming.Notes
		target.Metadata = incoming.Metadata
	}
	target.Conflict = target.Conflict || incoming.Conflict
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
