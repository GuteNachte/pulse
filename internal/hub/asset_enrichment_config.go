package hub

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

const assetEnrichmentSettingsKey = "asset_enrichment"

type assetEnrichmentConfigUpdateRequest struct {
	AI struct {
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
	} `json:"visual_ai"`
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

	ai := cloneStringAnyMap(anyMap(next["ai"]))
	ai["provider"] = "agnes"
	if req.AI.Enabled != nil {
		ai["enabled"] = *req.AI.Enabled
	}
	if req.AI.Endpoint != "" {
		endpoint, err := normalizeConfigEndpoint(req.AI.Endpoint)
		if err != nil {
			return e.BadRequestError("资料补全 endpoint 无效。", err)
		}
		ai["endpoint"] = endpoint
	}
	if req.AI.Model != "" {
		ai["model"] = strings.TrimSpace(req.AI.Model)
	}
	if req.AI.ClearAPIKey {
		ai["api_key"] = ""
	} else if strings.TrimSpace(req.AI.APIKey) != "" {
		ai["api_key"] = strings.TrimSpace(req.AI.APIKey)
	}
	next["ai"] = ai

	visualAI := cloneStringAnyMap(anyMap(next["visual_ai"]))
	visualAI["provider"] = "agnes"
	if req.VisualAI.Enabled != nil {
		visualAI["enabled"] = *req.VisualAI.Enabled
	}
	if req.VisualAI.Endpoint != "" {
		endpoint, err := normalizeConfigEndpoint(req.VisualAI.Endpoint)
		if err != nil {
			return e.BadRequestError("图片生成 endpoint 无效。", err)
		}
		visualAI["endpoint"] = endpoint
	}
	if req.VisualAI.Model != "" {
		visualAI["model"] = strings.TrimSpace(req.VisualAI.Model)
	}
	if req.VisualAI.FrameCount > 0 {
		visualAI["frame_count"] = normalizeAssetTurntableFrameCountWithDefault(req.VisualAI.FrameCount, defaultAssetTurntableFrameCount)
	}
	if req.VisualAI.ClearAPIKey {
		visualAI["api_key"] = ""
	} else if strings.TrimSpace(req.VisualAI.APIKey) != "" {
		visualAI["api_key"] = strings.TrimSpace(req.VisualAI.APIKey)
	}
	next["visual_ai"] = visualAI

	if err := h.saveAssetEnrichmentStoredSettings(next); err != nil {
		return e.InternalServerError("Failed to save asset enrichment config.", err)
	}
	h.createOperationAudit(e, "", "update_asset_enrichment_config", "", "", "success", "更新 AI 与资产识别设置")
	return e.JSON(http.StatusOK, h.assetEnrichmentConfigResponse())
}

func (h *Hub) assetEnrichmentConfigResponse() map[string]any {
	aiConfig := h.assetOnlineAIConfig()
	visualConfig := h.assetVisualAIConfig()
	return map[string]any{
		"ai": map[string]any{
			"enabled":             aiConfig.Enabled,
			"provider":            aiConfig.Provider,
			"endpoint":            safeEditableEndpoint(aiConfig.Endpoint),
			"endpoint_configured": strings.TrimSpace(aiConfig.Endpoint) != "",
			"endpoint_host":       safeAssetOnlineEndpointHost(aiConfig.Endpoint),
			"api_key":             aiConfig.APIKey,
			"api_key_configured":  strings.TrimSpace(aiConfig.APIKey) != "",
			"model":               aiConfig.Model,
			"ready":               aiConfig.Enabled && strings.TrimSpace(aiConfig.Endpoint) != "" && strings.TrimSpace(aiConfig.APIKey) != "" && strings.TrimSpace(aiConfig.Model) != "",
		},
		"visual_ai": map[string]any{
			"enabled":             visualConfig.Enabled,
			"provider":            visualConfig.Provider,
			"endpoint":            safeEditableEndpoint(visualConfig.Endpoint),
			"endpoint_configured": strings.TrimSpace(visualConfig.Endpoint) != "",
			"endpoint_host":       safeAssetOnlineEndpointHost(visualConfig.Endpoint),
			"api_key":             visualConfig.APIKey,
			"api_key_configured":  strings.TrimSpace(visualConfig.APIKey) != "",
			"model":               visualConfig.Model,
			"ready":               visualConfig.Ready(),
			"frame_count":         normalizeAssetTurntableFrameCountWithDefault(visualConfig.FrameCount, defaultAssetTurntableFrameCount),
		},
	}
}

func (h *Hub) assetOnlineAIConfig() assetOnlineAIConfig {
	config := assetOnlineAIConfigFromEnv()
	section := anyMap(h.loadAssetEnrichmentStoredSettings()["ai"])
	if value, ok := configBoolFromMap(section, "enabled"); ok {
		config.Enabled = value
	}
	if value, ok := configStringFromMap(section, "provider"); ok {
		config.Provider = value
	}
	if value, ok := configStringFromMap(section, "endpoint"); ok {
		config.Endpoint = value
	}
	if value, ok := configStringFromMap(section, "api_key"); ok && value != "" {
		config.APIKey = value
	}
	if value, ok := configStringFromMap(section, "model"); ok {
		config.Model = value
	}
	config.Provider = "agnes"
	return config
}

func (h *Hub) assetVisualAIConfig() assetVisualAIConfig {
	config := assetVisualAIConfigFromEnv()
	section := anyMap(h.loadAssetEnrichmentStoredSettings()["visual_ai"])
	if value, ok := configBoolFromMap(section, "enabled"); ok {
		config.Enabled = value
	}
	if value, ok := configStringFromMap(section, "provider"); ok {
		config.Provider = value
	}
	if value, ok := configStringFromMap(section, "endpoint"); ok {
		config.Endpoint = value
	}
	if value, ok := configStringFromMap(section, "api_key"); ok && value != "" {
		config.APIKey = value
	}
	if value, ok := configStringFromMap(section, "model"); ok {
		config.Model = value
	}
	if value, ok := configIntFromMap(section, "frame_count"); ok {
		config.FrameCount = normalizeAssetTurntableFrameCountWithDefault(value, defaultAssetTurntableFrameCount)
	}
	config.Provider = "agnes"
	return config
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

func normalizeConfigEndpoint(raw string) (string, error) {
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
	return parsed.String(), nil
}

func safeEditableEndpoint(raw string) string {
	endpoint, err := normalizeConfigEndpoint(raw)
	if err != nil {
		return ""
	}
	return endpoint
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
