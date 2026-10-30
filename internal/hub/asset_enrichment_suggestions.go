// This file was created by mechanically splitting internal/hub/asset_enrichment_online.go.
// All declarations below were moved verbatim from that file; there is no behavior change.
// Theme: online enrichment suggestion building.

package hub

import (
	"regexp"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

func buildAssetOnlineSuggestions(asset *core.Record, sources []assetOnlineSource, query string) []assetEnrichmentSuggestionInput {
	var suggestions []assetEnrichmentSuggestionInput
	specs := extractAssetOnlineSpecs(asset, sources)
	if vendor := inferAssetVendorFromOnlineSources(sources); vendor != "" {
		suggestions = append(suggestions, buildOnlineRecordSuggestion(asset, "vendor", "厂商 / 品牌", asset.GetString("vendor"), vendor, "联网来源命中厂商线索。", sources, 74))
	}
	if model := inferAssetModelFromOnlineSources(asset, sources); model != "" {
		suggestions = append(suggestions, buildOnlineRecordSuggestion(asset, "model", "型号 / 规格", asset.GetString("model"), model, "联网来源和建档线索共同指向该型号。", sources, 72))
	}
	if reference := chooseAssetReferenceURLSuggestion(sources); reference.URL != "" {
		suggestions = append(suggestions, buildOnlineRecordSuggestion(asset, "metadata."+reference.Field, reference.Label, recordMetadataString(asset, reference.Field), reference.URL, reference.Notes, sources, 82))
	}
	if imageURL := chooseAssetOfficialImageURL(sources); imageURL != "" {
		suggestions = append(suggestions, buildOnlineRecordSuggestion(asset, "metadata.official_image_url", "官方图片", recordMetadataString(asset, "official_image_url"), imageURL, "优先选择官网或官方 CDN 暴露的设备图片，后续设备图片收集会优先使用该图片。", sources, 82))
	}
	for _, item := range specs.Items {
		suggestions = append(suggestions, buildOnlineRecordSuggestion(asset, "metadata."+item.Field, item.Label, metadataValueString(asset, item.Field), item.Value, item.Notes, item.Sources, item.Confidence))
	}
	if specs.Summary != "" {
		suggestions = append(suggestions, buildOnlineRecordSuggestion(asset, "metadata.online_specs_summary", "联网规格摘要", recordMetadataString(asset, "online_specs_summary"), specs.Summary, "从可追溯资料页提取的规格摘要。请确认对应型号无误后再写入主档。", specs.Sources, 68))
	}
	return suggestions
}

func buildOnlineRecordSuggestion(asset *core.Record, field string, label string, current string, recommended string, notes string, sources []assetOnlineSource, confidence int) assetEnrichmentSuggestionInput {
	current = strings.TrimSpace(current)
	recommended = strings.TrimSpace(recommended)
	if recommended == "" || sameSuggestionValue(current, recommended) {
		return assetEnrichmentSuggestionInput{}
	}
	return assetEnrichmentSuggestionInput{
		TargetCollection: "assets",
		TargetRecord:     asset.Id,
		TargetField:      field,
		TargetLabel:      label,
		CurrentValue:     current,
		OnlineValue:      recommended,
		RecommendedValue: recommended,
		Source:           "online",
		Confidence:       confidence,
		Conflict:         current != "",
		Notes:            notes,
		Metadata: map[string]any{
			"field_scope":       metadataFieldScope(field),
			"sources":           assetOnlineSourceMetadataRows(sources),
			"source_urls":       assetOnlineSourceURLs(sources),
			"source_titles":     assetOnlineSourceTitles(sources),
			"source_types":      assetOnlineSourceTypes(sources),
			"source_image_urls": assetOnlineSourceImageURLs(sources),
			"source_provider":   assetOnlineSourceProviders(sources),
		},
	}
}

func metadataFieldScope(field string) string {
	if strings.HasPrefix(field, "metadata.") {
		return "metadata"
	}
	return "asset"
}

func inferAssetVendorFromOnlineSources(sources []assetOnlineSource) string {
	text := strings.ToLower(strings.Join(assetOnlineSourceTexts(sources), " "))
	vendors := []struct {
		match  []string
		vendor string
	}{
		{[]string{"xiaomi", "redmi", "mi.com", "小米"}, "小米 / Redmi"},
		{[]string{"apple.com", "iphone", "ipad", "apple"}, "Apple"},
		{[]string{"samsung", "galaxy"}, "Samsung"},
		{[]string{"lenovo", "thinkpad", "联想"}, "Lenovo"},
		{[]string{"asus", "华硕"}, "ASUS"},
		{[]string{"tp-link", "tplink"}, "TP-Link"},
		{[]string{"synology", "群晖"}, "Synology"},
		{[]string{"qnap"}, "QNAP"},
		{[]string{"unraid"}, "Unraid"},
		{[]string{"fnos", "飞牛"}, "飞牛"},
	}
	for _, item := range vendors {
		for _, token := range item.match {
			if strings.Contains(text, token) {
				return item.vendor
			}
		}
	}
	return ""
}

func inferAssetModelFromOnlineSources(asset *core.Record, sources []assetOnlineSource) string {
	if asset.GetString("model") != "" {
		return ""
	}
	candidates := nonEmptyStrings(recordMetadataString(asset, "internal_model"), asset.GetString("name"))
	for _, candidate := range candidates {
		normalized := normalizeOnlineModelCandidate(candidate)
		if normalized == "" {
			continue
		}
		for _, source := range sources {
			if assetSourceLooksRelevant(normalized, source.Title+" "+source.Snippet+" "+source.URL) {
				return normalized
			}
		}
	}
	return ""
}

type assetOnlineReferenceURLSuggestion struct {
	Field string
	Label string
	URL   string
	Notes string
}

func chooseAssetReferenceURLSuggestion(sources []assetOnlineSource) assetOnlineReferenceURLSuggestion {
	for _, source := range sources {
		if source.URL == "" || (source.Type != "official_support" && source.Type != "official_product") {
			continue
		}
		field, label := assetReferenceFieldForProvider(source.Provider)
		return assetOnlineReferenceURLSuggestion{
			Field: field,
			Label: label,
			URL:   source.URL,
			Notes: "优先选择官网、支持、规格、产品或说明书页面；写入前请确认页面确实对应这台资产。",
		}
	}
	for _, source := range sources {
		if source.URL == "" {
			continue
		}
		field, label := assetReferenceFieldForProvider(source.Provider)
		return assetOnlineReferenceURLSuggestion{
			Field: field,
			Label: label,
			URL:   source.URL,
			Notes: "该资料页可信度较低，只作为人工核对入口；写入前请确认页面确实对应这台资产。",
		}
	}
	return assetOnlineReferenceURLSuggestion{}
}

func assetReferenceFieldForProvider(provider string) (string, string) {
	switch strings.TrimSpace(provider) {
	case "product_url":
		return "product_url", "厂家官方产品页"
	case "official_url":
		return "official_url", "厂家官网资料页"
	default:
		return "support_url", "厂家官方支持页"
	}
}

func chooseAssetOfficialImageURL(sources []assetOnlineSource) string {
	for _, source := range sources {
		if source.ImageURL != "" && assetOnlineSourceHasOfficialAuthority(source) && isLikelyImageURL(source.ImageURL) {
			return source.ImageURL
		}
	}
	return ""
}

func normalizeOnlineModelCandidate(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	value = regexp.MustCompile(`(?i)([a-z]+)(\d)`).ReplaceAllString(value, "$1 $2")
	return cleanOnlineText(value)
}
