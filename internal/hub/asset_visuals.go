package hub

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

const defaultAssetTurntableFrameCount = 6

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
	prompt := buildAssetImageCollectionPrompt(asset, color, frameCount, references)

	task, err := h.createAssetAITask(e.Auth.Id, asset.Id, config, frameCount, color, references)
	if err != nil {
		return e.InternalServerError("Failed to create AI task.", err)
	}
	visual, err := h.createAssetVisualRecord(e.Auth.Id, asset, task.Id, color, frameCount, references, prompt)
	if err != nil {
		return e.InternalServerError("Failed to create asset visual.", err)
	}

	frames := buildCollectedAssetVisualFrames(references, frameCount)
	if len(frames) == 0 {
		message := "没有找到可追溯设备图片。请先补充厂家支持页、官方图片 URL，或运行资料补全 Agent 后再收集。"
		task.Set("status", "failed")
		task.Set("error", message)
		task.Set("output_summary", map[string]any{"collected_images": 0, "reason": "no_traceable_images"})
		visual.Set("status", "failed")
		visual.Set("metadata", map[string]any{
			"collection_status": "no_sources",
			"error":             message,
		})
		if err := h.Save(task); err != nil {
			return e.InternalServerError("Failed to update AI task.", err)
		}
		if err := h.Save(visual); err != nil {
			return e.InternalServerError("Failed to update asset visual.", err)
		}
		return e.JSON(http.StatusOK, map[string]any{"task": task, "visual": visual, "status": "no_sources"})
	}

	task.Set("status", "ready")
	task.Set("output_summary", map[string]any{"collected_images": len(frames)})
	visual.Set("status", "ready")
	visual.Set("frames", frames)
	visual.Set("frame_count", len(frames))
	visual.Set("metadata", map[string]any{
		"collection_status": "ready",
		"note":              "设备图片来自可追溯来源。后续如需统一风格，只能基于这些真实图片做一致性整理。",
	})
	if err := h.Save(task); err != nil {
		return e.InternalServerError("Failed to update AI task.", err)
	}
	if err := h.Save(visual); err != nil {
		return e.InternalServerError("Failed to update asset visual.", err)
	}
	h.createOperationAudit(e, "", "asset_visual_generate", asset.Id, "", "success", "资产设备图片已收集")
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
		if _, err := strconv.Atoi(strings.TrimSpace(os.Getenv("PULSE_ASSET_VISUAL_FRAME_COUNT"))); err == nil {
			// Legacy env var is intentionally ignored now: device visuals are fixed to six factual views.
		}
	}
	return defaultAssetTurntableFrameCount
}

func normalizeAssetTurntableFrameCountWithDefault(value int, fallback int) int {
	return defaultAssetTurntableFrameCount
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
		"target_count":      frameCount,
		"color":             color,
		"reference_sources": references,
		"mode":              "collect_traceable_images",
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
	record.Set("kind", "official_reference")
	record.Set("status", "draft")
	record.Set("title", firstNonEmpty(asset.GetString("name"), asset.GetString("model"), "设备图片"))
	record.Set("color", color)
	record.Set("frame_count", frameCount)
	record.Set("primary", false)
	record.Set("sources", references)
	record.Set("prompt", prompt)
	record.Set("metadata", map[string]any{"collection_status": "pending"})
	if err := h.Save(record); err != nil {
		return nil, err
	}
	return record, nil
}

func (h *Hub) collectAssetVisualReferenceSources(asset *core.Record) []map[string]any {
	online := h.collectAssetOnlineReferenceEnrichment(asset)
	result := make([]map[string]any, 0, len(online.Sources))
	seen := map[string]bool{}
	if officialImageURL := recordMetadataString(asset, "official_image_url"); isLikelyImageURL(officialImageURL) {
		result = appendAssetVisualReferenceSource(result, seen, map[string]any{
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
		result = appendAssetVisualReferenceSource(result, seen, map[string]any{
			"title":      source.Title,
			"url":        source.URL,
			"image_url":  source.ImageURL,
			"type":       source.Type,
			"provider":   source.Provider,
			"confidence": source.Confidence,
		})
		if len(result) >= defaultAssetTurntableFrameCount {
			break
		}
	}
	if len(result) < defaultAssetTurntableFrameCount {
		result = h.collectAssetVisualPageImageSources(asset, result, seen, defaultAssetTurntableFrameCount)
	}
	return result
}

func appendAssetVisualReferenceSource(result []map[string]any, seen map[string]bool, source map[string]any) []map[string]any {
	imageURL, _ := source["image_url"].(string)
	if imageURL == "" {
		imageURL, _ = source["url"].(string)
	}
	if !isLikelyAssetVisualImageURL(imageURL) {
		return result
	}
	key := strings.ToLower(strings.TrimSpace(imageURL))
	if key == "" || seen[key] {
		return result
	}
	seen[key] = true
	if source["image_url"] == "" {
		source["image_url"] = imageURL
	}
	return append(result, source)
}

func (h *Hub) collectAssetVisualPageImageSources(asset *core.Record, result []map[string]any, seen map[string]bool, limit int) []map[string]any {
	pageURLs := dedupeStrings(nonEmptyStrings(
		recordMetadataString(asset, "support_url"),
		recordMetadataString(asset, "product_url"),
		recordMetadataString(asset, "official_url"),
	))
	for _, rawURL := range pageURLs {
		if len(result) >= limit {
			break
		}
		parsed, err := url.Parse(strings.TrimSpace(rawURL))
		if err != nil || parsed.Scheme == "" || parsed.Host == "" {
			continue
		}
		body, err := h.fetchAssetOnlineURL(parsed.String(), 1024*1024)
		if err != nil {
			continue
		}
		title := firstNonEmpty(extractHTMLTitle(body), parsed.Host)
		for _, imageURL := range extractHTMLImageURLs(parsed, body) {
			result = appendAssetVisualReferenceSource(result, seen, map[string]any{
				"title":      title,
				"url":        parsed.String(),
				"image_url":  imageURL,
				"type":       "official_page_image",
				"provider":   "support_url",
				"confidence": 90,
			})
			if len(result) >= limit {
				break
			}
		}
	}
	return result
}

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
		"Color: "+color+".",
		fmt.Sprintf("Need up to %d real source images. Do not invent device appearance.", frameCount),
		"Traceable image URLs: "+strings.Join(referenceLines, " ; "),
	), "\n")
}

func buildCollectedAssetVisualFrames(references []map[string]any, limit int) []map[string]any {
	frames := make([]map[string]any, 0, limit)
	for _, source := range references {
		imageURL, _ := source["image_url"].(string)
		if imageURL == "" {
			imageURL, _ = source["url"].(string)
		}
		if !isLikelyAssetVisualImageURL(imageURL) {
			continue
		}
		title, _ := source["title"].(string)
		sourceURL, _ := source["url"].(string)
		frames = append(frames, map[string]any{
			"index":        len(frames),
			"view":         "collected",
			"label":        fmt.Sprintf("图片 %d", len(frames)+1),
			"url":          imageURL,
			"source_title": title,
			"source_url":   sourceURL,
		})
		if len(frames) >= limit {
			break
		}
	}
	return frames
}

func isLikelyImageURL(rawURL string) bool {
	lower := strings.ToLower(strings.TrimSpace(rawURL))
	if parsed, err := url.Parse(lower); err == nil && parsed.Path != "" {
		lower = parsed.Path
	}
	return strings.HasSuffix(lower, ".png") ||
		strings.HasSuffix(lower, ".jpg") ||
		strings.HasSuffix(lower, ".jpeg") ||
		strings.HasSuffix(lower, ".webp") ||
		strings.HasSuffix(lower, ".avif")
}

func isLikelyAssetVisualImageURL(rawURL string) bool {
	if !isLikelyImageURL(rawURL) {
		return false
	}
	lower := strings.ToLower(strings.TrimSpace(rawURL))
	rejected := []string{
		"appdownload",
		"download.png",
		"qrcode",
		"qr-code",
		"/qr",
		"wechat",
		"weixin",
		"favicon",
		"logo",
		"icon",
		"sprite",
		"avatar",
		"placeholder",
		"loading",
		"blank",
		"appstore",
		"googleplay",
		"playstore",
		"share",
	}
	for _, marker := range rejected {
		if strings.Contains(lower, marker) {
			return false
		}
	}
	return true
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
