package hub

import (
	"fmt"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

func buildAssetImageCollectionPrompt(asset *core.Record, color string, frameCount int, references []map[string]any) string {
	referenceLines := make([]string, 0, len(references))
	for _, source := range references {
		if imageURL, _ := source["image_url"].(string); imageURL != "" {
			referenceLines = append(referenceLines, imageURL)
		}
	}
	return strings.Join(nonEmptyStrings(
		"Collect traceable device images for a home asset catalog.",
		"Device: "+strings.Join(nonEmptyStrings(asset.GetString("vendor"), asset.GetString("model"), recordMetadataString(asset, "internal_model"), asset.GetString("name")), " / "),
		assetVisualCollectionColorPrompt(color),
		fmt.Sprintf("Need up to %d real source images. Do not invent device appearance.", frameCount),
		"Traceable image URLs: "+strings.Join(referenceLines, " ; "),
	), "\n")
}

func assetVisualCollectionColorPrompt(color string) string {
	color = strings.TrimSpace(color)
	if color == "" {
		return "Color: not preselected. Collect candidates across official colors and keep every candidate labeled with its official color when known."
	}
	return "Color: " + color + ". Prefer candidates matching this selected official color."
}

func classifyAssetVisualOfficialColor(color string) string {
	text := normalizeAssetVisualMatchText(color)
	if text == "" {
		return "unknown"
	}
	for _, marker := range []string{"墨", "黑", "玄", "夜", "暗", "shadow", "black", "obsidian", "graphite", "midnight"} {
		if strings.Contains(text, marker) {
			return "dark"
		}
	}
	for _, marker := range []string{"白", "银", "雪", "月", "霜", "冰", "white", "silver", "pearl", "moon"} {
		if strings.Contains(text, marker) {
			return "light"
		}
	}
	for _, marker := range []string{"绿", "青", "翠", "幽芒", "green", "teal", "cyan"} {
		if strings.Contains(text, marker) {
			return "green"
		}
	}
	for _, marker := range []string{"紫", "藤", "violet", "purple", "lavender"} {
		if strings.Contains(text, marker) {
			return "purple"
		}
	}
	for _, marker := range []string{"蓝", "海", "sky", "blue"} {
		if strings.Contains(text, marker) {
			return "blue"
		}
	}
	for _, marker := range []string{"金", "黄", "橙", "gold", "yellow", "orange"} {
		if strings.Contains(text, marker) {
			return "gold"
		}
	}
	return "unknown"
}

func validateAssetVisualGenerationPrerequisites(asset *core.Record, color string, config assetVisualAIConfig) string {
	if strings.TrimSpace(asset.GetString("name")) == "" {
		return "收集候选图至少需要资产名称。"
	}
	return ""
}

func assetOfficialColorOptions(asset *core.Record) []string {
	raw := firstNonEmpty(recordMetadataString(asset, "colors_available"), recordMetadataString(asset, "official_colors"))
	return splitAssetColorOptions(raw)
}

func inferAssetVisualSourceColor(asset *core.Record, selectedColor string, context string) string {
	if strings.TrimSpace(selectedColor) != "" {
		return strings.TrimSpace(selectedColor)
	}
	normalizedContext := normalizeAssetVisualMatchText(context)
	if normalizedContext == "" {
		return ""
	}
	for _, option := range assetOfficialColorOptions(asset) {
		if key := normalizeAssetVisualMatchText(option); key != "" && strings.Contains(normalizedContext, key) {
			return option
		}
	}
	switch classifyAssetVisualOfficialColor(context) {
	case "dark":
		return "黑色系"
	case "light":
		return "银白色系"
	case "green":
		return "绿色系"
	case "purple":
		return "紫色系"
	case "blue":
		return "蓝色系"
	case "gold":
		return "金色系"
	default:
		return ""
	}
}

func splitAssetColorOptions(raw string) []string {
	value := strings.TrimSpace(raw)
	if value == "" {
		return nil
	}
	replacer := strings.NewReplacer("，", ",", "、", ",", "/", ",", "／", ",", "|", ",", "；", ",", ";", ",", "\n", ",")
	value = replacer.Replace(value)
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	seen := map[string]bool{}
	for _, part := range parts {
		item := strings.Trim(strings.TrimSpace(part), "[]【】()（）\"'")
		if item == "" {
			continue
		}
		key := normalizeAssetVisualMatchText(item)
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, item)
	}
	return result
}
