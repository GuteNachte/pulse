// This file was created by mechanically splitting internal/hub/asset_enrichment_online.go.
// All declarations below were moved verbatim from that file; there is no behavior change.
// Theme: AI request and response payload building and parsing.

package hub

import (
	"encoding/json"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

func normalizeAssetOnlineSourceLimit(value int) int {
	if value <= 0 {
		return assetOnlineSearchLimit
	}
	if value < 2 {
		return 2
	}
	if value > 10 {
		return 10
	}
	return value
}

func configBoolEnvDefault(key string, fallback bool) bool {
	value := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	switch value {
	case "true", "1", "yes", "on":
		return true
	case "false", "0", "no", "off":
		return false
	default:
		return fallback
	}
}

func configIntEnvDefault(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func safeAssetOnlineEndpointHost(raw string) string {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Host == "" {
		return ""
	}
	return parsed.Host
}

// 2026-10-09 小模型适配：Qwen3 系支持 /no_think 软开关关闭思考模式；并硬性约束"只输出
// 一个 JSON 对象"——防止 8B 级模型返回空对象 {} 或附加解释文字导致解析为 0 条。
const assetOnlineAISourceDiscoveryJSONHint = "\n/no_think 只输出一个 JSON 对象，不要任何解释、Markdown 或代码块；没有找到来源时也必须返回 {\"source_urls\":[]}。"

const assetOnlineAIExtractionJSONHint = "\n/no_think 只输出一个 JSON 对象，不要任何解释、Markdown 或代码块；没有可确认的参数时也必须返回 {\"suggestions\":[]}。"

func buildAssetOnlineAISourceDiscoveryPayload(asset *core.Record, model string, focus string, limit int) (map[string]any, error) {
	limit = normalizeAssetOnlineSourceLimit(limit)
	instruction := "你是 Pulse 资产中心的可信来源发现 Agent。你这一步只负责找到可追溯资料来源 URL，不要输出任何资产字段建议。优先级：1 厂商官网产品页、支持页、规格页、说明书、官方图片或官方 CDN；2 权威渠道；3 GSMArena、DeviceSpecifications、Kimovil 等规格库只做交叉验证；4 普通博客、电商、论坛只能作为低置信度线索。必须避免同系列不同型号、Pro/Ultra/电竞版等变体混入。返回严格 JSON：{\"source_urls\":[\"https://...\"]}，最多 5 个 URL。" + assetOnlineAISourceDiscoveryJSONHint
	if focus == "official_colors" {
		instruction = "你是 Pulse 资产中心的可信来源发现 Agent。你这一步只负责找到设备官方配色和官方外观图片相关的可追溯来源 URL，不要输出任何资产字段建议。优先级：1 厂商官网产品页、规格页、官方图片或官方 CDN；2 厂商支持页或说明书；3 权威规格库仅作交叉验证。普通博客、电商、论坛不能作为官方配色依据。必须避免同系列不同型号、Pro/Ultra/电竞版等变体混入。返回严格 JSON：{\"source_urls\":[\"https://...\"]}，最多 5 个 URL。" + assetOnlineAISourceDiscoveryJSONHint
	}
	return map[string]any{
		"model":       model,
		"temperature": 0,
		"messages": []map[string]string{
			{"role": "system", "content": instruction},
			{"role": "user", "content": mustJSON(map[string]any{
				"asset": map[string]any{
					"name":           asset.GetString("name"),
					"type":           asset.GetString("type"),
					"vendor":         asset.GetString("vendor"),
					"model":          asset.GetString("model"),
					"internal_model": recordMetadataString(asset, "internal_model"),
					"color":          firstNonEmpty(recordMetadataString(asset, "color"), recordMetadataString(asset, "device_color")),
				},
				"query": buildAssetOnlineSearchQuery(asset),
				"source_policy": map[string]any{
					"return_only_urls":  true,
					"max_urls":          limit,
					"preferred_sources": []string{"official product page", "official support page", "official specs page", "official manual", "official image or CDN image"},
					"reject":            []string{"untraceable content", "same-series but different variant", "blog or ecommerce claims when official source exists"},
				},
				"focus": focus,
			})},
		},
		"response_format": map[string]string{"type": "json_object"},
	}, nil
}

func buildAssetOnlineAIRequestPayload(asset *core.Record, sources []assetOnlineSource, model string, focus string) (map[string]any, error) {
	excerpts := make([]map[string]any, 0, len(sources))
	perSourceBudget := assetOnlineAIExcerptBudgetForSourceCount(len(sources))
	for _, source := range sources {
		text := buildAssetOnlineAIExcerpt(asset, source, focus, perSourceBudget)
		excerpts = append(excerpts, map[string]any{
			"title":      source.Title,
			"url":        source.URL,
			"type":       source.Type,
			"provider":   source.Provider,
			"confidence": source.Confidence,
			"image_url":  source.ImageURL,
			"excerpt":    text,
		})
	}
	allowedFields := assetEnrichmentAllowedMetadataFields(asset.GetString("type"), focus)
	instruction := "你是 Pulse 资产中心的资料补全 Agent。目标是为家庭资产管理补全长期可信的硬件主档。必须按可信来源优先级工作：1 厂商官网产品页、支持页、规格页、说明书、驱动页、官方图片或官方 CDN 图片；2 权威渠道或运营商资料；3 GSMArena、DeviceSpecifications、Kimovil 等规格库只做交叉验证；4 普通博客、电商、论坛只能作为低置信度线索，若已有官网来源则不要采用。若 sources 提供网页摘录，优先使用 sources；若 sources 为空且你的运行环境具备联网或检索能力，可以按厂商、型号、内部型号搜索上述可信来源。不要凭常识编造，不要把同系列其他变体写入当前设备。手机、平板等固定规格设备要尽量拆细处理器、GPU、内存、存储、屏幕、相机、电池、外观、网络、音频、传感器和官方图片。不要输出操作系统版本、固件版本、软件版本、APP 版本等会变动的软件参数。手机颜色必须提取完整官方配色列表，写入 colors_available，保留官方色名，不要改写成普通黑/白/蓝/银；如果无法确认全部官方配色，就不要输出 colors_available。official_image_url 必须尽量选择官网或官方 CDN 的真实设备图。返回严格 JSON：{\"suggestions\":[{\"field\":\"cpu_model\",\"label\":\"芯片 / SoC\",\"value\":\"...\",\"confidence\":0-100,\"notes\":\"...\",\"source_urls\":[\"...\"]}]}。field 只能从 allowed_fields 选择；value 必须短且可直接写入资产档案；每条建议必须有可追溯 source_urls，没有来源就不要输出。" + assetOnlineAIExtractionJSONHint
	if focus == "official_colors" {
		instruction = "你是 Pulse 资产中心的资料补全 Agent，这次任务只获取设备官方配色和官方设备图片，不补全其它规格。必须按可信来源优先级工作：1 厂商官网产品页、支持页、规格页、说明书、官方图片或官方 CDN 图片；2 权威渠道；3 规格库只做交叉验证；普通博客、电商、论坛不能作为官方配色依据。若 sources 提供网页摘录，优先使用 sources；若 sources 为空且运行环境具备联网或检索能力，可以按厂商、型号、内部型号搜索官网产品页和官方图片来源。必须输出完整官方配色列表到 colors_available，保留官方色名，不能改写成普通黑/白/蓝/银；如果无法确认完整官方配色列表，就不要输出 colors_available。official_image_url 必须是官网或官方 CDN 的真实设备图。返回严格 JSON：{\"suggestions\":[{\"field\":\"colors_available\",\"label\":\"官方配色\",\"value\":\"墨羽黑, 银迹, 幽芒\",\"confidence\":0-100,\"notes\":\"...\",\"source_urls\":[\"...\"]}]}。field 只能从 allowed_fields 选择；每条建议必须有可追溯 source_urls，没有来源就不要输出。" + assetOnlineAIExtractionJSONHint
	}
	return map[string]any{
		"model":       model,
		"temperature": 0.1,
		"messages": []map[string]string{
			{"role": "system", "content": instruction},
			{"role": "user", "content": mustJSON(map[string]any{
				"asset": map[string]any{
					"name":           asset.GetString("name"),
					"type":           asset.GetString("type"),
					"vendor":         asset.GetString("vendor"),
					"model":          asset.GetString("model"),
					"internal_model": recordMetadataString(asset, "internal_model"),
					"color":          firstNonEmpty(recordMetadataString(asset, "color"), recordMetadataString(asset, "device_color")),
					"support_url":    recordMetadataString(asset, "support_url"),
					"product_url":    recordMetadataString(asset, "product_url"),
					"official_url":   recordMetadataString(asset, "official_url"),
				},
				"allowed_fields": allowedFields,
				"focus":          focus,
				"source_policy": map[string]any{
					"trust_order":       []string{"manufacturer_official", "carrier_or_authoritative_channel", "trusted_spec_database_cross_check", "low_confidence_web_only_if_no_official_source"},
					"preferred_sources": []string{"official product page", "official support page", "official specs page", "official manual", "official driver or firmware page", "official image or CDN image"},
					"reject":            []string{"untraceable content", "same-series but different variant", "blog or ecommerce claims when official source exists"},
				},
				"sources": excerpts,
			})},
		},
		"response_format": map[string]string{"type": "json_object"},
	}, nil
}

func assetOnlineAIExcerptBudgetForSourceCount(sourceCount int) int {
	if sourceCount <= 1 {
		return assetOnlineAIExcerptMaxRunes
	}
	budget := assetOnlineAIExcerptBudget / sourceCount
	if budget < assetOnlineAIExcerptMinRunes {
		return assetOnlineAIExcerptMinRunes
	}
	if budget > assetOnlineAIExcerptMaxRunes {
		return assetOnlineAIExcerptMaxRunes
	}
	return budget
}

func buildAssetOnlineAIExcerpt(asset *core.Record, source assetOnlineSource, focus string, maxExcerptRunes int) string {
	if maxExcerptRunes <= 0 {
		maxExcerptRunes = assetOnlineAIExcerptMaxRunes
	}
	text := cleanOnlineText(firstNonEmpty(source.Text, source.Snippet))
	if len([]rune(text)) <= maxExcerptRunes {
		return text
	}
	keywords := assetOnlineAIExcerptKeywords(asset, focus)
	headRunes := assetOnlineAIExcerptHeadRunes
	if headRunes > maxExcerptRunes/2 {
		headRunes = maxExcerptRunes / 2
	}
	segments := []string{truncateRunes(text, headRunes)}
	for _, window := range assetOnlineKeywordWindows(text, keywords) {
		segments = append(segments, window.Text)
		combined := cleanOnlineText(strings.Join(dedupeStrings(segments), " "))
		if len([]rune(combined)) >= maxExcerptRunes {
			return truncateRunes(combined, maxExcerptRunes)
		}
	}
	combined := cleanOnlineText(strings.Join(dedupeStrings(segments), " "))
	if len([]rune(combined)) > 520 {
		return truncateRunes(combined, maxExcerptRunes)
	}
	return truncateRunes(text, maxExcerptRunes)
}

type assetOnlineIndexedText struct {
	Index int
	Text  string
}

func assetOnlineAIExcerptKeywords(asset *core.Record, focus string) []string {
	keywords := []string{
		"官方", "官网", "芯片", "soc", "cpu", "gpu", "处理器", "内存", "ram", "存储", "rom", "ufs",
		"屏幕", "显示", "分辨率", "刷新率", "亮度", "触控", "电池", "mah", "充电", "w", "相机", "摄像", "影像",
		"后置", "前置", "视频", "网络", "5g", "lte", "wi-fi", "wifi", "蓝牙", "nfc", "红外", "usb", "尺寸",
		"重量", "防水", "防尘", "ip", "扬声器", "音频", "传感器", "散热", "配色", "颜色", "color", "colour",
		"图片", "image", "cdn",
	}
	if focus == "official_colors" {
		keywords = []string{"官方", "官网", "配色", "颜色", "色", "color", "colour", "图片", "image", "cdn", "渲染图", "外观"}
	}
	for _, value := range []string{
		asset.GetString("vendor"),
		asset.GetString("model"),
		recordMetadataString(asset, "internal_model"),
		recordMetadataString(asset, "color"),
		recordMetadataString(asset, "device_color"),
	} {
		for _, token := range strings.Fields(strings.ToLower(value)) {
			if len([]rune(token)) >= 2 {
				keywords = append(keywords, token)
			}
		}
	}
	return dedupeStrings(keywords)
}

func assetOnlineKeywordWindows(text string, keywords []string) []assetOnlineIndexedText {
	lower := strings.ToLower(text)
	windows := make([]assetOnlineIndexedText, 0, len(keywords))
	seenBuckets := map[int]bool{}
	for _, keyword := range keywords {
		keyword = strings.ToLower(strings.TrimSpace(keyword))
		if keyword == "" {
			continue
		}
		byteIndex := strings.Index(lower, keyword)
		if byteIndex < 0 {
			continue
		}
		runeIndex := len([]rune(text[:byteIndex]))
		bucket := runeIndex / 120
		if seenBuckets[bucket] {
			continue
		}
		seenBuckets[bucket] = true
		windows = append(windows, assetOnlineIndexedText{
			Index: runeIndex,
			Text:  assetOnlineRuneWindow(text, runeIndex, 80, 260),
		})
	}
	sort.Slice(windows, func(i, j int) bool {
		return windows[i].Index < windows[j].Index
	})
	return windows
}

func assetOnlineRuneWindow(text string, center int, before int, after int) string {
	runes := []rune(text)
	start := center - before
	if start < 0 {
		start = 0
	}
	end := center + after
	if end > len(runes) {
		end = len(runes)
	}
	return cleanOnlineText(string(runes[start:end]))
}

func truncateRunes(value string, maxRunes int) string {
	runes := []rune(value)
	if maxRunes <= 0 || len(runes) <= maxRunes {
		return value
	}
	return string(runes[:maxRunes])
}

func mustJSON(value any) string {
	data, err := json.Marshal(value)
	if err != nil {
		return "{}"
	}
	return string(data)
}

func extractAssetOnlineAIContent(rawBody []byte) string {
	var response struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		OutputText string `json:"output_text"`
	}
	if err := json.Unmarshal(rawBody, &response); err == nil {
		if len(response.Choices) > 0 && strings.TrimSpace(response.Choices[0].Message.Content) != "" {
			return strings.TrimSpace(response.Choices[0].Message.Content)
		}
		if strings.TrimSpace(response.OutputText) != "" {
			return strings.TrimSpace(response.OutputText)
		}
	}
	return strings.TrimSpace(string(rawBody))
}

func extractAssetOnlineAISourceURLs(content string) []string {
	content = strings.TrimSpace(content)
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	var parsed struct {
		SourceURLs []string `json:"source_urls"`
		Sources    []struct {
			URL string `json:"url"`
		} `json:"sources"`
	}
	if err := json.Unmarshal([]byte(strings.TrimSpace(content)), &parsed); err != nil {
		return nil
	}
	urls := make([]string, 0, len(parsed.SourceURLs)+len(parsed.Sources))
	urls = append(urls, parsed.SourceURLs...)
	for _, source := range parsed.Sources {
		urls = append(urls, source.URL)
	}
	return normalizeAssetOnlineAISourceURLs(urls)
}

func (h *Hub) parseAssetOnlineAISuggestions(asset *core.Record, content string, sources []assetOnlineSource) []assetEnrichmentSuggestionInput {
	content = strings.TrimSpace(content)
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	var parsed struct {
		Suggestions []struct {
			Field      string   `json:"field"`
			Label      string   `json:"label"`
			Value      string   `json:"value"`
			Confidence int      `json:"confidence"`
			Notes      string   `json:"notes"`
			SourceURLs []string `json:"source_urls"`
		} `json:"suggestions"`
	}
	if err := json.Unmarshal([]byte(strings.TrimSpace(content)), &parsed); err != nil {
		return nil
	}
	if assetAISuggestionsVariantConflict(asset, parsed.Suggestions) {
		return nil
	}
	result := make([]assetEnrichmentSuggestionInput, 0, len(parsed.Suggestions))
	for _, item := range parsed.Suggestions {
		field := strings.TrimSpace(item.Field)
		if field == "" || !assetEnrichmentAllowedMetadataFieldSet(asset.GetString("type"))[field] {
			continue
		}
		value := cleanOnlineSpecValue(item.Value)
		if value == "" {
			continue
		}
		if field == "official_image_url" && !isLikelyImageURL(value) {
			continue
		}
		label := firstNonEmpty(strings.TrimSpace(item.Label), field)
		confidence := item.Confidence
		if confidence <= 0 || confidence > 100 {
			confidence = 64
		}
		sourceURLs := normalizeAssetOnlineAISourceURLs(item.SourceURLs)
		if len(sourceURLs) == 0 {
			continue
		}
		matchedSources := filterAssetOnlineSourcesByURLs(sources, sourceURLs)
		if len(matchedSources) == 0 {
			matchedSources = h.assetOnlineSourcesFromAIURLs(asset, sourceURLs)
		}
		if len(matchedSources) == 0 {
			continue
		}
		if assetAIFieldRequiresOfficialSource(field) && !assetOnlineSourcesHaveOfficialAuthority(matchedSources) {
			continue
		}
		if field == "official_image_url" && !assetOfficialImageSuggestionValueAllowed(value, matchedSources) {
			continue
		}
		confidence = capAssetAISuggestionConfidenceBySourceQuality(confidence, matchedSources)
		result = append(result, buildOnlineRecordSuggestion(asset, "metadata."+field, label, metadataValueString(asset, field), value, firstNonEmpty(item.Notes, "AI 结构化提取的联网资料建议，需人工确认后写入。"), matchedSources, confidence))
	}
	return result
}
