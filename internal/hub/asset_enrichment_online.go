package hub

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

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
	// 2026-10-09 诊断：小模型输出格式不齐导致 0 提取时，记录原始返回头部便于排查
	ContentHead string
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
			"status":       result.AI.Status,
			"provider":     result.AI.Provider,
			"model":        result.AI.Model,
			"attempts":     result.AI.Attempts,
			"suggestions":  result.AI.Suggestions,
			"error":        result.AI.Error,
			"content_head": result.AI.ContentHead,
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
	sourceLimit := normalizeAssetOnlineSourceLimit(config.MaxSources)
	// 2026-10-08 梳理④：多引擎聚合搜索（必应/百度/DuckDuckGo）作为来源发现第一通道，
	// 不依赖 AI 配置——AI key 未配或来源不足时，搜索聚合保证来源发现照常工作。
	if searchQuery := buildAssetOnlineSearchQuery(asset); searchQuery != "" {
		if searchSources := h.collectAssetOnlineSearchSourcesSync(searchQuery, sourceLimit); len(searchSources) > 0 {
			result.Sources = dedupeAssetOnlineSources(append(result.Sources, searchSources...))
			result.Providers = appendProvider(result.Providers, "聚合搜索")
		}
	}
	if config.SourceDiscoveryEnabled && len(result.Sources) < sourceLimit {
		discovery, discoveredSources, discoveryErrors := h.collectAssetOnlineAISourceDiscovery(ctx, asset, focus)
		result.Discovery = discovery
		result.Errors = append(result.Errors, discoveryErrors...)
		if len(discoveredSources) > 0 {
			result.Sources = rankAssetOnlineSources(
				filterAssetOnlineSourcesByVariant(
					dedupeAssetOnlineSources(append(result.Sources, discoveredSources...)),
					asset,
				),
				asset,
			)
			if len(result.Sources) > sourceLimit {
				result.Sources = result.Sources[:sourceLimit]
			}
			result.Status = "ready"
			for _, source := range result.Sources {
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
	if len(suggestions) == 0 {
		head := fmt.Sprintf("body_bytes=%d sources=%d | ", len(body), len(sources))
		for i, source := range sources {
			if i >= 2 {
				break
			}
			head += fmt.Sprintf("【来源%d %s】%s ", i+1, source.URL, truncateRunes(strings.TrimSpace(source.Text), 200))
		}
		result.ContentHead = head + " | AI输出: " + truncateRunes(content, 300)
	}
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
	// 2026-10-09 多服务商架构：默认模型不再硬编码，未显式配置即视为未就绪
	return ""
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
