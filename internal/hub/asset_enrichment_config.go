package hub

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

const assetEnrichmentSettingsKey = "asset_enrichment"

type assetEnrichmentConfigUpdateRequest struct {
	BaseURL     string `json:"base_url"`
	APIKey      string `json:"api_key"`
	ClearAPIKey bool   `json:"clear_api_key"`
	Provider    string `json:"provider"`
	AI          struct {
		Enabled     *bool  `json:"enabled"`
		Provider    string `json:"provider"`
		Endpoint    string `json:"endpoint"`
		APIKey      string `json:"api_key"`
		ClearAPIKey bool   `json:"clear_api_key"`
		Model       string `json:"model"`
	} `json:"ai"`
	VisualAI struct {
		Enabled     *bool  `json:"enabled"`
		Provider    string `json:"provider"`
		Endpoint    string `json:"endpoint"`
		APIKey      string `json:"api_key"`
		ClearAPIKey bool   `json:"clear_api_key"`
		Model       string `json:"model"`
		FrameCount  int    `json:"frame_count"`
		MaxImages   int    `json:"max_images"`
	} `json:"visual_ai"`
	ImageAgent struct {
		Enabled     *bool `json:"enabled"`
		AssessCount int   `json:"assess_count"`
	} `json:"image_agent"`
}

func (h *Hub) getAssetEnrichmentConfig(e *core.RequestEvent) error {
	return e.JSON(http.StatusOK, h.assetEnrichmentConfigResponse())
}

func (h *Hub) updateAssetEnrichmentConfig(e *core.RequestEvent) error {
	var req assetEnrichmentConfigUpdateRequest
	if err := e.BindBody(&req); err != nil {
		return e.BadRequestError("Invalid asset enrichment config payload.", err)
	}

	current := h.loadAssetEnrichmentStoredSettings()
	next := cloneStringAnyMap(current)
	delete(next, "public_search_enabled")
	delete(next, "brave_search_api_key")
	delete(next, "visual_search")
	if strings.TrimSpace(req.BaseURL) != "" {
		baseURL, err := normalizeConfigBaseURL(req.BaseURL)
		if err != nil {
			return e.BadRequestError("Agnes Base URL 无效。", err)
		}
		next["base_url"] = baseURL
	}
	// 2026-10-09 梳理⑥补：服务商改为前端可选（智谱/硅基流动/DeepSeek/Kimi/百炼/自定义），
	// 仅作为标签保存；调用端点始终由 base_url 推导。
	// 切换服务商时旧模型名随之失效：请求未同时带新模型则清空，避免上一家的模型残留。
	providerChanged := false
	if provider := strings.TrimSpace(req.Provider); provider != "" && provider != storedProviderLabel(current) {
		next["provider"] = provider
		providerChanged = true
	}
	if req.ClearAPIKey {
		next["api_key"] = ""
	} else if strings.TrimSpace(req.APIKey) != "" {
		next["api_key"] = strings.TrimSpace(req.APIKey)
	}

	ai := cloneStringAnyMap(anyMap(next["ai"]))
	ai["provider"] = storedProviderLabel(next)
	delete(ai, "endpoint")
	if req.AI.Enabled != nil {
		ai["enabled"] = *req.AI.Enabled
	}
	if req.AI.Model != "" {
		ai["model"] = strings.TrimSpace(req.AI.Model)
	} else if providerChanged {
		delete(ai, "model")
	}
	// 2026-10-14 参数获取下线：source_discovery_enabled / max_sources / searxng 随搜索链路移除，
	// 保存时顺带清掉历史存量；旧 enrichment 链路（UI 已不可达）此后按环境默认值运行。
	delete(ai, "source_discovery_enabled")
	delete(ai, "max_sources")
	if req.ClearAPIKey {
		ai["api_key"] = ""
	} else if strings.TrimSpace(req.APIKey) != "" {
		ai["api_key"] = strings.TrimSpace(req.APIKey)
	} else if req.AI.ClearAPIKey {
		ai["api_key"] = ""
	} else if strings.TrimSpace(req.AI.APIKey) != "" {
		ai["api_key"] = strings.TrimSpace(req.AI.APIKey)
	}
	next["ai"] = ai

	visualAI := cloneStringAnyMap(anyMap(next["visual_ai"]))
	visualAI["provider"] = storedProviderLabel(next)
	delete(visualAI, "endpoint")
	delete(visualAI, "model_discovery_enabled")
	delete(visualAI, "official_only")
	if req.VisualAI.Enabled != nil {
		visualAI["enabled"] = *req.VisualAI.Enabled
	}
	if req.VisualAI.Model != "" {
		visualAI["model"] = strings.TrimSpace(req.VisualAI.Model)
	} else if providerChanged {
		delete(visualAI, "model")
	}
	if req.VisualAI.FrameCount > 0 {
		visualAI["frame_count"] = normalizeAssetTurntableFrameCountWithDefault(req.VisualAI.FrameCount, defaultAssetTurntableFrameCount)
	}
	if req.VisualAI.MaxImages > 0 {
		visualAI["max_images"] = normalizeAssetVisualMaxImages(req.VisualAI.MaxImages)
	}
	if req.ClearAPIKey {
		visualAI["api_key"] = ""
	} else if strings.TrimSpace(req.APIKey) != "" {
		visualAI["api_key"] = strings.TrimSpace(req.APIKey)
	} else if req.VisualAI.ClearAPIKey {
		visualAI["api_key"] = ""
	} else if strings.TrimSpace(req.VisualAI.APIKey) != "" {
		visualAI["api_key"] = strings.TrimSpace(req.VisualAI.APIKey)
	}
	next["visual_ai"] = visualAI

	imageAgent := cloneStringAnyMap(anyMap(next["image_agent"]))
	if req.ImageAgent.Enabled != nil {
		imageAgent["enabled"] = *req.ImageAgent.Enabled
	}
	if req.ImageAgent.AssessCount > 0 {
		imageAgent["assess_count"] = req.ImageAgent.AssessCount
	}
	next["image_agent"] = imageAgent

	if err := h.saveAssetEnrichmentStoredSettings(next); err != nil {
		return e.InternalServerError("Failed to save asset enrichment config.", err)
	}
	h.createOperationAudit(e, "", "update_asset_enrichment_config", "", "", "success", "更新 AI 与资产识别设置")
	return e.JSON(http.StatusOK, h.assetEnrichmentConfigResponse())
}

func (h *Hub) assetEnrichmentConfigResponse() map[string]any {
	settings := h.loadAssetEnrichmentStoredSettings()
	aiConfig := h.assetOnlineAIConfigFromSettings(settings)
	visualConfig := h.assetVisualAIConfigFromSettings(settings)
	baseURL := assetAIBaseURLFromSettings(settings)
	apiKey := firstNonEmpty(
		strings.TrimSpace(configString(settings, "api_key")),
		aiConfig.APIKey,
		visualConfig.APIKey,
	)
	return map[string]any{
		"base_url":           baseURL,
		"base_url_host":      safeAssetOnlineEndpointHost(baseURL),
		"api_key_configured": strings.TrimSpace(apiKey) != "",
		"provider":           storedProviderLabel(settings),
		"available_models":   settings["models_cache"],
		"models_fetched_at":  configString(settings, "models_fetched_at"),
		"ai": map[string]any{
			"enabled":             aiConfig.Enabled,
			"provider":            aiConfig.Provider,
			"endpoint":            safeEditableEndpoint(aiConfig.Endpoint),
			"endpoint_configured": strings.TrimSpace(aiConfig.Endpoint) != "",
			"endpoint_host":       safeAssetOnlineEndpointHost(aiConfig.Endpoint),
			"api_key_configured":  strings.TrimSpace(aiConfig.APIKey) != "",
			"model":               aiConfig.Model,
			"ready":               aiConfig.Enabled && strings.TrimSpace(aiConfig.Endpoint) != "" && strings.TrimSpace(aiConfig.APIKey) != "" && strings.TrimSpace(aiConfig.Model) != "",
		},
		"image_agent": map[string]any{
			"enabled":      h.assetImageAgentConfig().Enabled,
			"assess_count": h.assetImageAgentConfig().AssessCount,
		},
		"visual_ai": map[string]any{
			"enabled":             visualConfig.Enabled,
			"provider":            visualConfig.Provider,
			"endpoint":            safeEditableEndpoint(visualConfig.Endpoint),
			"endpoint_configured": strings.TrimSpace(visualConfig.Endpoint) != "",
			"endpoint_host":       safeAssetOnlineEndpointHost(visualConfig.Endpoint),
			"api_key_configured":  strings.TrimSpace(visualConfig.APIKey) != "",
			"model":               visualConfig.Model,
			"ready":               visualConfig.Ready(),
			"frame_count":         normalizeAssetTurntableFrameCountWithDefault(visualConfig.FrameCount, defaultAssetTurntableFrameCount),
			"max_images":          visualConfig.MaxImages,
		},
	}
}

func (h *Hub) assetOnlineAIConfig() assetOnlineAIConfig {
	return h.assetOnlineAIConfigFromSettings(h.loadAssetEnrichmentStoredSettings())
}

func (h *Hub) assetOnlineAIConfigFromSettings(settings map[string]any) assetOnlineAIConfig {
	config := assetOnlineAIConfigFromEnv()
	baseURL := assetAIBaseURLFromSettings(settings)
	section := anyMap(settings["ai"])
	if value, ok := configBoolFromMap(section, "enabled"); ok {
		config.Enabled = value
	}
	if value, ok := configStringFromMap(section, "provider"); ok {
		config.Provider = value
	}
	if value, ok := configStringFromMap(section, "api_key"); ok && value != "" {
		config.APIKey = value
	}
	if value := configString(settings, "api_key"); value != "" {
		config.APIKey = value
	}
	if value, ok := configStringFromMap(section, "model"); ok {
		config.Model = value
	}
	if value, ok := configBoolFromMap(section, "source_discovery_enabled"); ok {
		config.SourceDiscoveryEnabled = value
	}
	if value, ok := configIntFromMap(section, "max_sources"); ok {
		config.MaxSources = normalizeAssetOnlineSourceLimit(value)
	}
	config.Provider = storedProviderLabel(settings)
	if envEndpoint := strings.TrimSpace(os.Getenv("PULSE_ASSET_ENRICHMENT_AI_ENDPOINT")); envEndpoint != "" {
		config.Endpoint = normalizeConfigEndpointValue(envEndpoint, "/chat/completions")
	} else {
		config.Endpoint = normalizeConfigEndpointValue(baseURL, "/chat/completions")
	}
	return config
}

func (h *Hub) assetVisualAIConfig() assetVisualAIConfig {
	return h.assetVisualAIConfigFromSettings(h.loadAssetEnrichmentStoredSettings())
}

func (h *Hub) assetVisualAIConfigFromSettings(settings map[string]any) assetVisualAIConfig {
	config := assetVisualAIConfigFromEnv()
	baseURL := assetAIBaseURLFromSettings(settings)
	section := anyMap(settings["visual_ai"])
	if value, ok := configBoolFromMap(section, "enabled"); ok {
		config.Enabled = value
	}
	if value, ok := configStringFromMap(section, "provider"); ok {
		config.Provider = value
	}
	if value, ok := configStringFromMap(section, "api_key"); ok && value != "" {
		config.APIKey = value
	}
	if value := configString(settings, "api_key"); value != "" {
		config.APIKey = value
	}
	if value, ok := configStringFromMap(section, "model"); ok {
		config.Model = value
	}
	if value, ok := configIntFromMap(section, "frame_count"); ok {
		config.FrameCount = normalizeAssetTurntableFrameCountWithDefault(value, defaultAssetTurntableFrameCount)
	}
	if value, ok := configIntFromMap(section, "max_images"); ok {
		config.MaxImages = normalizeAssetVisualMaxImages(value)
	}
	config.Provider = storedProviderLabel(settings)
	if envEndpoint := strings.TrimSpace(os.Getenv("PULSE_ASSET_VISUAL_AI_ENDPOINT")); envEndpoint != "" {
		config.Endpoint = normalizeAssetVisualDiscoveryEndpoint(envEndpoint)
	} else {
		config.Endpoint = normalizeAssetVisualDiscoveryEndpoint(baseURL)
	}
	return config
}

func assetAIBaseURLFromSettings(settings map[string]any) string {
	if value := configString(settings, "base_url"); value != "" {
		if normalized, err := normalizeConfigBaseURL(value); err == nil {
			return normalized
		}
	}
	return "https://apihub.agnes-ai.com/v1"
}

// storedProviderLabel 返回服务商标签；历史配置没有该字段时按 Agnes 处理。
func storedProviderLabel(settings map[string]any) string {
	if value := configString(settings, "provider"); value != "" {
		return value
	}
	return "agnes"
}

func (h *Hub) loadAssetEnrichmentStoredSettings() map[string]any {
	record, err := h.FindFirstRecordByFilter("system_settings", "key = {:key}", map[string]any{"key": assetEnrichmentSettingsKey})
	if err != nil || record == nil {
		return map[string]any{}
	}
	var settings map[string]any
	if err := record.UnmarshalJSONField("settings", &settings); err != nil || settings == nil {
		raw := strings.TrimSpace(record.GetString("settings"))
		if raw != "" {
			_ = json.Unmarshal([]byte(raw), &settings)
		}
	}
	if settings == nil {
		settings = map[string]any{}
	}
	return settings
}

func (h *Hub) saveAssetEnrichmentStoredSettings(settings map[string]any) error {
	collection, err := h.FindCachedCollectionByNameOrId("system_settings")
	if err != nil {
		return err
	}
	record, err := h.FindFirstRecordByFilter("system_settings", "key = {:key}", map[string]any{"key": assetEnrichmentSettingsKey})
	if err != nil || record == nil {
		record = core.NewRecord(collection)
		record.Set("key", assetEnrichmentSettingsKey)
	}
	record.Set("settings", settings)
	return h.Save(record)
}

func normalizeConfigBaseURL(raw string) (string, error) {
	value := strings.TrimSpace(raw)
	if value == "" {
		return "", nil
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		if err == nil {
			err = errors.New("missing endpoint scheme or host")
		}
		return "", err
	}
	parsed.RawQuery = ""
	parsed.Fragment = ""
	parsed.Path = strings.TrimRight(parsed.Path, "/")
	if parsed.Path == "" {
		parsed.Path = "/v1"
	}
	return parsed.String(), nil
}

func normalizeConfigEndpointValue(raw string, suffix string) string {
	value := strings.TrimSpace(raw)
	if value == "" {
		return ""
	}
	if strings.HasSuffix(value, suffix) {
		return value
	}
	return strings.TrimRight(value, "/") + suffix
}

func normalizeAssetVisualDiscoveryEndpoint(raw string) string {
	value := strings.TrimSpace(raw)
	if value == "" {
		return ""
	}
	lower := strings.ToLower(strings.TrimRight(value, "/"))
	for _, legacySuffix := range []string{"/images/generations", "/images/edits"} {
		if strings.HasSuffix(lower, legacySuffix) {
			value = strings.TrimRight(value, "/")
			value = value[:len(value)-len(legacySuffix)]
			break
		}
	}
	return normalizeConfigEndpointValue(value, "/chat/completions")
}

func safeEditableEndpoint(raw string) string {
	endpoint, err := normalizeConfigBaseURL(raw)
	if err != nil {
		return ""
	}
	return endpoint
}

func configString(input map[string]any, key string) string {
	value, _ := configStringFromMap(input, key)
	return value
}

func anyMap(value any) map[string]any {
	if result, ok := value.(map[string]any); ok {
		return result
	}
	return map[string]any{}
}

func cloneStringAnyMap(input map[string]any) map[string]any {
	output := make(map[string]any, len(input))
	for key, value := range input {
		output[key] = value
	}
	return output
}

func configBoolFromMap(input map[string]any, key string) (bool, bool) {
	value, ok := input[key]
	if !ok {
		return false, false
	}
	switch typed := value.(type) {
	case bool:
		return typed, true
	case string:
		normalized := strings.TrimSpace(strings.ToLower(typed))
		if normalized == "true" {
			return true, true
		}
		if normalized == "false" {
			return false, true
		}
	}
	return false, false
}

func configStringFromMap(input map[string]any, key string) (string, bool) {
	value, ok := input[key]
	if !ok {
		return "", false
	}
	if value == nil {
		return "", true
	}
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed), true
	case json.Number:
		return strings.TrimSpace(typed.String()), true
	default:
		return strings.TrimSpace(fmt.Sprint(value)), true
	}
}

func configIntFromMap(input map[string]any, key string) (int, bool) {
	value, ok := input[key]
	if !ok {
		return 0, false
	}
	switch typed := value.(type) {
	case int:
		return typed, true
	case int64:
		return int(typed), true
	case float64:
		return int(typed), true
	case json.Number:
		parsed, err := typed.Int64()
		if err == nil {
			return int(parsed), true
		}
	case string:
		parsed, err := strconv.Atoi(strings.TrimSpace(typed))
		if err == nil {
			return parsed, true
		}
	}
	return 0, false
}
