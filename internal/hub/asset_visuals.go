package hub

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

const defaultAssetTurntableFrameCount = 8

type assetTurntableVisualRequest struct {
	Color      string `json:"color"`
	FrameCount int    `json:"frame_count"`
}

type assetVisualAIConfig struct {
	Enabled    bool
	Provider   string
	Endpoint   string
	APIKey     string
	Model      string
	FrameCount int
}

func (h *Hub) generateAssetTurntableVisual(e *core.RequestEvent) error {
	assetID := strings.TrimSpace(e.Request.PathValue("id"))
	if assetID == "" {
		return e.BadRequestError("Missing asset id.", nil)
	}
	asset, err := h.findUserAssetRecord(assetID, e.Auth.Id)
	if err != nil {
		return e.NotFoundError("Asset not found.", err)
	}

	var req assetTurntableVisualRequest
	_ = json.NewDecoder(e.Request.Body).Decode(&req)
	config := h.assetVisualAIConfig()
	frameCount := normalizeAssetTurntableFrameCountWithDefault(req.FrameCount, config.FrameCount)
	color := firstNonEmpty(strings.TrimSpace(req.Color), recordMetadataString(asset, "color"), recordMetadataString(asset, "device_color"), "按真实设备配色")
	references := h.collectAssetVisualReferenceSources(asset)
	prompt := buildAssetTurntablePrompt(asset, color, frameCount, references)

	task, err := h.createAssetAITask(e.Auth.Id, asset.Id, config, frameCount, color, references)
	if err != nil {
		return e.InternalServerError("Failed to create AI task.", err)
	}
	visual, err := h.createAssetVisualRecord(e.Auth.Id, asset, task.Id, color, frameCount, references, prompt)
	if err != nil {
		return e.InternalServerError("Failed to create asset visual.", err)
	}

	if !config.Ready() {
		message := "Agnes 图像生成未配置。请配置 PULSE_AGNES_API_KEY 或 PULSE_ASSET_VISUAL_AI_API_KEY。"
		task.Set("status", "failed")
		task.Set("error", message)
		task.Set("output_summary", map[string]any{"generated_frames": 0, "reason": "config_missing"})
		visual.Set("status", "draft")
		visual.Set("metadata", map[string]any{
			"generation_status": "config_missing",
			"error":             message,
			"provider":          config.Provider,
			"model":             config.Model,
		})
		if err := h.Save(task); err != nil {
			return e.InternalServerError("Failed to update AI task.", err)
		}
		if err := h.Save(visual); err != nil {
			return e.InternalServerError("Failed to update asset visual.", err)
		}
		return e.JSON(http.StatusOK, map[string]any{"task": task, "visual": visual, "status": "config_missing"})
	}

	frames, generateErr := h.generateAssetTurntableFrames(config, prompt, frameCount, references)
	if generateErr != nil {
		task.Set("status", "failed")
		task.Set("error", generateErr.Error())
		task.Set("output_summary", map[string]any{"generated_frames": len(frames), "error": generateErr.Error()})
		visual.Set("status", "failed")
		visual.Set("frames", frames)
		visual.Set("metadata", map[string]any{
			"generation_status": "failed",
			"error":             generateErr.Error(),
			"provider":          config.Provider,
			"model":             config.Model,
		})
		_ = h.Save(task)
		_ = h.Save(visual)
		return e.InternalServerError("Failed to generate asset visual.", generateErr)
	}

	task.Set("status", "ready")
	task.Set("output_summary", map[string]any{"generated_frames": len(frames)})
	visual.Set("status", "ready")
	visual.Set("frames", frames)
	visual.Set("metadata", map[string]any{
		"generation_status": "ready",
		"provider":          config.Provider,
		"model":             config.Model,
		"note":              "AI 渲染图基于可追溯资料和用户确认配色生成，不等同于官方实拍。确认后才作为主视觉使用。",
	})
	if err := h.Save(task); err != nil {
		return e.InternalServerError("Failed to update AI task.", err)
	}
	if err := h.Save(visual); err != nil {
		return e.InternalServerError("Failed to update asset visual.", err)
	}
	h.createOperationAudit(e, "", "asset_visual_generate", asset.Id, "", "success", "资产设备全貌图已生成")
	return e.JSON(http.StatusOK, map[string]any{"task": task, "visual": visual, "status": "ready"})
}

func (config assetVisualAIConfig) Ready() bool {
	return config.Enabled && strings.TrimSpace(config.Endpoint) != "" && strings.TrimSpace(config.APIKey) != "" && strings.TrimSpace(config.Model) != ""
}

func assetVisualAIConfigFromEnv() assetVisualAIConfig {
	key := firstNonEmpty(
		strings.TrimSpace(os.Getenv("PULSE_ASSET_VISUAL_AI_API_KEY")),
		strings.TrimSpace(os.Getenv("PULSE_AGNES_API_KEY")),
		strings.TrimSpace(os.Getenv("PULSE_ASSET_ENRICHMENT_AI_API_KEY")),
	)
	enabledEnv := strings.TrimSpace(strings.ToLower(os.Getenv("PULSE_ASSET_VISUAL_AI_ENABLED")))
	enabled := key != ""
	if enabledEnv == "true" {
		enabled = true
	}
	if enabledEnv == "false" {
		enabled = false
	}
	return assetVisualAIConfig{
		Enabled:    enabled,
		Provider:   firstNonEmpty(strings.TrimSpace(os.Getenv("PULSE_ASSET_VISUAL_AI_PROVIDER")), "agnes"),
		Endpoint:   firstNonEmpty(strings.TrimSpace(os.Getenv("PULSE_ASSET_VISUAL_AI_ENDPOINT")), "https://apihub.agnes-ai.com/v1/images/generations"),
		APIKey:     key,
		Model:      firstNonEmpty(strings.TrimSpace(os.Getenv("PULSE_ASSET_VISUAL_AI_MODEL")), "agnes-image-2.1-flash"),
		FrameCount: normalizeAssetTurntableFrameCount(0),
	}
}

func normalizeAssetTurntableFrameCount(value int) int {
	if value <= 0 {
		if envValue, err := strconv.Atoi(strings.TrimSpace(os.Getenv("PULSE_ASSET_VISUAL_FRAME_COUNT"))); err == nil {
			value = envValue
		}
	}
	if value <= 0 {
		return defaultAssetTurntableFrameCount
	}
	if value < 4 {
		return 4
	}
	if value > 12 {
		return 12
	}
	return value
}

func normalizeAssetTurntableFrameCountWithDefault(value int, fallback int) int {
	if value <= 0 {
		value = fallback
	}
	if value <= 0 {
		value = defaultAssetTurntableFrameCount
	}
	if value < 4 {
		return 4
	}
	if value > 12 {
		return 12
	}
	return value
}

func (h *Hub) createAssetAITask(userID string, assetID string, config assetVisualAIConfig, frameCount int, color string, references []map[string]any) (*core.Record, error) {
	collection, err := h.FindCachedCollectionByNameOrId("ai_tasks")
	if err != nil {
		return nil, err
	}
	record := core.NewRecord(collection)
	record.Set("user", userID)
	record.Set("asset", assetID)
	record.Set("kind", "asset_visual")
	record.Set("status", "running")
	record.Set("provider", config.Provider)
	record.Set("model", config.Model)
	record.Set("input_summary", map[string]any{
		"frame_count":       frameCount,
		"color":             color,
		"reference_sources": references,
		"endpoint_host":     safeAssetOnlineEndpointHost(config.Endpoint),
	})
	record.Set("metadata", map[string]any{"manual_trigger": true})
	if err := h.Save(record); err != nil {
		return nil, err
	}
	return record, nil
}

func (h *Hub) createAssetVisualRecord(userID string, asset *core.Record, taskID string, color string, frameCount int, references []map[string]any, prompt string) (*core.Record, error) {
	collection, err := h.FindCachedCollectionByNameOrId("asset_visuals")
	if err != nil {
		return nil, err
	}
	record := core.NewRecord(collection)
	record.Set("user", userID)
	record.Set("asset", asset.Id)
	record.Set("task", taskID)
	record.Set("kind", "ai_turntable")
	record.Set("status", "draft")
	record.Set("title", firstNonEmpty(asset.GetString("name"), asset.GetString("model"), "设备全貌图"))
	record.Set("color", color)
	record.Set("frame_count", frameCount)
	record.Set("primary", false)
	record.Set("sources", references)
	record.Set("prompt", prompt)
	record.Set("metadata", map[string]any{"generation_status": "pending"})
	if err := h.Save(record); err != nil {
		return nil, err
	}
	return record, nil
}

func (h *Hub) collectAssetVisualReferenceSources(asset *core.Record) []map[string]any {
	online := h.collectAssetOnlineReferenceEnrichment(asset)
	result := make([]map[string]any, 0, len(online.Sources))
	if officialImageURL := recordMetadataString(asset, "official_image_url"); isLikelyImageURL(officialImageURL) {
		result = append(result, map[string]any{
			"title":      "已确认官方设备图片",
			"url":        officialImageURL,
			"image_url":  officialImageURL,
			"type":       "official_image",
			"provider":   "asset_master",
			"confidence": 96,
		})
	}
	for _, source := range online.Sources {
		if source.URL == "" {
			continue
		}
		if source.ImageURL == "" && !isLikelyImageURL(source.URL) {
			continue
		}
		result = append(result, map[string]any{
			"title":      source.Title,
			"url":        source.URL,
			"image_url":  source.ImageURL,
			"type":       source.Type,
			"provider":   source.Provider,
			"confidence": source.Confidence,
		})
		if len(result) >= 4 {
			break
		}
	}
	return result
}

func buildAssetTurntablePrompt(asset *core.Record, color string, frameCount int, references []map[string]any) string {
	referenceLines := make([]string, 0, len(references))
	for _, source := range references {
		if rawURL, _ := source["url"].(string); rawURL != "" {
			referenceLines = append(referenceLines, rawURL)
		}
	}
	return strings.Join(nonEmptyStrings(
		"Create a consistent product turntable render for a home asset catalog.",
		"Device: "+strings.Join(nonEmptyStrings(asset.GetString("vendor"), asset.GetString("model"), recordMetadataString(asset, "internal_model"), asset.GetString("name")), " / "),
		"Color: "+color+".",
		fmt.Sprintf("Need %d frames around the same device, clean studio lighting, realistic 3D product render, neutral background, no text, no logos except real device branding if visible in official reference.", frameCount),
		"Use official product photos or official CDN images as factual visual reference. Do not invent ports, camera modules, buttons, materials or logos that contradict official references.",
		"Official reference URLs: "+strings.Join(referenceLines, " ; "),
	), "\n")
}

func (h *Hub) generateAssetTurntableFrames(config assetVisualAIConfig, prompt string, frameCount int, references []map[string]any) ([]map[string]any, error) {
	frames := make([]map[string]any, 0, frameCount)
	for index := 0; index < frameCount; index++ {
		angle := int(float64(index) * 360 / float64(frameCount))
		framePrompt := prompt + fmt.Sprintf("\nCurrent frame angle: %d degrees. Keep the same object, proportions, material, color and camera distance.", angle)
		imageURL, err := h.generateAssetVisualFrame(config, framePrompt, firstReferenceURL(references))
		if err != nil {
			return frames, err
		}
		frames = append(frames, map[string]any{
			"index": index,
			"angle": angle,
			"url":   imageURL,
		})
	}
	return frames, nil
}

func (h *Hub) generateAssetVisualFrame(config assetVisualAIConfig, prompt string, referenceURL string) (string, error) {
	extraBody := map[string]any{"response_format": "url"}
	if isLikelyImageURL(referenceURL) {
		extraBody["image"] = []string{referenceURL}
	}
	payload := map[string]any{
		"model":      config.Model,
		"prompt":     prompt,
		"n":          1,
		"size":       "1024x1024",
		"extra_body": extraBody,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequest(http.MethodPost, config.Endpoint, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+config.APIKey)
	client := &http.Client{Timeout: 90 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	rawBody, err := io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))
	if err != nil {
		return "", err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("Agnes 图像生成返回非成功状态：%d%s", resp.StatusCode, formatRemoteErrorBody(rawBody))
	}
	imageURL := extractAssetVisualImageURL(rawBody)
	if imageURL == "" {
		return "", fmt.Errorf("Agnes 图像生成响应没有可用图片 URL")
	}
	return imageURL, nil
}

func extractAssetVisualImageURL(rawBody []byte) string {
	var response struct {
		Data []struct {
			URL     string `json:"url"`
			B64JSON string `json:"b64_json"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rawBody, &response); err != nil {
		return ""
	}
	if len(response.Data) == 0 {
		return ""
	}
	if url := strings.TrimSpace(response.Data[0].URL); url != "" {
		return url
	}
	if value := strings.TrimSpace(response.Data[0].B64JSON); value != "" && len(value) < 1500000 {
		return "data:image/png;base64," + value
	}
	return ""
}

func firstReferenceURL(references []map[string]any) string {
	for _, source := range references {
		if value, _ := source["image_url"].(string); value != "" {
			return value
		}
		if value, _ := source["url"].(string); isLikelyImageURL(value) {
			return value
		}
	}
	return ""
}

func isLikelyImageURL(rawURL string) bool {
	lower := strings.ToLower(strings.TrimSpace(rawURL))
	return strings.HasSuffix(lower, ".png") ||
		strings.HasSuffix(lower, ".jpg") ||
		strings.HasSuffix(lower, ".jpeg") ||
		strings.HasSuffix(lower, ".webp") ||
		strings.HasSuffix(lower, ".avif")
}

func formatRemoteErrorBody(rawBody []byte) string {
	text := cleanOnlineText(string(rawBody))
	if text == "" {
		return ""
	}
	if len([]rune(text)) > 500 {
		text = string([]rune(text)[:500])
	}
	return "；响应：" + text
}
