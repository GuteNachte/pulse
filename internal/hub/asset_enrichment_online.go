package hub

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"html"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/pocketbase/pocketbase/core"
)

const (
	assetOnlineSearchLimit        = 5
	assetOnlineAIModelMaxAttempts = 3
	assetOnlineAIExcerptMaxRunes  = 2200
	assetOnlineAIExcerptHeadRunes = 180
	assetOnlineAIExcerptMinRunes  = 600
	assetOnlineAIExcerptBudget    = 4800
)

var errAssetOnlineResponseTooLarge = errors.New("资料页超过抓取大小上限")

type assetOnlineEnrichmentResult struct {
	Query       string
	Status      string
	Providers   []string
	Sources     []assetOnlineSource
	Suggestions []assetEnrichmentSuggestionInput
	Discovery   assetOnlineAIResult
	AI          assetOnlineAIResult
	Errors      []string
}

type assetOnlineAIResult struct {
	Status      string
	Provider    string
	Model       string
	Attempts    int
	Suggestions int
	Error       string
}

type assetOnlineSource struct {
	Provider   string `json:"provider"`
	Type       string `json:"type"`
	Title      string `json:"title"`
	URL        string `json:"url"`
	ImageURL   string `json:"image_url,omitempty"`
	Snippet    string `json:"snippet"`
	Confidence int    `json:"confidence"`
	Text       string `json:"-"`
}

func (result assetOnlineEnrichmentResult) SourceSummary(detail string, asset *core.Record) map[string]any {
	status := firstNonEmpty(result.Status, "not_configured")
	sources := make([]map[string]any, 0, len(result.Sources))
	for _, source := range result.Sources {
		sources = append(sources, map[string]any{
			"provider":   source.Provider,
			"type":       source.Type,
			"title":      source.Title,
			"url":        source.URL,
			"image_url":  source.ImageURL,
			"snippet":    source.Snippet,
			"confidence": source.Confidence,
		})
	}
	return map[string]any{
		"status":    status,
		"detail":    detail,
		"query":     result.Query,
		"providers": result.Providers,
		"errors":    result.Errors,
		"sources":   sources,
		"input": map[string]any{
			"name":           asset.GetString("name"),
			"vendor":         asset.GetString("vendor"),
			"model":          asset.GetString("model"),
			"internal_model": recordMetadataString(asset, "internal_model"),
			"support_url":    recordMetadataString(asset, "support_url"),
			"product_url":    recordMetadataString(asset, "product_url"),
			"official_url":   recordMetadataString(asset, "official_url"),
		},
		"ai_extractor": map[string]any{
			"status":      result.AI.Status,
			"provider":    result.AI.Provider,
			"model":       result.AI.Model,
			"attempts":    result.AI.Attempts,
			"suggestions": result.AI.Suggestions,
			"error":       result.AI.Error,
		},
		"ai_source_discovery": map[string]any{
			"status":      result.Discovery.Status,
			"provider":    result.Discovery.Provider,
			"model":       result.Discovery.Model,
			"attempts":    result.Discovery.Attempts,
			"suggestions": result.Discovery.Suggestions,
			"error":       result.Discovery.Error,
		},
	}
}

func (result assetOnlineEnrichmentResult) ReportLine(fallback string) string {
	switch {
	case len(result.Sources) > 0:
		return "已查询 " + strings.Join(result.Providers, " / ") + "，命中 " + strconvItoa(len(result.Sources)) + " 个可追溯来源。"
	case result.AI.Status == "ready":
		return "资料补全 Agent 已根据资产线索生成可确认建议。"
	case result.AI.Status == "disabled":
		return "资料补全 Agent 未启用；未生成新的联网资料建议。"
	case result.AI.Status == "failed" && result.AI.Error != "":
		return "资料补全 Agent 未完成；" + result.AI.Error
	case len(result.Errors) > 0:
		return "资料补全未获得可用来源；" + strings.Join(result.Errors, "；")
	case result.Query != "":
		return "已生成资料补全线索；查询：" + result.Query
	default:
		return fallback
	}
}

func (h *Hub) collectAssetOnlineEnrichment(ctx context.Context, asset *core.Record, focus string) assetOnlineEnrichmentResult {
	result := h.collectAssetOnlineReferenceEnrichment(asset)
	config := h.assetOnlineAIConfig()
	if len(result.Sources) == 0 && config.SourceDiscoveryEnabled {
		discovery, discoveredSources, discoveryErrors := h.collectAssetOnlineAISourceDiscovery(ctx, asset, focus)
		result.Discovery = discovery
		result.Errors = append(result.Errors, discoveryErrors...)
		if len(discoveredSources) > 0 {
			result.Sources = discoveredSources
			result.Status = "ready"
			for _, source := range discoveredSources {
				result.Providers = appendProvider(result.Providers, source.Provider)
			}
		}
	}
	if len(result.Sources) > 0 {
		result.Suggestions = buildAssetOnlineSuggestions(asset, result.Sources, result.Query)
	}
	result.Suggestions = filterAssetEnrichmentSuggestionsByFocus(result.Suggestions, focus)
	aiResult, aiSuggestions := h.collectAssetOnlineAIEnrichment(ctx, asset, result.Sources, focus)
	result.AI = aiResult
	if len(aiSuggestions) > 0 {
		aiSuggestions = filterAssetEnrichmentSuggestionsByFocus(aiSuggestions, focus)
		result.Suggestions = append(result.Suggestions, aiSuggestions...)
		result.Providers = appendProvider(result.Providers, aiResult.Provider)
	}
	return result
}

func (h *Hub) collectAssetOnlineAISourceDiscovery(ctx context.Context, asset *core.Record, focus string) (assetOnlineAIResult, []assetOnlineSource, []string) {
	config := h.assetOnlineAIConfig()
	if !config.Enabled {
		return assetOnlineAIResult{Status: "disabled"}, nil, nil
	}
	result := assetOnlineAIResult{Status: "failed", Provider: config.Provider, Model: config.Model}
	if config.Endpoint == "" || config.APIKey == "" || config.Model == "" {
		result.Error = "AI 识别未配置 endpoint/api key/model"
		return result, nil, nil
	}
	limit := normalizeAssetOnlineSourceLimit(config.MaxSources)
	query := buildAssetOnlineSearchQuery(asset)
	if strings.TrimSpace(query) == "" {
		result.Error = "资产缺少厂商、型号或内部型号，无法发现可信来源"
		return result, nil, nil
	}
	payload, err := buildAssetOnlineAISourceDiscoveryPayload(asset, config.Model, focus, limit)
	if err != nil {
		result.Error = "AI 来源发现请求构造失败"
		return result, nil, nil
	}
	body, err := json.Marshal(payload)
	if err != nil {
		result.Error = "AI 来源发现请求编码失败"
		return result, nil, nil
	}
	rawBody, attempts, errMessage := callAssetOnlineAIModelContext(ctx, config, body)
	result.Attempts = attempts
	if errMessage != "" {
		result.Error = errMessage
		return result, nil, nil
	}
	sourceURLs := extractAssetOnlineAISourceURLs(extractAssetOnlineAIContent(rawBody))
	if len(sourceURLs) == 0 {
		result.Error = "AI 未返回可用来源 URL"
		return result, nil, nil
	}
	sources := h.assetOnlineSourcesFromAIURLs(asset, sourceURLs)
	sources = rankAssetOnlineSources(filterAssetOnlineSourcesByVariant(dedupeAssetOnlineSources(sources), asset), asset)
	if len(sources) > limit {
		sources = sources[:limit]
	}
	sources = h.enrichAssetOnlineSources(sources)
	if len(sources) == 0 {
		result.Error = "AI 返回的来源无法读取或与当前资产不匹配"
		return result, nil, []string{result.Error}
	}
	result.Status = "ready"
	result.Suggestions = len(sources)
	return result, sources, nil
}

func (h *Hub) collectAssetOnlineReferenceEnrichment(asset *core.Record) assetOnlineEnrichmentResult {
	query := buildAssetOnlineSearchQuery(asset)
	result := assetOnlineEnrichmentResult{
		Query:     query,
		Status:    "not_configured",
		Providers: []string{},
	}

	for _, input := range assetOnlineReferenceURLInputs(asset) {
		source, err := h.fetchAssetReferenceURLSource(input.URL, input.Provider)
		if err != nil {
			result.Errors = append(result.Errors, input.Label+"读取失败："+err.Error())
		} else if source.URL != "" {
			result.Sources = append(result.Sources, source)
			result.Providers = appendProvider(result.Providers, source.Provider)
		}
	}

	result.Sources = rankAssetOnlineSources(filterAssetOnlineSourcesByVariant(dedupeAssetOnlineSources(result.Sources), asset), asset)
	if len(result.Sources) > assetOnlineSearchLimit {
		result.Sources = result.Sources[:assetOnlineSearchLimit]
	}
	result.Sources = h.enrichAssetOnlineSources(result.Sources)
	if len(result.Sources) > 0 {
		result.Status = "ready"
	} else if query != "" {
		result.Status = "agent_pending"
	}
	return result
}

func (h *Hub) collectAssetOnlineAIEnrichment(ctx context.Context, asset *core.Record, sources []assetOnlineSource, focus string) (assetOnlineAIResult, []assetEnrichmentSuggestionInput) {
	config := h.assetOnlineAIConfig()
	if !config.Enabled {
		return assetOnlineAIResult{Status: "disabled"}, nil
	}
	result := assetOnlineAIResult{Status: "failed", Provider: config.Provider, Model: config.Model}
	if config.Endpoint == "" || config.APIKey == "" || config.Model == "" {
		result.Error = "AI 识别未配置 endpoint/api key/model"
		return result, nil
	}
	payload, err := buildAssetOnlineAIRequestPayload(asset, sources, config.Model, focus)
	if err != nil {
		result.Error = "AI 识别请求构造失败"
		return result, nil
	}
	body, err := json.Marshal(payload)
	if err != nil {
		result.Error = "AI 识别请求编码失败"
		return result, nil
	}
	rawBody, attempts, errMessage := callAssetOnlineAIModelContext(ctx, config, body)
	result.Attempts = attempts
	if errMessage != "" {
		result.Error = errMessage
		return result, nil
	}
	content := extractAssetOnlineAIContent(rawBody)
	suggestions := h.parseAssetOnlineAISuggestions(asset, content, sources)
	result.Status = "ready"
	result.Suggestions = len(suggestions)
	return result, suggestions
}

func callAssetOnlineAIModel(config assetOnlineAIConfig, body []byte) ([]byte, int, string) {
	return callAssetOnlineAIModelContext(context.Background(), config, body)
}

func callAssetOnlineAIModelContext(ctx context.Context, config assetOnlineAIConfig, body []byte) ([]byte, int, string) {
	if ctx == nil {
		ctx = context.Background()
	}
	client := &http.Client{Timeout: 75 * time.Second}
	var rawBody []byte
	var lastError string
	attempts := 0
	for attempt := 1; attempt <= assetOnlineAIModelMaxAttempts; attempt++ {
		if ctx.Err() != nil {
			return nil, attempts, "AI 识别请求已取消"
		}
		attempts = attempt
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, config.Endpoint, bytes.NewReader(body))
		if err != nil {
			return nil, attempts, "AI 识别请求创建失败"
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json")
		req.Header.Set("Authorization", "Bearer "+config.APIKey)

		resp, err := client.Do(req)
		if err != nil {
			if ctx.Err() != nil {
				return nil, attempts, "AI 识别请求已取消"
			}
			lastError = "AI 识别请求失败：" + err.Error()
			if attempt < assetOnlineAIModelMaxAttempts {
				if !waitForAssetOnlineAIRetry(ctx, assetOnlineAIRetryDelay(attempt, "")) {
					return nil, attempts, "AI 识别请求已取消"
				}
				continue
			}
			return nil, attempts, lastError
		}
		rawBody, err = io.ReadAll(io.LimitReader(resp.Body, 1024*1024))
		_ = resp.Body.Close()
		if err != nil {
			if ctx.Err() != nil {
				return nil, attempts, "AI 识别请求已取消"
			}
			lastError = "AI 识别响应读取失败"
			if attempt < assetOnlineAIModelMaxAttempts {
				if !waitForAssetOnlineAIRetry(ctx, assetOnlineAIRetryDelay(attempt, "")) {
					return nil, attempts, "AI 识别请求已取消"
				}
				continue
			}
			return nil, attempts, lastError
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			lastError = "AI 识别返回非成功状态：" + strconvItoa(resp.StatusCode) + formatRemoteErrorBody(rawBody)
			if attempt < assetOnlineAIModelMaxAttempts && isTransientAssetOnlineAIModelStatus(resp.StatusCode) {
				if !waitForAssetOnlineAIRetry(ctx, assetOnlineAIRetryDelay(attempt, resp.Header.Get("Retry-After"))) {
					return nil, attempts, "AI 识别请求已取消"
				}
				continue
			}
			return nil, attempts, lastError
		}
		return rawBody, attempts, ""
	}
	return rawBody, attempts, firstNonEmpty(lastError, "AI 识别请求失败")
}

func waitForAssetOnlineAIRetry(ctx context.Context, delay time.Duration) bool {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

func isTransientAssetOnlineAIModelStatus(status int) bool {
	return status == http.StatusTooManyRequests || status >= 500
}

func assetOnlineAIRetryDelay(attempt int, retryAfter string) time.Duration {
	if seconds, err := strconv.Atoi(strings.TrimSpace(retryAfter)); err == nil && seconds > 0 {
		delay := time.Duration(seconds) * time.Second
		if delay > 2*time.Second {
			return 2 * time.Second
		}
		return delay
	}
	if attempt <= 1 {
		return 150 * time.Millisecond
	}
	return 300 * time.Millisecond
}

type assetOnlineAIConfig struct {
	Enabled                bool
	Provider               string
	Endpoint               string
	APIKey                 string
	Model                  string
	SourceDiscoveryEnabled bool
	MaxSources             int
}

func assetOnlineAIConfigFromEnv() assetOnlineAIConfig {
	agnesKey := strings.TrimSpace(os.Getenv("PULSE_AGNES_API_KEY"))
	key := firstNonEmpty(strings.TrimSpace(os.Getenv("PULSE_ASSET_ENRICHMENT_AI_API_KEY")), agnesKey)
	provider := firstNonEmpty(strings.TrimSpace(os.Getenv("PULSE_ASSET_ENRICHMENT_AI_PROVIDER")), defaultAssetOnlineAIProvider(agnesKey))
	enabledEnv := strings.TrimSpace(strings.ToLower(os.Getenv("PULSE_ASSET_ENRICHMENT_AI_ENABLED")))
	enabled := key != ""
	if enabledEnv == "true" {
		enabled = true
	}
	if enabledEnv == "false" {
		enabled = false
	}
	return assetOnlineAIConfig{
		Enabled:                enabled,
		Provider:               provider,
		Endpoint:               firstNonEmpty(strings.TrimSpace(os.Getenv("PULSE_ASSET_ENRICHMENT_AI_ENDPOINT")), defaultAssetOnlineAIEndpoint(provider)),
		APIKey:                 key,
		Model:                  firstNonEmpty(strings.TrimSpace(os.Getenv("PULSE_ASSET_ENRICHMENT_AI_MODEL")), defaultAssetOnlineAIModel(provider)),
		SourceDiscoveryEnabled: configBoolEnvDefault("PULSE_ASSET_ENRICHMENT_AI_SOURCE_DISCOVERY_ENABLED", true),
		MaxSources:             normalizeAssetOnlineSourceLimit(configIntEnvDefault("PULSE_ASSET_ENRICHMENT_AI_MAX_SOURCES", assetOnlineSearchLimit)),
	}
}

func defaultAssetOnlineAIProvider(agnesKey string) string {
	if strings.TrimSpace(agnesKey) != "" {
		return "agnes"
	}
	return "openai-compatible"
}

func defaultAssetOnlineAIEndpoint(provider string) string {
	if strings.EqualFold(strings.TrimSpace(provider), "agnes") {
		return "https://apihub.agnes-ai.com/v1/chat/completions"
	}
	return "https://api.openai.com/v1/chat/completions"
}

func defaultAssetOnlineAIModel(provider string) string {
	if strings.EqualFold(strings.TrimSpace(provider), "agnes") {
		return "agnes-2.0-flash"
	}
	return ""
}

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

func buildAssetOnlineAISourceDiscoveryPayload(asset *core.Record, model string, focus string, limit int) (map[string]any, error) {
	limit = normalizeAssetOnlineSourceLimit(limit)
	instruction := "你是 Pulse 资产中心的可信来源发现 Agent。你这一步只负责找到可追溯资料来源 URL，不要输出任何资产字段建议。优先级：1 厂商官网产品页、支持页、规格页、说明书、官方图片或官方 CDN；2 权威渠道；3 GSMArena、DeviceSpecifications、Kimovil 等规格库只做交叉验证；4 普通博客、电商、论坛只能作为低置信度线索。必须避免同系列不同型号、Pro/Ultra/电竞版等变体混入。返回严格 JSON：{\"source_urls\":[\"https://...\"]}，最多 5 个 URL。"
	if focus == "official_colors" {
		instruction = "你是 Pulse 资产中心的可信来源发现 Agent。你这一步只负责找到设备官方配色和官方外观图片相关的可追溯来源 URL，不要输出任何资产字段建议。优先级：1 厂商官网产品页、规格页、官方图片或官方 CDN；2 厂商支持页或说明书；3 权威规格库仅作交叉验证。普通博客、电商、论坛不能作为官方配色依据。必须避免同系列不同型号、Pro/Ultra/电竞版等变体混入。返回严格 JSON：{\"source_urls\":[\"https://...\"]}，最多 5 个 URL。"
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
	allowedFields := []string{
		"cpu_model", "cpu_vendor", "cpu_process", "cpu_architecture", "cpu_cores", "cpu_frequency", "gpu_model",
		"gpu_detail", "memory_gb", "memory_detail", "memory_type", "storage_gb", "storage_detail", "storage_options",
		"screen_size", "display_type", "display_resolution", "screen_refresh_rate",
		"touch_sampling_rate", "display_brightness", "display_color_depth", "hdr_support", "display_protection",
		"battery_capacity_mah", "battery_type", "charging_power_w", "wireless_charging", "battery_life_note",
		"camera_summary", "rear_camera_detail", "rear_main_camera", "rear_ultrawide_camera", "rear_macro_camera",
		"rear_telephoto_camera", "front_camera_detail", "video_recording", "image_stabilization", "mobile_network",
		"sim_detail", "wifi_standard", "bluetooth_version", "positioning", "usb_detail", "nfc", "infrared",
		"dimensions", "weight", "body_material", "colors_available", "water_resistance", "speaker_detail",
		"audio_detail", "biometrics", "sensor_detail", "cooling_system", "official_image_url", "online_specs_summary",
		"support_url", "product_url", "official_url",
	}
	instruction := "你是 Pulse 资产中心的资料补全 Agent。目标是为家庭资产管理补全长期可信的硬件主档。必须按可信来源优先级工作：1 厂商官网产品页、支持页、规格页、说明书、驱动页、官方图片或官方 CDN 图片；2 权威渠道或运营商资料；3 GSMArena、DeviceSpecifications、Kimovil 等规格库只做交叉验证；4 普通博客、电商、论坛只能作为低置信度线索，若已有官网来源则不要采用。若 sources 提供网页摘录，优先使用 sources；若 sources 为空且你的运行环境具备联网或检索能力，可以按厂商、型号、内部型号搜索上述可信来源。不要凭常识编造，不要把同系列其他变体写入当前设备。手机、平板等固定规格设备要尽量拆细处理器、GPU、内存、存储、屏幕、相机、电池、外观、网络、音频、传感器和官方图片。不要输出操作系统版本、固件版本、软件版本、APP 版本等会变动的软件参数。手机颜色必须提取完整官方配色列表，写入 colors_available，保留官方色名，不要改写成普通黑/白/蓝/银；如果无法确认全部官方配色，就不要输出 colors_available。official_image_url 必须尽量选择官网或官方 CDN 的真实设备图。返回严格 JSON：{\"suggestions\":[{\"field\":\"cpu_model\",\"label\":\"芯片 / SoC\",\"value\":\"...\",\"confidence\":0-100,\"notes\":\"...\",\"source_urls\":[\"...\"]}]}。field 只能从 allowed_fields 选择；value 必须短且可直接写入资产档案；每条建议必须有可追溯 source_urls，没有来源就不要输出。"
	if focus == "official_colors" {
		allowedFields = []string{"colors_available", "official_image_url"}
		instruction = "你是 Pulse 资产中心的资料补全 Agent，这次任务只获取设备官方配色和官方设备图片，不补全其它规格。必须按可信来源优先级工作：1 厂商官网产品页、支持页、规格页、说明书、官方图片或官方 CDN 图片；2 权威渠道；3 规格库只做交叉验证；普通博客、电商、论坛不能作为官方配色依据。若 sources 提供网页摘录，优先使用 sources；若 sources 为空且运行环境具备联网或检索能力，可以按厂商、型号、内部型号搜索官网产品页和官方图片来源。必须输出完整官方配色列表到 colors_available，保留官方色名，不能改写成普通黑/白/蓝/银；如果无法确认完整官方配色列表，就不要输出 colors_available。official_image_url 必须是官网或官方 CDN 的真实设备图。返回严格 JSON：{\"suggestions\":[{\"field\":\"colors_available\",\"label\":\"官方配色\",\"value\":\"墨羽黑, 银迹, 幽芒\",\"confidence\":0-100,\"notes\":\"...\",\"source_urls\":[\"...\"]}]}。field 只能从 allowed_fields 选择；每条建议必须有可追溯 source_urls，没有来源就不要输出。"
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
		if field == "" || !allowedAssetEnrichmentMetadataFields[field] {
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

func assetAIFieldRequiresOfficialSource(field string) bool {
	switch strings.TrimSpace(field) {
	case "colors_available", "official_colors", "official_image_url", "support_url", "product_url", "official_url":
		return true
	default:
		return false
	}
}

func assetOnlineSourcesHaveOfficialAuthority(sources []assetOnlineSource) bool {
	for _, source := range sources {
		if assetOnlineSourceHasOfficialAuthority(source) {
			return true
		}
	}
	return false
}

func assetOfficialImageSuggestionValueAllowed(value string, sources []assetOnlineSource) bool {
	if !isLikelyImageURL(value) {
		return false
	}
	if classifyAssetOnlineURL(value) == "official_image" {
		return true
	}
	normalizedValue := normalizeAssetOnlineURLForComparison(value)
	for _, source := range sources {
		if !assetOnlineSourceHasOfficialAuthority(source) {
			continue
		}
		for _, candidate := range []string{source.ImageURL, source.URL} {
			if isLikelyImageURL(candidate) && normalizeAssetOnlineURLForComparison(candidate) == normalizedValue {
				return true
			}
		}
	}
	return false
}

func normalizeAssetOnlineURLForComparison(rawURL string) string {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return ""
	}
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return strings.ToLower(rawURL)
	}
	parsed.Fragment = ""
	parsed.Host = strings.ToLower(parsed.Host)
	parsed.Scheme = strings.ToLower(parsed.Scheme)
	return strings.ToLower(parsed.String())
}

func normalizeAssetOnlineAISourceURLs(urls []string) []string {
	result := make([]string, 0, len(urls))
	seen := map[string]bool{}
	for _, rawURL := range urls {
		rawURL = strings.TrimSpace(rawURL)
		if rawURL == "" {
			continue
		}
		parsed, err := url.Parse(rawURL)
		if err != nil || parsed.Scheme == "" || parsed.Host == "" {
			continue
		}
		if parsed.Scheme != "http" && parsed.Scheme != "https" {
			continue
		}
		parsed.Fragment = ""
		normalized := parsed.String()
		key := strings.ToLower(normalized)
		if seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, normalized)
	}
	return result
}

func capAssetAISuggestionConfidenceBySourceQuality(confidence int, sources []assetOnlineSource) int {
	if len(sources) == 0 {
		return 0
	}
	best := 0
	for _, source := range sources {
		capValue := 68
		switch source.Type {
		case "official_support", "official_product", "official_image":
			capValue = 96
		case "spec_database", "structured_profile":
			capValue = 82
		case "web_result":
			capValue = 70
		}
		if capValue > best {
			best = capValue
		}
	}
	if confidence > best {
		return best
	}
	if confidence <= 0 {
		return 50
	}
	return confidence
}

func assetAISuggestionsVariantConflict(asset *core.Record, suggestions []struct {
	Field      string   `json:"field"`
	Label      string   `json:"label"`
	Value      string   `json:"value"`
	Confidence int      `json:"confidence"`
	Notes      string   `json:"notes"`
	SourceURLs []string `json:"source_urls"`
}) bool {
	currentCPU := strings.ToLower(recordMetadataString(asset, "cpu_model"))
	if currentCPU == "" {
		return false
	}
	currentFamily := chipsetFamily(currentCPU)
	if currentFamily == "" {
		return false
	}
	for _, item := range suggestions {
		if strings.TrimSpace(item.Field) != "cpu_model" {
			continue
		}
		suggestedFamily := chipsetFamily(strings.ToLower(item.Value))
		if suggestedFamily != "" && suggestedFamily != currentFamily {
			return true
		}
	}
	return false
}

func chipsetFamily(value string) string {
	switch {
	case strings.Contains(value, "dimensity") || strings.Contains(value, "天玑") || strings.Contains(value, "mediatek"):
		return "mediatek-dimensity"
	case strings.Contains(value, "snapdragon") || strings.Contains(value, "骁龙") || strings.Contains(value, "qualcomm"):
		return "qualcomm-snapdragon"
	case strings.Contains(value, "apple a") || strings.Contains(value, "apple m"):
		return "apple-silicon"
	default:
		return ""
	}
}

func (h *Hub) assetOnlineSourcesFromAIURLs(asset *core.Record, urls []string) []assetOnlineSource {
	urls = normalizeAssetOnlineAISourceURLs(urls)
	result := make([]assetOnlineSource, 0, len(urls))
	for _, rawURL := range urls {
		rawURL = strings.TrimSpace(rawURL)
		if rawURL == "" {
			continue
		}
		source := assetOnlineSource{
			Provider:   "asset_agent",
			Type:       classifyAssetOnlineURL(rawURL),
			Title:      rawURL,
			URL:        rawURL,
			Snippet:    "资料补全 Agent 返回的可追溯来源。",
			Confidence: 68,
		}
		if isLikelyImageURL(rawURL) {
			source.ImageURL = rawURL
			if source.Type == "official_image" {
				source.Confidence = 86
			}
			result = append(result, source)
			continue
		}
		body, err := h.fetchAssetOnlineURL(rawURL, 512*1024)
		if err != nil {
			continue
		}
		title := extractHTMLTitle(body)
		if title != "" {
			source.Title = title
		}
		if parsed, err := url.Parse(rawURL); err == nil {
			source.Type = classifyFetchedAssetOnlineAIURL(parsed, source.Title)
		}
		source.Snippet = firstNonEmpty(extractMetaDescription(body), source.Snippet)
		if imageURL := extractMetaImageURL(body); imageURL != "" {
			if parsed, err := url.Parse(rawURL); err == nil {
				source.ImageURL = absolutizeAssetOnlineURL(parsed, imageURL)
			}
		}
		source.Text = extractAssetOnlinePageText(body)
		if parsed, err := url.Parse(rawURL); err == nil {
			if scriptText := h.extractAssetProductScriptText(parsed, body); scriptText != "" {
				source.Text = cleanOnlineText(source.Text + " " + scriptText)
				if len([]rune(source.Text)) > 18000 {
					source.Text = string([]rune(source.Text)[:18000])
				}
			}
		}
		if assetOnlineSourceVariantConflicts(asset, source) {
			continue
		}
		result = append(result, source)
	}
	return dedupeAssetOnlineSources(result)
}

func classifyFetchedAssetOnlineAIURL(parsed *url.URL, title string) string {
	sourceType := classifyAssetOnlineURL(parsed.String())
	if sourceType != "web_result" {
		return sourceType
	}
	host := strings.ToLower(strings.TrimSpace(parsed.Hostname()))
	if !isLocalAssetOnlineHost(host) {
		return sourceType
	}
	lowerTitle := strings.ToLower(strings.TrimSpace(title))
	if !assetOnlineTitleHasStrongOfficialSignal(lowerTitle) {
		return sourceType
	}
	lowerURL := strings.ToLower(parsed.String())
	if strings.Contains(lowerURL, "product") || strings.Contains(lowerURL, "spec") || strings.Contains(lowerURL, "manual") {
		return "official_product"
	}
	return "official_support"
}

func assetOnlineTitleHasStrongOfficialSignal(lowerTitle string) bool {
	for _, marker := range []string{"官方", "官网", "official"} {
		if strings.Contains(lowerTitle, marker) {
			return true
		}
	}
	return false
}

func isLocalAssetOnlineHost(host string) bool {
	host = strings.Trim(strings.ToLower(strings.TrimSpace(host)), "[]")
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}

func filterAssetOnlineSourcesByURLs(sources []assetOnlineSource, urls []string) []assetOnlineSource {
	if len(urls) == 0 {
		return nil
	}
	wanted := map[string]bool{}
	for _, rawURL := range urls {
		rawURL = strings.TrimSpace(strings.ToLower(rawURL))
		if rawURL != "" {
			wanted[rawURL] = true
		}
	}
	result := make([]assetOnlineSource, 0, len(sources))
	for _, source := range sources {
		if wanted[strings.ToLower(strings.TrimSpace(source.URL))] {
			result = append(result, source)
		}
	}
	return result
}

func buildAssetOnlineSearchQuery(asset *core.Record) string {
	parts := nonEmptyStrings(
		asset.GetString("vendor"),
		asset.GetString("model"),
		recordMetadataString(asset, "internal_model"),
	)
	if len(parts) == 0 {
		parts = append(parts, firstNonEmpty(asset.GetString("name"), asset.GetString("serial_number")))
	}
	if len(parts) == 0 {
		return ""
	}
	typeHint := asset.GetString("type")
	keywords := []string{"官方", "支持", "规格"}
	switch typeHint {
	case "phone", "tablet", "wearable", "handheld", "ereader":
		keywords = append(keywords, "参数")
	case "router", "switch", "ap", "gateway", "ont", "firewall":
		keywords = append(keywords, "固件", "说明书")
	case "physical_host", "nas", "server", "mini_pc", "vm":
		keywords = append(keywords, "驱动", "BIOS")
	}
	return strings.Join(append(parts, keywords...), " ")
}

type assetOnlineReferenceURLInput struct {
	Provider string
	Label    string
	URL      string
}

func assetOnlineReferenceURLInputs(asset *core.Record) []assetOnlineReferenceURLInput {
	candidates := []assetOnlineReferenceURLInput{
		{Provider: "support_url", Label: "厂家支持页", URL: recordMetadataString(asset, "support_url")},
		{Provider: "product_url", Label: "厂家产品页", URL: recordMetadataString(asset, "product_url")},
		{Provider: "official_url", Label: "厂家官网页", URL: recordMetadataString(asset, "official_url")},
	}
	result := make([]assetOnlineReferenceURLInput, 0, len(candidates))
	seen := map[string]bool{}
	for _, candidate := range candidates {
		rawURL := strings.TrimSpace(candidate.URL)
		if rawURL == "" {
			continue
		}
		parsed, err := url.Parse(rawURL)
		if err != nil || parsed.Scheme == "" || parsed.Host == "" {
			continue
		}
		parsed.Fragment = ""
		key := strings.ToLower(parsed.String())
		if seen[key] {
			continue
		}
		seen[key] = true
		candidate.URL = parsed.String()
		result = append(result, candidate)
	}
	return result
}

func (h *Hub) fetchAssetSupportURLSource(rawURL string) (assetOnlineSource, error) {
	return h.fetchAssetReferenceURLSource(rawURL, "support_url")
}

func (h *Hub) fetchAssetReferenceURLSource(rawURL string, provider string) (assetOnlineSource, error) {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return assetOnlineSource{}, err
	}
	provider = strings.TrimSpace(provider)
	if provider == "" {
		provider = "asset_master"
	}
	body, err := h.fetchAssetOnlineURL(parsed.String(), 512*1024)
	if err != nil {
		return assetOnlineSource{}, err
	}
	title := extractHTMLTitle(body)
	if title == "" {
		title = parsed.Host
	}
	pageText := extractAssetOnlinePageText(body)
	if scriptText := h.extractAssetProductScriptText(parsed, body); scriptText != "" {
		pageText = cleanOnlineText(pageText + " " + scriptText)
		if len([]rune(pageText)) > 18000 {
			pageText = string([]rune(pageText)[:18000])
		}
	}
	sourceType := classifyManualAssetSupportURL(parsed, title)
	confidence := 95
	snippet := firstNonEmpty(extractMetaDescription(body), "来自资产主档中手动填写的厂家资料页。")
	if sourceType != "official_support" && sourceType != "official_product" {
		confidence = 55
		snippet = firstNonEmpty(extractMetaDescription(body), "来自资产主档中手动填写的资料页，需确认是否为厂家官方来源。")
	}
	return assetOnlineSource{
		Provider:   provider,
		Type:       sourceType,
		Title:      title,
		URL:        parsed.String(),
		ImageURL:   absolutizeAssetOnlineURL(parsed, extractMetaImageURL(body)),
		Snippet:    snippet,
		Confidence: confidence,
		Text:       pageText,
	}, nil
}

func classifyManualAssetSupportURL(parsed *url.URL, title string) string {
	host := strings.TrimPrefix(strings.ToLower(parsed.Hostname()), "www.")
	lowerURL := strings.ToLower(parsed.String())
	lowerTitle := strings.ToLower(strings.TrimSpace(title))
	if assetOnlineLooksLowTrustManualReference(lowerURL + " " + lowerTitle) {
		return classifyAssetOnlineURL(parsed.String())
	}
	if isKnownOfficialAssetHost(host) {
		if strings.Contains(lowerURL, "product") || strings.Contains(lowerURL, "spec") || strings.Contains(lowerURL, "manual") {
			return "official_product"
		}
		return "official_support"
	}
	if assetOnlineTitleHasManualReferenceSignal(lowerTitle) {
		if strings.Contains(lowerURL, "product") || strings.Contains(lowerURL, "spec") || strings.Contains(lowerURL, "manual") {
			return "official_product"
		}
		return "official_support"
	}
	return classifyAssetOnlineURL(parsed.String())
}

func assetOnlineTitleHasManualReferenceSignal(lowerTitle string) bool {
	for _, marker := range []string{"官方", "官网", "official", "产品", "规格", "支持", "说明书", "驱动"} {
		if strings.Contains(lowerTitle, marker) {
			return true
		}
	}
	return false
}

func assetOnlineLooksLowTrustManualReference(text string) bool {
	for _, marker := range []string{
		"个人博客",
		"第三方",
		"普通网页",
		"普通博客",
		"评测",
		"论坛",
		"电商",
		"非官方",
		"blog",
		"review",
		"forum",
		"bbs",
		"mall",
		"shop",
		"store",
		"taobao",
		"jd.com",
	} {
		if strings.Contains(text, marker) {
			return true
		}
	}
	return false
}

func (h *Hub) extractAssetProductScriptText(base *url.URL, body string) string {
	scriptURLs := extractAssetProductScriptURLs(base, body)
	parts := make([]string, 0, len(scriptURLs))
	for _, scriptURL := range scriptURLs {
		js, err := h.fetchAssetOnlineURL(scriptURL, 1024*1024)
		if err != nil {
			continue
		}
		if text := extractAssetVueCompiledText(js); text != "" {
			parts = append(parts, text)
		}
		if len(parts) >= 2 {
			break
		}
	}
	return cleanOnlineText(strings.Join(parts, " "))
}

func extractAssetProductScriptURLs(base *url.URL, body string) []string {
	pattern := regexp.MustCompile(`(?is)<script[^>]+src=["']([^"']+)["'][^>]*>`)
	matches := pattern.FindAllStringSubmatch(body, -1)
	result := make([]string, 0, len(matches))
	for _, match := range matches {
		if len(match) < 2 {
			continue
		}
		raw := strings.TrimSpace(html.UnescapeString(match[1]))
		lower := strings.ToLower(raw)
		if !strings.Contains(lower, "/product/") && !strings.Contains(lower, "/spec") {
			continue
		}
		absolute := absolutizeAssetOnlineURL(base, raw)
		if absolute != "" {
			result = append(result, absolute)
		}
	}
	return dedupeStrings(result)
}

func extractAssetVueCompiledText(js string) string {
	pattern := regexp.MustCompile(`e\._v\("((?:\\.|[^"\\])*)"\)`)
	matches := pattern.FindAllStringSubmatch(js, -1)
	parts := make([]string, 0, len(matches))
	for _, match := range matches {
		if len(match) < 2 {
			continue
		}
		value, err := strconv.Unquote(`"` + match[1] + `"`)
		if err != nil {
			value = match[1]
		}
		value = cleanOnlineText(value)
		if value != "" {
			parts = append(parts, value)
		}
	}
	text := strings.Join(parts, "。 ")
	if len([]rune(text)) > 14000 {
		text = string([]rune(text)[:14000])
	}
	return cleanOnlineText(text)
}

func (h *Hub) fetchAssetOnlineURL(rawURL string, maxBytes int64) (string, error) {
	req, err := http.NewRequest(http.MethodGet, rawURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "text/html,application/json;q=0.9,*/*;q=0.8")
	req.Header.Set("User-Agent", "PulseAssetEnrichment/1.0")
	return h.doAssetOnlineRequest(req, maxBytes)
}

func (h *Hub) doAssetOnlineRequest(req *http.Request, maxBytes int64) (string, error) {
	client := &http.Client{Timeout: 6 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", http.ErrNotSupported
	}
	if contentType := strings.TrimSpace(resp.Header.Get("Content-Type")); contentType != "" && !isSupportedAssetOnlineContentType(contentType) {
		return "", errors.New("资料页类型不支持：" + contentType)
	}
	if maxBytes > 0 && resp.ContentLength > maxBytes {
		return "", errAssetOnlineResponseTooLarge
	}
	var reader io.Reader = resp.Body
	if maxBytes > 0 {
		reader = io.LimitReader(resp.Body, maxBytes+1)
	}
	body, err := io.ReadAll(reader)
	if err != nil {
		return "", err
	}
	if maxBytes > 0 && int64(len(body)) > maxBytes {
		return "", errAssetOnlineResponseTooLarge
	}
	return string(body), nil
}

func isSupportedAssetOnlineContentType(contentType string) bool {
	mediaType, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		mediaType = strings.TrimSpace(strings.Split(contentType, ";")[0])
	}
	mediaType = strings.ToLower(mediaType)
	if mediaType == "" {
		return true
	}
	if strings.HasPrefix(mediaType, "text/") {
		return true
	}
	switch mediaType {
	case "application/json", "application/ld+json", "application/javascript", "application/x-javascript", "application/ecmascript", "application/xhtml+xml":
		return true
	default:
		return strings.HasSuffix(mediaType, "+json")
	}
}

func (h *Hub) enrichAssetOnlineSources(sources []assetOnlineSource) []assetOnlineSource {
	for index := range sources {
		if sources[index].Text != "" || sources[index].URL == "" || !shouldFetchAssetOnlineSource(sources[index]) {
			continue
		}
		body, err := h.fetchAssetOnlineURL(sources[index].URL, 1024*1024)
		if err != nil {
			continue
		}
		if description := extractMetaDescription(body); description != "" && sources[index].Snippet == "" {
			sources[index].Snippet = description
		}
		if imageURL := extractMetaImageURL(body); imageURL != "" {
			if parsed, err := url.Parse(sources[index].URL); err == nil {
				sources[index].ImageURL = absolutizeAssetOnlineURL(parsed, imageURL)
			}
		}
		sources[index].Text = extractAssetOnlinePageText(body)
		if parsed, err := url.Parse(sources[index].URL); err == nil {
			if scriptText := h.extractAssetProductScriptText(parsed, body); scriptText != "" {
				sources[index].Text = cleanOnlineText(sources[index].Text + " " + scriptText)
				if len([]rune(sources[index].Text)) > 18000 {
					sources[index].Text = string([]rune(sources[index].Text)[:18000])
				}
			}
		}
		if title := extractHTMLTitle(body); title != "" {
			sources[index].Title = title
		}
	}
	return sources
}

func shouldFetchAssetOnlineSource(source assetOnlineSource) bool {
	if source.Type == "official_support" || source.Type == "official_product" {
		return true
	}
	lower := strings.ToLower(source.URL)
	return strings.Contains(lower, "devicespecifications") ||
		strings.Contains(lower, "kimovil") ||
		strings.Contains(lower, "gsmarena") ||
		strings.Contains(lower, "mi.com") ||
		strings.Contains(lower, "support") ||
		strings.Contains(lower, "spec")
}

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
	if note := buildAssetOnlineMatchNote(sources, query); note != "" {
		suggestions = append(suggestions, buildOnlineRecordSuggestion(asset, "metadata.hardware_match_note", "联网资料匹配备注", recordMetadataString(asset, "hardware_match_note"), note, "记录本次联网资料来源，作为后续人工核对依据。", sources, 62))
	}
	return suggestions
}

type assetOnlineSpecExtraction struct {
	Items   []assetOnlineSpecItem
	Summary string
	Sources []assetOnlineSource
}

type assetOnlineSpecItem struct {
	Field      string
	Label      string
	Value      string
	Notes      string
	Confidence int
	Sources    []assetOnlineSource
}

func extractAssetOnlineSpecs(asset *core.Record, sources []assetOnlineSource) assetOnlineSpecExtraction {
	textSources := make([]assetOnlineSource, 0, len(sources))
	for _, source := range sources {
		if strings.TrimSpace(source.Text+" "+source.Snippet+" "+source.Title) != "" {
			textSources = append(textSources, source)
		}
	}
	combined := cleanOnlineText(strings.Join(assetOnlineSourceTexts(textSources), " "))
	if combined == "" {
		return assetOnlineSpecExtraction{}
	}
	specs := assetOnlineSpecExtraction{Sources: textSources}
	add := func(field string, label string, value string, confidence int, notes string) {
		value = cleanOnlineSpecValue(value)
		if value == "" || containsSpecItem(specs.Items, field, value) {
			return
		}
		specs.Items = append(specs.Items, assetOnlineSpecItem{
			Field:      field,
			Label:      label,
			Value:      value,
			Notes:      notes,
			Confidence: confidence,
			Sources:    textSources,
		})
	}

	if value := firstRegexCapture(combined, `(?i)\b(Wi[- ]?Fi\s*(?:4|5|6E?|7|802\.11[a-z/]+))\b`); value != "" {
		add("wifi_standard", "无线标准", value, 66, "联网资料提取到的无线规格。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(Bluetooth\s*\d(?:\.\d)?)\b`); value != "" {
		add("bluetooth_version", "蓝牙版本", value, 64, "联网资料提取到的蓝牙规格。")
	}
	if value := firstRegexCapture(combined, `(?:蓝牙|Bluetooth)\s*(\d(?:\.\d)?)`); value != "" {
		add("bluetooth_version", "蓝牙版本", "Bluetooth "+value, 64, "联网资料提取到的蓝牙规格。")
	}
	if value := firstRegexCapture(combined, `(?i)\b((?:MediaTek\s*)?Dimensity\s*\d{3,5}|Snapdragon\s*\d(?:\s*\w+)?|Apple\s*A\d{1,2}|Exynos\s*\d{3,5})\b`); value != "" {
		add("cpu_model", "芯片 / SoC", value, 72, "联网资料提取到的 SoC 线索。")
	}
	if value := firstRegexCapture(combined, `(天玑\s*\d{3,5}|骁龙\s*\d(?:\s*\w+)?|麒麟\s*\d{3,5})`); value != "" {
		add("cpu_model", "芯片 / SoC", value, 72, "联网资料提取到的 SoC 线索。")
	}
	if value := inferCPUVendorFromSpecs(combined); value != "" {
		add("cpu_vendor", "芯片厂商", value, 58, "联网资料提取到的芯片厂商线索。")
	}
	if value := firstRegexCapture(combined, `(?:工艺制程[:：]?\s*)?((?:台积电|TSMC)?\s*\d+\s*nm)`); value != "" {
		add("cpu_process", "制程 / 架构", value, 58, "联网资料提取到的芯片制程线索。")
	}
	if value := firstRegexCapture(combined, `CPU架构[:：]?\s*([^。；,，]{0,80}(?:Cortex|A78|A55|X\d)[^。；,，]{0,80})`); value != "" {
		add("cpu_architecture", "CPU 架构", value, 58, "联网资料提取到的 CPU 架构线索。")
	}
	if value := firstRegexCapture(combined, `(八核处理器|六核处理器|四核处理器|十核处理器|\d+\s*核处理器|\d+\s*cores?)`); value != "" {
		add("cpu_cores", "CPU 核心", value, 56, "联网资料提取到的 CPU 核心数线索。")
	}
	if value := firstRegexCapture(combined, `(?i)(?:最高主频可达|最高频率|up to)\s*([\d.]+\s*GHz)`); value != "" {
		add("cpu_frequency", "CPU 频率", value, 56, "联网资料提取到的 CPU 频率线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(Mali[- ]?[A-Za-z0-9]+|Adreno\s*\d{3,4}|Apple\s*GPU|Immortalis[- ]?[A-Za-z0-9]+)\b`); value != "" {
		add("gpu_model", "GPU", value, 58, "联网资料提取到的 GPU 线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b((?:Mali[- ]?[A-Za-z0-9]+|Adreno\s*\d{3,4})[^。；,，]{0,24}(?:六核|四核|core|cores))`); value != "" {
		add("gpu_detail", "GPU 详情", value, 56, "联网资料提取到的 GPU 详情线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(\d+(?:\.\d+)?\s*(?:inch|英寸)[^。；,，]{0,32}(?:OLED|AMOLED|LCD|屏|display|screen)?)`); value != "" {
		add("screen_size", "屏幕 / 尺寸", value, 68, "联网资料提取到的屏幕规格。")
	}
	if value := firstRegexCapture(combined, `尺寸[:：]?\s*(\d+(?:\.\d+)?\s*英寸)`); value != "" {
		add("screen_size", "屏幕 / 尺寸", value, 68, "联网资料提取到的屏幕尺寸。")
	}
	if value := firstRegexCapture(combined, `(2K[^。；,，]{0,24}(?:直屏|屏幕|屏))`); value != "" {
		add("screen_size", "屏幕 / 尺寸", value, 68, "联网资料提取到的屏幕规格。")
	}
	if value := extractDisplayTypeSpec(combined, asset.GetString("type")); value != "" {
		add("display_type", "屏幕类型", value, 58, "联网资料提取到的屏幕面板类型。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(\d{3,4}\s*x\s*\d{3,4}\s*(?:pixels|px|像素)?)\b`); value != "" {
		add("display_resolution", "屏幕分辨率", value, 62, "联网资料提取到的屏幕分辨率线索。")
	}
	if value := firstRegexCapture(combined, `分辨率[:：]?\s*(\d{3,4}\s*[*xX]\s*\d{3,4}(?:（2K）|\(2K\)|\s*2K)?)`); value != "" {
		add("display_resolution", "屏幕分辨率", value, 62, "联网资料提取到的屏幕分辨率线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(\d{2,3}\s*Hz)\s*(?:刷新率|refresh|screen|display|屏)`); value != "" {
		add("screen_refresh_rate", "屏幕刷新率", value, 62, "联网资料提取到的刷新率线索。")
	}
	if value := firstRegexCapture(combined, `(?:显示帧率|刷新率)[:：]?\s*(?:最高\s*)?(\d{2,3}\s*Hz)`); value != "" {
		add("screen_refresh_rate", "屏幕刷新率", value, 62, "联网资料提取到的刷新率线索。")
	}
	if value := firstRegexCapture(combined, `触控采样率[:：]?\s*(?:最高\s*)?(\d{2,4}\s*Hz)`); value != "" {
		add("touch_sampling_rate", "触控采样率", value, 58, "联网资料提取到的触控采样率线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(\d{3,4}\s*nits?)\b`); value != "" {
		add("display_brightness", "屏幕亮度", value, 56, "联网资料提取到的屏幕亮度线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b((?:8|10|12)\s*bit[^。；,，]{0,40}(?:DCI-P3|P3|色彩)|DCI-P3[^。；,，]{0,32})`); value != "" {
		add("display_color_depth", "色深 / 色彩", value, 54, "联网资料提取到的显示色彩线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(HDR10(?:/10\+)?[^。；,，]{0,40}|Dolby Vision|杜比视界)`); value != "" {
		add("hdr_support", "HDR", value, 54, "联网资料提取到的 HDR 线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(Corning\s+Gorilla\s+Glass[^。；,，]{0,32}|Gorilla\s+Glass[^。；,，]{0,32})`); value != "" {
		add("display_protection", "屏幕保护", value, 54, "联网资料提取到的屏幕保护玻璃线索。")
	}
	if value := firstRegexCapture(combined, `(康宁[^。；,，]{0,32}玻璃[^。；,，]{0,32}|Victus[^。；,，]{0,24})`); value != "" {
		add("display_protection", "屏幕保护", value, 54, "联网资料提取到的屏幕保护玻璃线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(\d{3,5}\s*mAh)\b`); value != "" {
		add("battery_capacity_mah", "电池容量", value, 70, "联网资料提取到的电池容量。")
	}
	if value := firstRegexCapture(combined, `(锂离子电池|锂聚合物电池|双电芯|single-cell|dual-cell|Li-Po|Li-Ion)`); value != "" {
		add("battery_type", "电池类型", value, 54, "联网资料提取到的电池类型线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(\d{2,3}\s*W)\s*(?:快充|charging|charge|充电)`); value != "" {
		add("charging_power_w", "充电功率", value, 67, "联网资料提取到的充电规格。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(\d{1,3}\s*W\s*(?:wireless charging|无线充电)|wireless charging|无线充电)\b`); value != "" {
		add("wireless_charging", "无线充电", value, 52, "联网资料提取到的无线充电线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b((?:\d{1,3}\s*MP|[一二三四五六七八九十百千万0-9]+\s*万像素)[^。；]{0,40}(?:camera|摄像|相机|主摄))`); value != "" {
		add("camera_summary", "摄像头摘要", value, 62, "联网资料提取到的摄像头线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b((?:rear|后置)[^。；,，]{0,80}(?:camera|摄像|相机|MP|万像素))`); value != "" {
		add("rear_camera_detail", "后置影像", value, 58, "联网资料提取到的后置影像线索。")
	}
	if value := firstRegexCapture(combined, `(4800\s*万像素主摄[^。；]{0,120}|主摄[:：]\s*[^。；]{0,120})`); value != "" {
		add("rear_main_camera", "主摄", value, 58, "联网资料提取到的主摄规格线索。")
	}
	if value := firstRegexCapture(combined, `(800\s*万\s*像素超广角镜头[^。；]{0,80}|超广角镜头[:：]?\s*[^。；]{0,80})`); value != "" {
		add("rear_ultrawide_camera", "超广角", value, 56, "联网资料提取到的超广角规格线索。")
	}
	if value := firstRegexCapture(combined, `(200\s*万\s*像素微距镜头[^。；]{0,80}|微距镜头[:：]?\s*[^。；]{0,80})`); value != "" {
		add("rear_macro_camera", "微距", value, 54, "联网资料提取到的微距规格线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b((?:front|前置)[^。；,，]{0,80}(?:camera|摄像|相机|MP|万像素))`); value != "" {
		add("front_camera_detail", "前置影像", value, 58, "联网资料提取到的前置影像线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(4K[^。；,，]{0,32}(?:video|视频|recording)|1080p[^。；,，]{0,32}(?:video|视频|recording))`); value != "" {
		add("video_recording", "视频规格", value, 52, "联网资料提取到的视频规格线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(\d+\s*GB\s*(?:RAM|内存))\b`); value != "" {
		add("memory_detail", "内存规格", value, 60, "联网资料提取到的内存容量线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(\d+\s*GB\s*(?:ROM|storage|存储))\b`); value != "" {
		add("storage_gb", "存储 GB", value, 58, "联网资料提取到的存储容量线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(UFS\s*\d(?:\.\d)?|NVMe|eMMC\s*\d(?:\.\d)?)\b`); value != "" {
		add("storage_detail", "存储规格", value, 56, "联网资料提取到的存储规格线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(LPDDR\dX?|LPDDR\d)\b`); value != "" {
		add("memory_type", "内存类型", value, 54, "联网资料提取到的内存类型线索。")
	}
	if value := firstRegexCapture(combined, `\b(\d{2,4}(?:\.\d+)?(?:\s+g|克))\b`); value != "" {
		add("weight", "重量", value, 56, "联网资料提取到的重量线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?\s*mm)\b`); value != "" {
		add("dimensions", "机身尺寸", value, 56, "联网资料提取到的尺寸线索。")
	}
	if value := extractMobileNetworkSpec(combined); value != "" {
		add("mobile_network", "蜂窝网络", value, 54, "联网资料提取到的网络制式线索。")
	}
	if value := firstRegexCapture(combined, `\b((?:Nano-)?SIM(?:\s*卡| card| slot| tray| 双卡| 单卡)?[^。；,，]{0,48}|双卡[^。；,，]{0,24}|SIM卡[^。；,，]{0,24})`); value != "" {
		add("sim_detail", "SIM / 卡槽", value, 54, "联网资料提取到的 SIM 或卡槽线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(GPS(?:\s+(?:GLONASS|Galileo|BeiDou|北斗))*)\b`); value != "" {
		add("positioning", "定位系统", value, 52, "联网资料提取到的定位系统线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(USB[- ]?C[^。；,，]{0,32}|USB\s*Type[- ]?C[^。；,，]{0,32})`); value != "" {
		add("usb_detail", "USB / 接口", value, 54, "联网资料提取到的接口线索。")
	}
	if strings.Contains(strings.ToLower(combined), "nfc") || strings.Contains(combined, "多功能NFC") {
		add("nfc", "NFC", "支持 NFC", 54, "联网资料提取到的 NFC 线索。")
	}
	if strings.Contains(combined, "红外") || strings.Contains(strings.ToLower(combined), "infrared") {
		add("infrared", "红外", "支持红外", 54, "联网资料提取到的红外线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(IP\d{2})\b`); value != "" {
		add("water_resistance", "防尘防水", value, 52, "联网资料提取到的防尘防水等级线索。")
	}
	if value := firstRegexCapture(combined, `(立体声双扬声器|双扬声器|stereo speakers?|Hi-Res[^。；,，]{0,24})`); value != "" {
		add("speaker_detail", "扬声器 / 音频", value, 50, "联网资料提取到的音频规格线索。")
	}
	if value := firstRegexCapture(combined, `(Hi-Res[^。；]{0,80}|杜比全景声|Dolby Atmos[^。；,，]{0,32})`); value != "" {
		add("audio_detail", "音频详情", value, 50, "联网资料提取到的音频认证或音效线索。")
	}
	if strings.Contains(combined, "OIS光学防抖") || strings.Contains(strings.ToLower(combined), "ois") {
		add("image_stabilization", "防抖 / 对焦", "OIS 光学防抖", 52, "联网资料提取到的影像防抖线索。")
	}
	if value := firstRegexCapture(combined, `(VC\s*液冷散热|液冷散热[^。；,，]{0,24}|均热板[^。；,，]{0,24})`); value != "" {
		add("cooling_system", "散热", value, 50, "联网资料提取到的散热结构线索。")
	}
	if value := firstRegexCapture(combined, `(指纹识别|屏下指纹|侧边指纹|陀螺仪|距离传感器|环境光传感器|加速度传感器)[^。；,，]{0,48}`); value != "" {
		add("sensor_detail", "传感器", value, 50, "联网资料提取到的传感器线索。")
	}

	specs.Summary = buildOnlineSpecsSummary(specs.Items)
	return specs
}

func containsSpecItem(items []assetOnlineSpecItem, field string, value string) bool {
	for _, item := range items {
		if item.Field == field || sameSuggestionValue(item.Value, value) {
			return true
		}
	}
	return false
}

func buildOnlineSpecsSummary(items []assetOnlineSpecItem) string {
	if len(items) == 0 {
		return ""
	}
	parts := make([]string, 0, len(items))
	for _, item := range items {
		parts = append(parts, item.Label+"："+item.Value)
		if len(parts) >= 10 {
			break
		}
	}
	return strings.Join(parts, "\n")
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

func chooseAssetSupportURL(sources []assetOnlineSource) string {
	for _, source := range sources {
		if source.URL != "" && (source.Type == "official_support" || source.Type == "official_product") {
			return source.URL
		}
	}
	for _, source := range sources {
		if source.URL != "" {
			return source.URL
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

func assetOnlineSourceHasOfficialAuthority(source assetOnlineSource) bool {
	switch source.Type {
	case "official_support", "official_product", "official_image":
		return true
	default:
		return false
	}
}

func buildAssetOnlineMatchNote(sources []assetOnlineSource, query string) string {
	if len(sources) == 0 {
		return ""
	}
	parts := []string{"联网查询：" + query}
	for index, source := range sources {
		if index >= 3 {
			break
		}
		parts = append(parts, source.Provider+" · "+source.Title+" · "+source.URL)
	}
	return strings.Join(parts, "\n")
}

func rankAssetOnlineSources(sources []assetOnlineSource, asset *core.Record) []assetOnlineSource {
	for index := range sources {
		sources[index].Confidence += vendorDomainBonus(asset.GetString("vendor"), sources[index].URL)
		sources[index].Confidence += sourceTypeBonus(sources[index].Type)
		if sources[index].Confidence > 98 {
			sources[index].Confidence = 98
		}
	}
	sort.SliceStable(sources, func(i, j int) bool {
		return sources[i].Confidence > sources[j].Confidence
	})
	return sources
}

func filterAssetOnlineSourcesByVariant(sources []assetOnlineSource, asset *core.Record) []assetOnlineSource {
	result := make([]assetOnlineSource, 0, len(sources))
	for _, source := range sources {
		if source.Provider != "support_url" && assetOnlineSourceVariantConflicts(asset, source) {
			continue
		}
		result = append(result, source)
	}
	return result
}

func assetOnlineSourceVariantConflicts(asset *core.Record, source assetOnlineSource) bool {
	expected := strings.ToLower(strings.Join(nonEmptyStrings(
		asset.GetString("name"),
		asset.GetString("model"),
		recordMetadataString(asset, "internal_model"),
	), " "))
	if expected == "" {
		return false
	}
	text := strings.ToLower(source.Title + " " + source.Snippet + " " + source.URL)
	variants := []string{"ultra", "gaming", "game edition", "extreme", "pro", "至尊", "电竞", "冠军"}
	for _, variant := range variants {
		if assetOnlineTextHasVariant(text, variant) && !assetOnlineTextHasVariant(expected, variant) {
			return true
		}
	}
	return false
}

func assetOnlineTextHasVariant(text string, variant string) bool {
	text = strings.ToLower(strings.TrimSpace(text))
	variant = strings.ToLower(strings.TrimSpace(variant))
	if text == "" || variant == "" {
		return false
	}
	if hasChineseRune(variant) {
		return strings.Contains(text, variant)
	}
	pattern := regexp.MustCompile(`(^|[^a-z0-9])` + regexp.QuoteMeta(variant) + `([^a-z0-9]|$)`)
	return pattern.MatchString(text)
}

func hasChineseRune(value string) bool {
	for _, r := range value {
		if unicode.Is(unicode.Han, r) {
			return true
		}
	}
	return false
}

func dedupeAssetOnlineSources(sources []assetOnlineSource) []assetOnlineSource {
	seen := map[string]bool{}
	result := make([]assetOnlineSource, 0, len(sources))
	for _, source := range sources {
		source.URL = strings.TrimSpace(source.URL)
		source.Title = cleanOnlineText(source.Title)
		source.Snippet = cleanOnlineText(source.Snippet)
		if source.URL == "" || source.Title == "" {
			continue
		}
		key := strings.ToLower(source.URL)
		if seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, source)
	}
	return result
}

func appendProvider(providers []string, provider string) []string {
	provider = strings.TrimSpace(provider)
	if provider == "" {
		return providers
	}
	for _, existing := range providers {
		if existing == provider {
			return providers
		}
	}
	return append(providers, provider)
}

func classifyAssetOnlineURL(rawURL string) string {
	lower := strings.ToLower(strings.TrimSpace(rawURL))
	parsed, err := url.Parse(lower)
	host := ""
	if err == nil {
		host = strings.TrimPrefix(parsed.Hostname(), "www.")
	}
	switch {
	case strings.Contains(lower, "devicespecifications") || strings.Contains(lower, "kimovil") || strings.Contains(lower, "gsmarena"):
		return "spec_database"
	case isKnownOfficialAssetHost(host) && isLikelyImageURL(lower):
		return "official_image"
	case isKnownOfficialAssetHost(host) && (strings.Contains(lower, "support") || strings.Contains(lower, "download") || strings.Contains(lower, "driver")):
		return "official_support"
	case isKnownOfficialAssetHost(host) && (strings.Contains(lower, "product") || strings.Contains(lower, "spec") || strings.Contains(lower, "manual")):
		return "official_product"
	default:
		return "web_result"
	}
}

func isKnownOfficialAssetHost(host string) bool {
	host = strings.ToLower(strings.TrimSpace(host))
	if host == "" {
		return false
	}
	officialMarkers := []string{
		"mi.com",
		"mi-img.com",
		"mifile.cn",
		"xiaomi.com",
		"redmi.com",
		"apple.com",
		"samsung.com",
		"lenovo.com",
		"asus.com",
		"tp-link.com",
		"tplinkcloud.com",
		"synology.com",
		"qnap.com",
		"unraid.net",
		"fnos.com",
		"huawei.com",
		"honor.com",
		"oppo.com",
		"vivo.com",
		"iqoo.com",
		"oneplus.com",
		"realme.com",
		"sony.com",
		"dell.com",
		"hp.com",
		"acer.com",
		"msi.com",
		"intel.com",
		"amd.com",
		"nvidia.com",
		"nintendo.com",
		"playstation.com",
		"xbox.com",
		"aqara.com",
		"yeelight.com",
		"roborock.com",
		"ecovacs.com",
		"philips-hue.com",
		"ikea.com",
	}
	for _, marker := range officialMarkers {
		if host == marker || strings.HasSuffix(host, "."+marker) {
			return true
		}
	}
	return false
}

func sourceTypeBonus(sourceType string) int {
	switch sourceType {
	case "official_support":
		return 22
	case "official_image":
		return 20
	case "official_product":
		return 18
	case "spec_database":
		return 3
	case "structured_profile":
		return 5
	default:
		return -4
	}
}

func vendorDomainBonus(vendor string, rawURL string) int {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || parsed.Host == "" {
		return 0
	}
	vendorText := strings.ToLower(vendor)
	host := strings.ToLower(parsed.Host)
	if (strings.Contains(vendorText, "xiaomi") || strings.Contains(vendorText, "redmi") || strings.Contains(vendorText, "小米")) &&
		(strings.Contains(host, "mi.com") || strings.Contains(host, "xiaomi.com") || strings.Contains(host, "redmi.com")) {
		return 8
	}
	officialHosts := []string{"apple.com", "samsung.com", "lenovo.com", "asus.com", "tp-link.com", "synology.com"}
	for _, officialHost := range officialHosts {
		if strings.Contains(host, officialHost) {
			return 8
		}
	}
	if strings.Contains(vendorText, "qnap") && strings.Contains(host, "qnap.com") {
		return 8
	}
	if strings.Contains(vendorText, "unraid") && strings.Contains(host, "unraid.net") {
		return 8
	}
	return 0
}

func assetSourceLooksRelevant(query string, text string) bool {
	queryTokens := assetSearchTokens(query)
	if len(queryTokens) == 0 {
		return false
	}
	normalized := strings.ToLower(text)
	matched := 0
	matchedNumeric := false
	hasNumeric := false
	for _, token := range queryTokens {
		tokenHasNumeric := regexp.MustCompile(`\d`).MatchString(token)
		hasNumeric = hasNumeric || tokenHasNumeric
		if strings.Contains(normalized, strings.ToLower(token)) {
			matched++
			matchedNumeric = matchedNumeric || tokenHasNumeric
		}
	}
	if hasNumeric && !matchedNumeric {
		return false
	}
	return matched > 0
}

func assetSearchTokens(query string) []string {
	raw := strings.FieldsFunc(strings.ToLower(query), func(r rune) bool {
		return unicode.IsSpace(r) || r == '/' || r == '\\' || r == '|' || r == ',' || r == ';'
	})
	stopWords := map[string]bool{"官方": true, "支持": true, "规格": true, "参数": true, "驱动": true, "固件": true, "说明书": true, "bios": true}
	tokens := make([]string, 0, len(raw))
	for _, token := range raw {
		token = strings.Trim(token, `"'()（）[]【】`)
		if len([]rune(token)) < 2 || stopWords[token] {
			continue
		}
		tokens = append(tokens, token)
	}
	return tokens
}

func extractHTMLTitle(body string) string {
	matches := regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`).FindStringSubmatch(body)
	if len(matches) < 2 {
		return ""
	}
	return cleanHTMLFragment(matches[1])
}

func extractMetaDescription(body string) string {
	patterns := []*regexp.Regexp{
		regexp.MustCompile(`(?is)<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>`),
		regexp.MustCompile(`(?is)<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>`),
		regexp.MustCompile(`(?is)<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>`),
		regexp.MustCompile(`(?is)<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["'][^>]*>`),
	}
	for _, pattern := range patterns {
		matches := pattern.FindStringSubmatch(body)
		if len(matches) >= 2 {
			if value := cleanHTMLFragment(matches[1]); value != "" {
				return value
			}
		}
	}
	return ""
}

func extractMetaImageURL(body string) string {
	patterns := []*regexp.Regexp{
		regexp.MustCompile(`(?is)<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>`),
		regexp.MustCompile(`(?is)<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>`),
		regexp.MustCompile(`(?is)<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>`),
		regexp.MustCompile(`(?is)<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["'][^>]*>`),
		regexp.MustCompile(`(?is)<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["'][^>]*>`),
	}
	for _, pattern := range patterns {
		matches := pattern.FindStringSubmatch(body)
		if len(matches) >= 2 {
			if value := strings.TrimSpace(html.UnescapeString(matches[1])); value != "" {
				return value
			}
		}
	}
	return ""
}

func extractHTMLImageURLs(base *url.URL, body string) []string {
	patterns := []*regexp.Regexp{
		regexp.MustCompile(`(?is)<img[^>]+src=["']([^"']+)["'][^>]*>`),
		regexp.MustCompile(`(?is)<img[^>]+data-src=["']([^"']+)["'][^>]*>`),
		regexp.MustCompile(`(?is)<source[^>]+srcset=["']([^"']+)["'][^>]*>`),
		regexp.MustCompile(`(?is)<img[^>]+srcset=["']([^"']+)["'][^>]*>`),
	}
	result := make([]string, 0, 8)
	for _, pattern := range patterns {
		matches := pattern.FindAllStringSubmatch(body, -1)
		for _, match := range matches {
			if len(match) < 2 {
				continue
			}
			for _, candidate := range splitAssetImageCandidates(match[1]) {
				absolute := absolutizeAssetOnlineURL(base, candidate)
				if isLikelyImageURL(absolute) {
					result = append(result, absolute)
				}
			}
		}
	}
	return dedupeStrings(result)
}

func splitAssetImageCandidates(raw string) []string {
	raw = html.UnescapeString(strings.TrimSpace(raw))
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		value := strings.TrimSpace(part)
		if value == "" {
			continue
		}
		fields := strings.Fields(value)
		if len(fields) > 0 {
			value = fields[0]
		}
		if value != "" {
			result = append(result, value)
		}
	}
	return result
}

func absolutizeAssetOnlineURL(base *url.URL, raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	return base.ResolveReference(parsed).String()
}

func extractAssetOnlinePageText(body string) string {
	body = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>`).ReplaceAllString(body, " ")
	body = regexp.MustCompile(`(?is)<style[^>]*>.*?</style>`).ReplaceAllString(body, " ")
	body = regexp.MustCompile(`(?is)<noscript[^>]*>.*?</noscript>`).ReplaceAllString(body, " ")
	text := cleanHTMLFragment(body)
	if len([]rune(text)) > 12000 {
		return string([]rune(text)[:12000])
	}
	return text
}

func cleanHTMLFragment(value string) string {
	value = regexp.MustCompile(`(?is)<[^>]+>`).ReplaceAllString(value, " ")
	return cleanOnlineText(html.UnescapeString(value))
}

func cleanOnlineText(value string) string {
	value = strings.TrimSpace(value)
	value = regexp.MustCompile(`\s+`).ReplaceAllString(value, " ")
	return value
}

func cleanOnlineSpecValue(value string) string {
	value = cleanOnlineText(value)
	value = strings.ReplaceAll(value, "｜", " / ")
	value = strings.ReplaceAll(value, "丨", " / ")
	value = regexp.MustCompile(`(?i)(台积电|TSMC)\s*(\d+\s*nm)`).ReplaceAllString(value, "$1 $2")
	value = regexp.MustCompile(`(?i)\b(\d{3,5})\s*mAh\b`).ReplaceAllString(value, "$1 mAh")
	value = regexp.MustCompile(`(?i)\b(\d{2,3})\s*Hz\b`).ReplaceAllString(value, "$1 Hz")
	return value
}

func inferCPUVendorFromSpecs(value string) string {
	lower := strings.ToLower(value)
	switch {
	case strings.Contains(lower, "mediatek") || strings.Contains(value, "天玑"):
		return "MediaTek"
	case strings.Contains(lower, "qualcomm") || strings.Contains(lower, "snapdragon") || strings.Contains(value, "骁龙"):
		return "Qualcomm"
	case strings.Contains(lower, "apple a") || strings.Contains(lower, "apple m"):
		return "Apple"
	case strings.Contains(lower, "exynos"):
		return "Samsung"
	default:
		return ""
	}
}

func normalizeOnlineModelCandidate(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	value = regexp.MustCompile(`(?i)([a-z]+)(\d)`).ReplaceAllString(value, "$1 $2")
	return cleanOnlineText(value)
}

func assetOnlineSourceTexts(sources []assetOnlineSource) []string {
	values := make([]string, 0, len(sources)*4)
	for _, source := range sources {
		values = append(values, source.Title, source.Snippet, source.URL, source.Text)
	}
	return values
}

func assetOnlineSourceURLs(sources []assetOnlineSource) []string {
	values := make([]string, 0, len(sources))
	for _, source := range sources {
		if source.URL != "" {
			values = append(values, source.URL)
		}
	}
	return values
}

func assetOnlineSourceTitles(sources []assetOnlineSource) []string {
	values := make([]string, 0, len(sources))
	for _, source := range sources {
		if source.Title != "" {
			values = append(values, source.Title)
		}
	}
	return values
}

func assetOnlineSourceTypes(sources []assetOnlineSource) []string {
	values := make([]string, 0, len(sources))
	for _, source := range sources {
		if source.Type != "" {
			values = append(values, source.Type)
		}
	}
	return values
}

func assetOnlineSourceImageURLs(sources []assetOnlineSource) []string {
	values := make([]string, 0, len(sources))
	for _, source := range sources {
		if source.ImageURL != "" {
			values = append(values, source.ImageURL)
		}
	}
	return values
}

func assetOnlineSourceMetadataRows(sources []assetOnlineSource) []map[string]any {
	rows := make([]map[string]any, 0, len(sources))
	for _, source := range sources {
		row := map[string]any{}
		if value := strings.TrimSpace(source.Provider); value != "" {
			row["provider"] = value
		}
		if value := strings.TrimSpace(source.Type); value != "" {
			row["type"] = value
		}
		if value := strings.TrimSpace(source.Title); value != "" {
			row["title"] = value
		}
		if value := strings.TrimSpace(source.URL); value != "" {
			row["url"] = value
		}
		if value := strings.TrimSpace(source.ImageURL); value != "" {
			row["image_url"] = value
		}
		if source.Confidence > 0 {
			row["confidence"] = source.Confidence
		}
		if len(row) > 0 {
			rows = append(rows, row)
		}
	}
	return rows
}

func assetOnlineSourceProviders(sources []assetOnlineSource) []string {
	values := make([]string, 0, len(sources))
	for _, source := range sources {
		values = appendProvider(values, source.Provider)
	}
	return values
}

func strconvItoa(value int) string {
	if value == 0 {
		return "0"
	}
	digits := make([]byte, 0, 10)
	for value > 0 {
		digits = append([]byte{byte('0' + value%10)}, digits...)
		value /= 10
	}
	return string(digits)
}

func firstRegexCapture(value string, pattern string) string {
	matches := regexp.MustCompile(pattern).FindStringSubmatch(value)
	if len(matches) < 2 {
		return ""
	}
	return cleanOnlineText(matches[1])
}

func extractMobileNetworkSpec(value string) string {
	lower := strings.ToLower(value)
	parts := make([]string, 0, 4)
	if strings.Contains(lower, "wi-fi only") || strings.Contains(lower, "wifi only") {
		return "Wi-Fi only"
	}
	if regexp.MustCompile(`\b5G\b`).MatchString(value) {
		parts = append(parts, "5G")
	}
	if regexp.MustCompile(`(?i)\b(?:4G\s*)?LTE\b`).MatchString(value) {
		parts = append(parts, "LTE")
	}
	if strings.Contains(value, "全网通") {
		parts = append(parts, "全网通")
	}
	if len(parts) == 0 {
		return ""
	}
	return strings.Join(dedupeStrings(parts), " / ")
}

func extractDisplayTypeSpec(value string, assetType string) string {
	candidates := []string{"AMOLED", "OLED", "LTPO", "LCD", "IPS", "E-Ink", "E Ink"}
	if assetType != "phone" && assetType != "tablet" && assetType != "wearable" && assetType != "handheld" {
		candidates = append(candidates, "Mini-LED", "Mini LED")
	}
	lower := strings.ToLower(value)
	for _, candidate := range candidates {
		if strings.Contains(lower, strings.ToLower(candidate)) {
			return candidate
		}
	}
	return ""
}

func dedupeStrings(values []string) []string {
	seen := map[string]bool{}
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	return result
}
