package hub

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

// 2026-10-08 梳理⑥补：官方模型列表获取。用已保存的 Agnes Base URL + API Key
// 拉取 OpenAI 兼容的 GET {base_url}/models，成功后缓存到资产富化设置，
// 供「AI 服务接入」页按钮与「AI 能力配置」页模型下拉共用。

func (h *Hub) listAssetEnrichmentModels(e *core.RequestEvent) error {
	settings := h.loadAssetEnrichmentStoredSettings()
	apiKey := assetEnrichmentStoredAPIKey(settings)
	if apiKey == "" {
		return e.BadRequestError("请先在「AI 服务接入」页配置 API Key。", nil)
	}
	baseURL := assetAIBaseURLFromSettings(settings)
	models, err := fetchAssetAIModelList(baseURL, apiKey)
	if err != nil {
		return e.BadRequestError("获取模型列表失败："+err.Error(), nil)
	}
	stored := cloneStringAnyMap(settings)
	fetchedAt := time.Now().Format(time.RFC3339)
	stored["models_cache"] = models
	stored["models_fetched_at"] = fetchedAt
	if err := h.saveAssetEnrichmentStoredSettings(stored); err != nil {
		return e.InternalServerError("模型列表已获取，但缓存保存失败。", err)
	}
	h.createOperationAudit(e, "", "fetch_asset_ai_models", "", "", "success", "获取 AI 官方模型列表")
	return e.JSON(http.StatusOK, map[string]any{
		"models":        models,
		"fetched_at":    fetchedAt,
		"base_url_host": safeAssetOnlineEndpointHost(baseURL),
	})
}

func assetEnrichmentStoredAPIKey(settings map[string]any) string {
	if value := configString(settings, "api_key"); value != "" {
		return value
	}
	if value := configString(anyMap(settings["ai"]), "api_key"); value != "" {
		return value
	}
	return configString(anyMap(settings["visual_ai"]), "api_key")
}

func fetchAssetAIModelList(baseURL string, apiKey string) ([]map[string]any, error) {
	endpoint := strings.TrimRight(baseURL, "/") + "/models"
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("请求地址无效: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Accept", "application/json")
	resp, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
	if err != nil {
		return nil, fmt.Errorf("无法连接模型服务: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("读取响应失败: %w", err)
	}
	switch resp.StatusCode {
	case http.StatusUnauthorized:
		return nil, errors.New("API Key 无效或已过期（401）")
	case http.StatusForbidden:
		return nil, errors.New("API Key 无权访问模型列表（403）")
	case http.StatusTooManyRequests:
		return nil, errors.New("触发平台限流（429），请稍后再试")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("模型服务返回 %d: %s", resp.StatusCode, truncateRunes(strings.TrimSpace(string(body)), 200))
	}
	var payload struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, errors.New("响应不是预期的模型列表格式")
	}
	models := make([]map[string]any, 0, len(payload.Data))
	for _, item := range payload.Data {
		id := strings.TrimSpace(item.ID)
		if id == "" {
			continue
		}
		models = append(models, map[string]any{"id": id})
	}
	if len(models) == 0 {
		return nil, errors.New("模型服务返回了空列表")
	}
	sort.Slice(models, func(i, j int) bool {
		return strings.ToLower(models[i]["id"].(string)) < strings.ToLower(models[j]["id"].(string))
	})
	return models, nil
}
