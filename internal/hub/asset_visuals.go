package hub

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
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

	"github.com/disintegration/imaging"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/filesystem"
	_ "golang.org/x/image/webp"
	nethtml "golang.org/x/net/html"
)

const defaultAssetTurntableFrameCount = 1
const defaultAssetVisualCandidateCount = 10
const defaultAssetVisualMaxImages = 12
const assetVisualRunningTaskStaleAfter = 15 * time.Minute
const assetVisualMaxDownloadBytes int64 = 8 << 20
const assetVisualMaxDimension = 1600
const assetVisualMinLogoDimension = 16
const assetVisualMinLogoCanvas = 128
const assetVisualVerificationBatchSize = 4

type assetTurntableVisualRequest struct {
	Color      string `json:"color"`
	FrameCount int    `json:"frame_count"`
	Async      bool   `json:"async"`
}

type assetVisualAIConfig struct {
	Enabled    bool
	Provider   string
	Endpoint   string
	APIKey     string
	Model      string
	FrameCount int
	// Deprecated source-discovery settings are retained only for stored-setting compatibility.
	// The collection path no longer reads them.
	ModelDiscoveryEnabled bool
	MaxImages             int
	OfficialOnly          bool
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
	frameCount := defaultAssetVisualCandidateCount
	if assetUsesProviderLogoVisual(asset) {
		frameCount = 1
	}
	color := firstNonEmpty(strings.TrimSpace(req.Color), recordMetadataString(asset, "color"), recordMetadataString(asset, "device_color"))
	if message := validateAssetVisualGenerationPrerequisites(asset, color, config); message != "" {
		task, visual, createErr := h.createFailedAssetVisualTaskAndRecord(e.Auth.Id, asset, config, frameCount, color, message, "blocked")
		if createErr != nil {
			return e.InternalServerError("Failed to create AI task.", createErr)
		}
		return e.JSON(http.StatusOK, map[string]any{"task": task, "visual": visual, "status": "blocked", "message": message})
	}
	h.failStaleAssetVisualTasks(e.Auth.Id, asset.Id)
	references := h.collectAssetVisualReferenceSourcesForColor(asset, config, color)

	task, err := h.createAssetAITask(e.Auth.Id, asset.Id, config, frameCount, color, references)
	if err != nil {
		return e.InternalServerError("Failed to create AI task.", err)
	}
	referenceVisual, err := h.createAssetVisualRecord(e.Auth.Id, asset, task.Id, color, frameCount, references, buildAssetImageCollectionPrompt(asset, color, frameCount, references))
	if err != nil {
		return e.InternalServerError("Failed to create asset visual.", err)
	}

	frames, files, processingSummary := h.archiveCollectedAssetVisualFrames(asset, references, frameCount, color, config)
	if len(frames) == 0 {
		message := assetVisualCollectionEmptyMessage(asset)
		reason := "no_archivable_images"
		if len(references) == 0 {
			reason = "official_sources_required"
		}
		task.Set("status", "failed")
		task.Set("error", message)
		_ = mergeAssetVisualTaskSummary(task, map[string]any{
			"phase":            "failed",
			"phase_label":      "收集失败",
			"progress_percent": 100,
			"collected_images": 0,
			"reason":           reason,
			"processing":       processingSummary,
		})
		referenceVisual.Set("status", "failed")
		referenceVisual.Set("metadata", map[string]any{
			"collection_status": "no_sources",
			"error":             message,
		})
		if err := h.Save(task); err != nil {
			return e.InternalServerError("Failed to update AI task.", err)
		}
		if err := h.Save(referenceVisual); err != nil {
			return e.InternalServerError("Failed to update asset visual.", err)
		}
		return e.JSON(http.StatusOK, map[string]any{"task": task, "visual": referenceVisual, "status": "no_sources"})
	}

	referenceVisual.Set("files", files)
	if err := h.Save(referenceVisual); err != nil {
		return e.InternalServerError("Failed to archive asset visual files.", err)
	}
	storedFiles := referenceVisual.GetStringSlice("files")
	if len(storedFiles) != len(frames) {
		return e.InternalServerError("Failed to archive all asset visual files.", errors.New("stored asset visual file count mismatch"))
	}
	for index := range frames {
		frames[index]["file"] = storedFiles[index]
		frames[index]["file_record_id"] = referenceVisual.Id
		frames[index]["url"] = ""
	}
	referenceVisual.Set("status", "ready")
	referenceVisual.Set("frames", frames)
	referenceVisual.Set("frame_count", len(frames))
	referenceVisual.Set("metadata", map[string]any{
		"collection_status": "ready",
		"visual_role":       "candidate_set",
		"presentation":      assetVisualPresentation(asset),
		"candidate_count":   len(frames),
		"processing":        processingSummary,
		"note":              assetVisualCollectionNote(asset),
	})
	referenceVisual.Set("primary", false)
	if err := h.Save(referenceVisual); err != nil {
		return e.InternalServerError("Failed to update asset visual.", err)
	}
	if err := h.updateAssetVisualTaskProgress(task, map[string]any{
		"phase":            "references_ready",
		"phase_label":      assetVisualCollectionReadyLabel(asset),
		"progress_percent": 100,
		"collected_images": len(frames),
		"reference_visual": referenceVisual.Id,
		"generated_images": 0,
		"mode":             "reference_image_collection",
		"selected_color":   color,
		"candidate_count":  len(frames),
		"processing":       processingSummary,
	}); err != nil {
		return e.InternalServerError("Failed to update AI task.", err)
	}
	task.Set("status", "ready")
	task.Set("error", "")
	if err := h.Save(task); err != nil {
		return e.InternalServerError("Failed to update AI task.", err)
	}
	h.createOperationAudit(e, "", "asset_visual_collect", asset.Id, "", "success", assetVisualCollectionAuditDetail(asset))
	return e.JSON(http.StatusOK, map[string]any{"task": task, "visual": referenceVisual, "status": "ready", "message": assetVisualCollectionSuccessMessage(asset)})
}

type selectAssetVisualCandidateRequest struct {
	FrameIndex int `json:"frame_index"`
}

func (h *Hub) selectAssetVisualCandidate(e *core.RequestEvent) error {
	assetID := strings.TrimSpace(e.Request.PathValue("id"))
	visualID := strings.TrimSpace(e.Request.PathValue("visualId"))
	if assetID == "" || visualID == "" {
		return e.BadRequestError("Missing asset visual selection target.", nil)
	}
	asset, err := h.findUserAssetRecord(assetID, e.Auth.Id)
	if err != nil {
		return e.NotFoundError("Asset not found.", err)
	}
	visual, err := h.FindRecordById("asset_visuals", visualID)
	if err != nil || visual.GetString("user") != e.Auth.Id || visual.GetString("asset") != asset.Id {
		return e.NotFoundError("Asset visual not found.", err)
	}
	var req selectAssetVisualCandidateRequest
	_ = json.NewDecoder(e.Request.Body).Decode(&req)
	var frames []map[string]any
	_ = visual.UnmarshalJSONField("frames", &frames)
	if len(frames) == 0 {
		return e.BadRequestError("候选图为空，请重新获取图片。", nil)
	}
	if req.FrameIndex < 0 || req.FrameIndex >= len(frames) {
		return e.BadRequestError("候选图序号无效。", nil)
	}
	selectedFrame := cloneStringAnyMap(frames[req.FrameIndex])
	if !isSelectableAssetVisualFrame(selectedFrame) {
		return e.BadRequestError("候选图不是可用图片。", nil)
	}
	if stringFromAny(selectedFrame["file"]) != "" && stringFromAny(selectedFrame["file_record_id"]) == "" {
		selectedFrame["file_record_id"] = visual.Id
	}
	selectedFrame["index"] = 0
	selectedFrame["label"] = "主图"

	collection, err := h.FindCachedCollectionByNameOrId("asset_visuals")
	if err != nil {
		return e.InternalServerError("Failed to load asset visual collection.", err)
	}
	record := core.NewRecord(collection)
	record.Set("user", e.Auth.Id)
	record.Set("asset", asset.Id)
	record.Set("task", visual.GetString("task"))
	record.Set("kind", "official_reference")
	record.Set("status", "ready")
	record.Set("title", firstNonEmpty(asset.GetString("name"), asset.GetString("model"), "设备主图"))
	record.Set("color", firstNonEmpty(stringFromAny(selectedFrame["color"]), visual.GetString("color")))
	record.Set("frame_count", 1)
	record.Set("primary", true)
	record.Set("frames", []map[string]any{selectedFrame})
	var sources []map[string]any
	_ = visual.UnmarshalJSONField("sources", &sources)
	record.Set("sources", sources)
	record.Set("prompt", visual.GetString("prompt"))
	record.Set("metadata", map[string]any{
		"collection_status":    "ready",
		"visual_role":          "final_reference",
		"selected_from_visual": visual.Id,
		"selected_frame_index": req.FrameIndex,
		"note":                 "用户从设备图片候选集中选择的主图。",
	})
	if err := h.Save(record); err != nil {
		return e.InternalServerError("Failed to save selected asset visual.", err)
	}
	if err := h.demotePreviousPrimaryAssetVisuals(e.Auth.Id, asset.Id, record.Id); err != nil {
		return e.InternalServerError("Failed to update previous asset visuals.", err)
	}
	h.createOperationAudit(e, "", "asset_visual_select", asset.Id, "", "success", "资产设备主图已选择")
	return e.JSON(http.StatusOK, map[string]any{"visual": record, "status": "ready", "message": "设备主图已更新。"})
}

func (h *Hub) updateAssetVisualTaskProgress(task *core.Record, update map[string]any) error {
	if task == nil {
		return nil
	}
	if err := mergeAssetVisualTaskSummary(task, update); err != nil {
		return err
	}
	return h.Save(task)
}

func (h *Hub) failAssetVisualTaskByID(taskID string, message string, summary map[string]any) {
	task, err := h.FindRecordById("ai_tasks", taskID)
	if err != nil {
		return
	}
	_ = h.failAssetVisualTask(task, message, summary)
}

func (h *Hub) failStaleAssetVisualTasks(userID string, assetID string) {
	records, err := h.FindRecordsByFilter(
		"ai_tasks",
		"user = {:user} && asset = {:asset} && kind = 'asset_visual' && (status = 'running' || status = 'queued')",
		"-created",
		-1,
		0,
		map[string]any{
			"user":  userID,
			"asset": assetID,
		},
	)
	if err != nil {
		return
	}
	cutoff := time.Now().UTC().Add(-assetVisualRunningTaskStaleAfter)
	for _, record := range records {
		created := record.GetDateTime("created")
		if !created.IsZero() && created.Time().UTC().After(cutoff) {
			continue
		}
		_ = h.failAssetVisualTask(record, "设备图片 Agent 任务超时，已停止等待。请重新触发生成。", map[string]any{"reason": "stale_running_task"})
	}
}

func (h *Hub) failAssetVisualTask(task *core.Record, message string, summary map[string]any) error {
	if summary == nil {
		summary = map[string]any{}
	}
	summary["phase"] = "failed"
	summary["phase_label"] = "生成失败"
	summary["progress_percent"] = 100
	if err := mergeAssetVisualTaskSummary(task, summary); err != nil {
		return err
	}
	task.Set("status", "failed")
	task.Set("error", message)
	return h.Save(task)
}

func mergeAssetVisualTaskSummary(task *core.Record, update map[string]any) error {
	if task == nil {
		return nil
	}
	summary := map[string]any{}
	_ = task.UnmarshalJSONField("output_summary", &summary)
	if summary == nil {
		summary = map[string]any{}
	}
	for key, value := range update {
		summary[key] = value
	}
	phase := stringFromAny(update["phase"])
	if phase != "" {
		label := firstNonEmpty(stringFromAny(update["phase_label"]), phase)
		history := normalizeAssetVisualPhaseHistory(summary["phase_history"])
		if len(history) == 0 || stringFromAny(history[len(history)-1]["phase"]) != phase {
			history = append(history, map[string]any{
				"phase": phase,
				"label": label,
				"at":    time.Now().UTC().Format(time.RFC3339),
			})
		}
		summary["phase_history"] = history
	}
	task.Set("output_summary", summary)
	return nil
}

func normalizeAssetVisualPhaseHistory(value any) []map[string]any {
	switch typed := value.(type) {
	case []map[string]any:
		return append([]map[string]any{}, typed...)
	case []any:
		result := make([]map[string]any, 0, len(typed))
		for _, item := range typed {
			if record, ok := item.(map[string]any); ok {
				result = append(result, record)
			}
		}
		return result
	default:
		return nil
	}
}

func firstNonNilRecord(records ...*core.Record) *core.Record {
	for _, record := range records {
		if record != nil {
			return record
		}
	}
	return nil
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
	rawEndpoint := strings.TrimSpace(os.Getenv("PULSE_ASSET_VISUAL_AI_ENDPOINT"))
	return assetVisualAIConfig{
		Enabled:               enabled,
		Provider:              firstNonEmpty(strings.TrimSpace(os.Getenv("PULSE_ASSET_VISUAL_AI_PROVIDER")), "agnes"),
		Endpoint:              normalizeAssetVisualDiscoveryEndpoint(firstNonEmpty(rawEndpoint, "https://apihub.agnes-ai.com/v1/chat/completions")),
		APIKey:                key,
		Model:                 firstNonEmpty(strings.TrimSpace(os.Getenv("PULSE_ASSET_VISUAL_AI_MODEL")), "agnes-2.0-flash"),
		FrameCount:            normalizeAssetTurntableFrameCount(0),
		ModelDiscoveryEnabled: false,
		MaxImages:             normalizeAssetVisualMaxImages(configIntEnvDefault("PULSE_ASSET_VISUAL_AI_MAX_IMAGES", defaultAssetVisualMaxImages)),
		OfficialOnly:          true,
	}
}

func normalizeAssetTurntableFrameCount(value int) int {
	// Legacy request/settings/env values are intentionally ignored now:
	// device image collection keeps one factual image for the selected official color.
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
		"mode":              "reference_image_collection",
		"style":             "traceable_device_images",
	})
	record.Set("output_summary", map[string]any{
		"phase":                          "reference_collecting",
		"phase_label":                    "正在收集官方图片",
		"progress_percent":               10,
		"source_policy":                  "official_only",
		"visual_verification_configured": config.Ready(),
		"phase_history": []map[string]any{
			{
				"phase": "reference_collecting",
				"label": "正在收集参考图",
				"at":    time.Now().UTC().Format(time.RFC3339),
			},
		},
	})
	record.Set("metadata", map[string]any{"manual_trigger": true})
	if err := h.Save(record); err != nil {
		return nil, err
	}
	return record, nil
}

func (h *Hub) createFailedAssetVisualTaskAndRecord(userID string, asset *core.Record, config assetVisualAIConfig, frameCount int, color string, message string, reason string) (*core.Record, *core.Record, error) {
	task, err := h.createAssetAITask(userID, asset.Id, config, frameCount, color, nil)
	if err != nil {
		return nil, nil, err
	}
	task.Set("status", "failed")
	task.Set("error", message)
	task.Set("output_summary", map[string]any{"reason": reason})
	if err := h.Save(task); err != nil {
		return nil, nil, err
	}
	visual, err := h.createAssetVisualRecord(userID, asset, task.Id, color, frameCount, nil, "")
	if err != nil {
		return nil, nil, err
	}
	visual.Set("status", "failed")
	visual.Set("metadata", map[string]any{
		"collection_status": reason,
		"error":             message,
	})
	if err := h.Save(visual); err != nil {
		return nil, nil, err
	}
	return task, visual, nil
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

func (h *Hub) demotePreviousPrimaryAssetVisuals(userID string, assetID string, activeVisualID string) error {
	records, err := h.FindRecordsByFilter(
		"asset_visuals",
		"user = {:user} && asset = {:asset} && primary = true && id != {:active}",
		"-created",
		-1,
		0,
		map[string]any{
			"user":   userID,
			"asset":  assetID,
			"active": activeVisualID,
		},
	)
	if err != nil {
		return err
	}
	for _, record := range records {
		metadata := map[string]any{}
		_ = record.UnmarshalJSONField("metadata", &metadata)
		if metadata == nil {
			metadata = map[string]any{}
		}
		metadata["superseded_by"] = activeVisualID
		metadata["superseded_at"] = time.Now().UTC().Format(time.RFC3339)
		record.Set("primary", false)
		record.Set("metadata", metadata)
		if err := h.Save(record); err != nil {
			return err
		}
	}
	return nil
}

func (h *Hub) collectAssetVisualReferenceSources(asset *core.Record) []map[string]any {
	return h.collectAssetVisualReferenceSourcesForColor(asset, h.assetVisualAIConfig(), firstNonEmpty(recordMetadataString(asset, "color"), recordMetadataString(asset, "device_color")))
}

func (h *Hub) collectAssetVisualReferenceSourcesForColor(asset *core.Record, config assetVisualAIConfig, color string) []map[string]any {
	result := make([]map[string]any, 0, defaultAssetTurntableFrameCount*6)
	seen := map[string]bool{}
	candidateLimit := assetVisualReferenceLimit(asset, config.MaxImages)
	if officialImageURL := recordMetadataString(asset, "official_image_url"); isLikelyImageURL(officialImageURL) {
		result = appendAssetVisualReferenceSource(asset, result, seen, map[string]any{
			"title":      "已确认官方设备图片",
			"url":        officialImageURL,
			"image_url":  officialImageURL,
			"type":       "official_image",
			"provider":   "asset_master",
			"color":      firstNonEmpty(color, recordMetadataString(asset, "color"), recordMetadataString(asset, "device_color")),
			"confidence": 96,
		})
	}
	if len(result) < candidateLimit {
		result = h.collectAssetVisualPageImageSources(asset, result, seen, candidateLimit)
	}
	return result
}

func normalizeAssetVisualMaxImages(value int) int {
	if value <= 0 {
		return defaultAssetVisualMaxImages
	}
	if value < 2 {
		return 2
	}
	if value > 12 {
		return 12
	}
	return value
}

func assetUsesProviderLogoVisual(asset *core.Record) bool {
	if asset == nil {
		return false
	}
	switch strings.TrimSpace(asset.GetString("type")) {
	case "internet", "web_endpoint":
		return true
	default:
		return false
	}
}

func assetVisualReferenceLimit(asset *core.Record, configuredLimit int) int {
	if assetUsesProviderLogoVisual(asset) {
		return 1
	}
	return normalizeAssetVisualMaxImages(configuredLimit)
}

func assetVisualPresentation(asset *core.Record) string {
	if assetUsesProviderLogoVisual(asset) {
		return "provider_logo"
	}
	return "device_image"
}

func assetVisualCollectionEmptyMessage(asset *core.Record) string {
	if assetUsesProviderLogoVisual(asset) {
		return "没有找到可归档的官方服务商 Logo。请先维护服务商官网或官方资料链接后重试。"
	}
	return "没有找到可归档的官方设备图片。请先维护厂家产品页、支持页或官方图片 URL 后重试。"
}

func assetVisualCollectionNote(asset *core.Record) string {
	if assetUsesProviderLogoVisual(asset) {
		return "只接受服务商官方页面中的 Logo，已归档到本地存储并保留来源用于追溯。"
	}
	return "只接受厂商官方页面或官方图片地址，图片已归档到本地存储并保留来源用于追溯。"
}

func assetVisualCollectionReadyLabel(asset *core.Record) string {
	if assetUsesProviderLogoVisual(asset) {
		return "已收集服务商 Logo"
	}
	return "已收集设备图"
}

func assetVisualCollectionAuditDetail(asset *core.Record) string {
	if assetUsesProviderLogoVisual(asset) {
		return "资产服务商 Logo 已收集"
	}
	return "资产设备候选图片已收集"
}

func assetVisualCollectionSuccessMessage(asset *core.Record) string {
	if assetUsesProviderLogoVisual(asset) {
		return "服务商 Logo 已收集，请在编辑资产右侧选择主图。"
	}
	return "设备候选图片已收集，请在编辑资产右侧选择主图。"
}

func countAssetVisualReferencesByProvider(references []map[string]any, provider string) int {
	count := 0
	for _, reference := range references {
		if stringFromAny(reference["provider"]) == provider {
			count++
		}
	}
	return count
}

func (h *Hub) collectAssetVisualAISourceDiscovery(asset *core.Record, color string, config assetVisualAIConfig, result []map[string]any, seen map[string]bool, limit int) []map[string]any {
	if !config.Ready() || !config.ModelDiscoveryEnabled || !assetVisualEndpointLooksLikeChatEndpoint(config.Endpoint) {
		return result
	}
	payload, err := buildAssetVisualAISourceDiscoveryPayload(asset, color, config.Model, limit)
	if err != nil {
		return result
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return result
	}
	rawBody, _, errMessage := callAssetOnlineAIModel(assetOnlineAIConfig{
		Enabled:  config.Enabled,
		Provider: config.Provider,
		Endpoint: config.Endpoint,
		APIKey:   config.APIKey,
		Model:    config.Model,
	}, body)
	if errMessage != "" {
		return result
	}
	candidates := extractAssetVisualAIReferenceCandidates(extractAssetOnlineAIContent(rawBody))
	for _, candidate := range candidates {
		if len(result) >= limit {
			break
		}
		imageURL := firstNonEmpty(candidate.ImageURL, candidate.URL)
		if imageURL == "" || !assetVisualImageURLAccepted(asset, imageURL) {
			continue
		}
		sourceType := firstNonEmpty(candidate.Type, classifyAssetOnlineURL(imageURL))
		if config.OfficialOnly && !assetVisualAIReferenceSourceAllowed(asset, imageURL) {
			continue
		}
		result = appendAssetVisualReferenceSource(asset, result, seen, map[string]any{
			"title":      firstNonEmpty(candidate.Title, "资料补全 Agent 找到的设备图"),
			"url":        firstNonEmpty(candidate.SourceURL, imageURL),
			"image_url":  imageURL,
			"type":       firstNonEmpty(sourceType, "official_image"),
			"provider":   "asset_visual_agent",
			"color":      firstNonEmpty(candidate.Color, inferAssetVisualSourceColor(asset, color, strings.Join(nonEmptyStrings(candidate.Title, candidate.SourceURL, imageURL), " "))),
			"confidence": candidate.Confidence,
		})
	}
	return result
}

func assetVisualEndpointLooksLikeChatEndpoint(endpoint string) bool {
	return strings.Contains(strings.ToLower(strings.TrimSpace(endpoint)), "/chat/completions")
}

func assetVisualAIReferenceSourceAllowed(asset *core.Record, rawURL string) bool {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		return false
	}
	if isLocalAssetOnlineHost(parsed.Hostname()) {
		return true
	}
	if assetUsesProviderLogoVisual(asset) {
		return assetVisualServiceLogoHostAllowed(asset, parsed.Hostname())
	}
	if !assetOnlineSourceHasOfficialAuthority(assetOnlineSource{Type: classifyAssetOnlineURL(parsed.String())}) {
		return false
	}
	return assetVisualOfficialHostMatchesVendor(asset.GetString("vendor"), parsed.Hostname())
}

func assetVisualServiceLogoHostAllowed(asset *core.Record, rawHost string) bool {
	host := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(rawHost), "www."))
	if host == "" {
		return false
	}
	for _, trustedHost := range assetVisualServiceProviderHosts(asset.GetString("vendor")) {
		if assetVisualHostMatches(host, trustedHost) {
			return true
		}
	}
	for _, metadataKey := range []string{"support_url", "product_url", "official_url", "service_url", "public_url", "external_url", "internal_url", "check_url", "url"} {
		candidate, err := url.Parse(recordMetadataString(asset, metadataKey))
		if err == nil && assetVisualHostMatches(host, candidate.Hostname()) {
			return true
		}
	}
	return isKnownOfficialAssetHost(host) && assetVisualOfficialHostMatchesVendor(asset.GetString("vendor"), host)
}

func assetVisualServiceProviderHosts(vendor string) []string {
	normalized := strings.ToLower(strings.TrimSpace(vendor))
	for marker, hosts := range map[string][]string{
		"联通":        {"10010.com", "chinaunicom.cn", "chinaunicom.com"},
		"unicom":    {"10010.com", "chinaunicom.cn", "chinaunicom.com"},
		"移动":        {"10086.cn", "chinamobile.com"},
		"mobile":    {"10086.cn", "chinamobile.com"},
		"电信":        {"189.cn", "chinatelecom.com.cn"},
		"telecom":   {"189.cn", "chinatelecom.com.cn"},
		"广电":        {"cbn.cn", "cbn.net.cn"},
		"broadcast": {"cbn.cn", "cbn.net.cn"},
	} {
		if strings.Contains(normalized, marker) {
			return hosts
		}
	}
	return nil
}

func assetVisualHostMatches(host string, trustedHost string) bool {
	host = strings.ToLower(strings.TrimPrefix(strings.TrimSpace(host), "www."))
	trustedHost = strings.ToLower(strings.TrimPrefix(strings.TrimSpace(trustedHost), "www."))
	return host != "" && trustedHost != "" && (host == trustedHost || strings.HasSuffix(host, "."+trustedHost))
}

func assetVisualOfficialHostMatchesVendor(vendor string, host string) bool {
	vendor = strings.ToLower(strings.TrimSpace(vendor))
	host = strings.ToLower(strings.TrimSpace(host))
	if vendor == "" {
		return true
	}
	knownHosts := map[string][]string{
		"xiaomi":   {"mi.com", "mi-img.com", "mifile.cn", "xiaomi.com", "redmi.com"},
		"redmi":    {"mi.com", "mi-img.com", "mifile.cn", "xiaomi.com", "redmi.com"},
		"apple":    {"apple.com"},
		"samsung":  {"samsung.com"},
		"lenovo":   {"lenovo.com"},
		"asus":     {"asus.com"},
		"tp-link":  {"tp-link.com", "tplinkcloud.com"},
		"synology": {"synology.com"},
		"qnap":     {"qnap.com"},
		"unraid":   {"unraid.net"},
		"fnos":     {"fnos.com"},
		"huawei":   {"huawei.com"},
		"honor":    {"honor.com"},
		"oppo":     {"oppo.com"},
	}
	for marker, hosts := range knownHosts {
		if !strings.Contains(vendor, marker) {
			continue
		}
		for _, allowedHost := range hosts {
			if host == allowedHost || strings.HasSuffix(host, "."+allowedHost) {
				return true
			}
		}
		return false
	}
	return true
}

type assetVisualAIReferenceCandidate struct {
	URL        string
	ImageURL   string
	SourceURL  string
	Title      string
	Type       string
	Color      string
	Confidence int
}

func extractAssetVisualAIReferenceCandidates(content string) []assetVisualAIReferenceCandidate {
	content = strings.TrimSpace(content)
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	var parsed struct {
		ImageURLs  []string `json:"image_urls"`
		SourceURLs []string `json:"source_urls"`
		Images     []struct {
			URL        string `json:"url"`
			ImageURL   string `json:"image_url"`
			SourceURL  string `json:"source_url"`
			Title      string `json:"title"`
			Type       string `json:"type"`
			Color      string `json:"color"`
			Confidence int    `json:"confidence"`
		} `json:"images"`
		Sources []struct {
			URL        string `json:"url"`
			ImageURL   string `json:"image_url"`
			SourceURL  string `json:"source_url"`
			Title      string `json:"title"`
			Type       string `json:"type"`
			Color      string `json:"color"`
			Confidence int    `json:"confidence"`
		} `json:"sources"`
	}
	if err := json.Unmarshal([]byte(strings.TrimSpace(content)), &parsed); err != nil {
		return nil
	}
	result := make([]assetVisualAIReferenceCandidate, 0, len(parsed.ImageURLs)+len(parsed.Sources)+len(parsed.Images))
	for _, rawURL := range normalizeAssetOnlineAISourceURLs(parsed.ImageURLs) {
		result = append(result, assetVisualAIReferenceCandidate{URL: rawURL, ImageURL: rawURL, Type: classifyAssetOnlineURL(rawURL), Confidence: 88})
	}
	for _, item := range parsed.Images {
		result = append(result, normalizeAssetVisualAIReferenceCandidate(item.URL, item.ImageURL, item.SourceURL, item.Title, item.Type, item.Color, item.Confidence))
	}
	for _, item := range parsed.Sources {
		result = append(result, normalizeAssetVisualAIReferenceCandidate(item.URL, item.ImageURL, item.SourceURL, item.Title, item.Type, item.Color, item.Confidence))
	}
	if len(parsed.SourceURLs) > 0 {
		for _, rawURL := range normalizeAssetOnlineAISourceURLs(parsed.SourceURLs) {
			if !isLikelyImageURL(rawURL) {
				continue
			}
			result = append(result, assetVisualAIReferenceCandidate{URL: rawURL, ImageURL: rawURL, Type: classifyAssetOnlineURL(rawURL), Confidence: 82})
		}
	}
	return dedupeAssetVisualAIReferenceCandidates(result)
}

func normalizeAssetVisualAIReferenceCandidate(urlValue string, imageURL string, sourceURL string, title string, sourceType string, color string, confidence int) assetVisualAIReferenceCandidate {
	urls := normalizeAssetOnlineAISourceURLs(nonEmptyStrings(imageURL, urlValue))
	if len(urls) == 0 {
		return assetVisualAIReferenceCandidate{}
	}
	imageURL = urls[0]
	sourceURLs := normalizeAssetOnlineAISourceURLs(nonEmptyStrings(sourceURL, urlValue))
	if len(sourceURLs) > 0 {
		sourceURL = sourceURLs[0]
	}
	if confidence <= 0 || confidence > 100 {
		confidence = 82
	}
	return assetVisualAIReferenceCandidate{
		URL:        imageURL,
		ImageURL:   imageURL,
		SourceURL:  sourceURL,
		Title:      cleanOnlineText(title),
		Type:       firstNonEmpty(strings.TrimSpace(sourceType), classifyAssetOnlineURL(imageURL)),
		Color:      cleanOnlineText(color),
		Confidence: confidence,
	}
}

func dedupeAssetVisualAIReferenceCandidates(candidates []assetVisualAIReferenceCandidate) []assetVisualAIReferenceCandidate {
	result := make([]assetVisualAIReferenceCandidate, 0, len(candidates))
	seen := map[string]bool{}
	for _, candidate := range candidates {
		imageURL := strings.TrimSpace(candidate.ImageURL)
		if imageURL == "" {
			imageURL = strings.TrimSpace(candidate.URL)
		}
		if imageURL == "" {
			continue
		}
		key := strings.ToLower(imageURL)
		if seen[key] {
			continue
		}
		seen[key] = true
		candidate.ImageURL = imageURL
		candidate.URL = firstNonEmpty(candidate.URL, imageURL)
		result = append(result, candidate)
	}
	return result
}

func buildAssetVisualAISourceDiscoveryPayload(asset *core.Record, color string, model string, limit int) (map[string]any, error) {
	if assetUsesProviderLogoVisual(asset) {
		limit = 1
	} else {
		limit = normalizeAssetVisualMaxImages(limit)
	}
	searchKeywords := buildAssetVisualSearchKeywords(asset, color)
	systemPrompt := "你是 Pulse 资产中心的设备图片找图 Agent。先使用提供的 search_keywords 组合多组检索词，再收集同一资产适合作为档案主图的真实图片候选。不要生成图片，不要返回产品页截图、营销横幅、海报、色卡、图标、Logo、相机样张、带水印图片或明显不同型号。目标是尽可能返回 10 张高适配候选，并按可识别颜色分类；颜色未知时可留空。优先级：厂商官网产品图库、官方 CDN、支持页和说明书，其次是可追溯规格库、可信媒体或零售产品图。厂商、型号和内部型号用于提高匹配度，不完整时应结合资产名称和类型继续检索，不得因此拒绝任务。返回严格 JSON：{\"search_keywords\":[\"...\"],\"sources\":[{\"image_url\":\"https://...\",\"source_url\":\"https://...\",\"title\":\"...\",\"color\":\"可选颜色\",\"type\":\"official_image|reference_image\",\"confidence\":90}]}。"
	policy := map[string]any{
		"must_be_real_device_photo_or_render": true,
		"required_result_count":               limit,
		"must_match_selected_color":           false,
		"group_by_detected_color":             true,
		"color_required_per_source":           false,
		"preferred_sources":                   []string{"official product gallery", "official specs page image", "official support image", "official CDN image", "traceable product reference"},
		"reject":                              []string{"AI generated image", "marketing banner", "poster", "color chart", "icon", "logo", "camera sample", "watermark", "watermarked", "带水印", "different variant"},
	}
	if assetUsesProviderLogoVisual(asset) {
		systemPrompt = "你是 Pulse 资产中心的服务商 Logo 找图 Agent。根据服务商和服务名称，只收集一张可作为资产档案主图的官方品牌 Logo。不要生成图片，不要返回营销横幅、海报、截图、水印图、应用下载码或第三方改色 Logo。必须优先返回服务商官网、官方 CDN 或官方媒体资料中的可下载 PNG、JPG、WEBP 或 AVIF 图片，且 source_url 必须可追溯。返回严格 JSON：{\"search_keywords\":[\"...\"],\"sources\":[{\"image_url\":\"https://...\",\"source_url\":\"https://...\",\"title\":\"...\",\"type\":\"official_brand_logo\",\"confidence\":90}]}。"
		policy = map[string]any{
			"must_be_official_provider_logo": true,
			"required_result_count":          1,
			"preferred_sources":              []string{"official provider website", "official provider CDN", "official media kit"},
			"accepted_formats":               []string{"png", "jpg", "jpeg", "webp", "avif"},
			"reject":                         []string{"AI generated image", "marketing banner", "poster", "website screenshot", "watermark", "watermarked", "二维码", "QR code"},
		}
	}
	return map[string]any{
		"model":       model,
		"temperature": 0,
		"messages": []map[string]string{
			{
				"role":    "system",
				"content": systemPrompt,
			},
			{
				"role": "user",
				"content": mustJSON(map[string]any{
					"asset": map[string]any{
						"name":           asset.GetString("name"),
						"type":           asset.GetString("type"),
						"vendor":         asset.GetString("vendor"),
						"model":          asset.GetString("model"),
						"internal_model": recordMetadataString(asset, "internal_model"),
						"selected_color": color,
						"known_colors":   assetOfficialColorOptions(asset),
						"support_url":    recordMetadataString(asset, "support_url"),
						"product_url":    recordMetadataString(asset, "product_url"),
						"official_url":   recordMetadataString(asset, "official_url"),
					},
					"max_images":      limit,
					"search_keywords": searchKeywords,
					"source_policy":   policy,
				}),
			},
		},
		"response_format": map[string]string{"type": "json_object"},
	}, nil
}

func buildAssetVisualSearchKeywords(asset *core.Record, color string) []string {
	identity := nonEmptyStrings(
		asset.GetString("vendor"),
		asset.GetString("model"),
		recordMetadataString(asset, "internal_model"),
		asset.GetString("name"),
	)
	base := strings.Join(identity, " ")
	if base == "" {
		base = asset.GetString("type")
	}
	if assetUsesProviderLogoVisual(asset) {
		return dedupeStrings([]string{
			strings.TrimSpace(base + " 官方 Logo PNG"),
			strings.TrimSpace(base + " official brand logo PNG"),
			strings.TrimSpace(base + " 品牌标识 PNG"),
		})
	}
	keywords := []string{
		strings.TrimSpace(base + " product image"),
		strings.TrimSpace(base + " official render"),
		strings.TrimSpace(base + " device photo"),
	}
	if typeName := strings.TrimSpace(asset.GetString("type")); typeName != "" {
		keywords = append(keywords, strings.TrimSpace(base+" "+typeName+" image"))
	}
	if color = strings.TrimSpace(color); color != "" {
		keywords = append([]string{strings.TrimSpace(base + " " + color + " image")}, keywords...)
	}
	return dedupeStrings(keywords)
}

func appendAssetVisualReferenceSource(asset *core.Record, result []map[string]any, seen map[string]bool, source map[string]any) []map[string]any {
	imageURL, _ := source["image_url"].(string)
	if imageURL == "" {
		imageURL, _ = source["url"].(string)
	}
	if !assetVisualReferenceSourceAccepted(asset, source) {
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
	return h.collectAssetVisualPageImageSourcesFromInputs(asset, assetVisualReferencePageInputs(asset), result, seen, limit, false)
}

func (h *Hub) collectAssetVisualPageImageSourcesFromInputs(asset *core.Record, pageInputs []assetVisualReferencePageInput, result []map[string]any, seen map[string]bool, limit int, allowReferencePages bool) []map[string]any {
	for _, page := range pageInputs {
		if len(result) >= limit {
			break
		}
		parsed, err := url.Parse(strings.TrimSpace(page.URL))
		if err != nil || parsed.Scheme == "" || parsed.Host == "" {
			continue
		}
		body, err := h.fetchAssetOnlineURL(parsed.String(), 1024*1024)
		if err != nil {
			continue
		}
		title := firstNonEmpty(extractHTMLTitle(body), parsed.Host)
		sourceType := assetVisualReferencePageSourceType(parsed, title, body)
		isOfficial := assetOnlineSourceHasOfficialAuthority(assetOnlineSource{Type: sourceType})
		if !isOfficial && !allowReferencePages {
			continue
		}
		imageType := "search_reference_page_image"
		if isOfficial {
			imageType = "official_page_image"
		}
		result = h.collectAssetVisualBundleImageSources(asset, parsed, body, page.Provider, result, seen, limit)
		if len(result) >= limit {
			break
		}
		for _, candidate := range extractAssetVisualHTMLImageCandidates(parsed, body) {
			if !assetVisualHTMLCandidateMatchesAsset(asset, candidate) {
				continue
			}
			result = appendAssetVisualReferenceSource(asset, result, seen, map[string]any{
				"title":      title,
				"url":        parsed.String(),
				"image_url":  candidate.URL,
				"type":       imageType,
				"provider":   page.Provider,
				"color":      inferAssetVisualSourceColor(asset, "", strings.Join(nonEmptyStrings(title, candidate.Context, candidate.URL), " ")),
				"confidence": 90,
			})
			if len(result) >= limit {
				break
			}
		}
	}
	return result
}

func assetVisualReferencePageSourceType(parsed *url.URL, title string, body string) string {
	signals := cleanOnlineText(strings.Join(nonEmptyStrings(
		title,
		extractMetaDescription(body),
		extractAssetOnlinePageText(body),
	), " "))
	if len([]rune(signals)) > 5000 {
		signals = string([]rune(signals)[:5000])
	}
	return classifyManualAssetSupportURL(parsed, signals)
}

type assetVisualReferencePageInput struct {
	Provider string
	URL      string
}

func assetVisualReferencePageInputs(asset *core.Record) []assetVisualReferencePageInput {
	result := make([]assetVisualReferencePageInput, 0, 6)
	seen := map[string]bool{}
	for _, input := range []assetVisualReferencePageInput{
		{Provider: "support_url", URL: recordMetadataString(asset, "support_url")},
		{Provider: "product_url", URL: recordMetadataString(asset, "product_url")},
		{Provider: "official_url", URL: recordMetadataString(asset, "official_url")},
	} {
		if related, ok := assetVisualRelatedProductPageInput(input); ok {
			result = appendAssetVisualReferencePageInput(result, seen, related.Provider, related.URL)
		}
		result = appendAssetVisualReferencePageInput(result, seen, input.Provider, input.URL)
	}
	return result
}

func appendAssetVisualReferencePageInput(result []assetVisualReferencePageInput, seen map[string]bool, provider string, rawURL string) []assetVisualReferencePageInput {
	provider = strings.TrimSpace(provider)
	rawURL = strings.TrimSpace(rawURL)
	if provider == "" || rawURL == "" {
		return result
	}
	key := strings.ToLower(rawURL)
	if seen[key] {
		return result
	}
	seen[key] = true
	return append(result, assetVisualReferencePageInput{Provider: provider, URL: rawURL})
}

type assetVisualHTMLImageCandidate struct {
	URL     string
	Context string
	Width   int
	Height  int
}

func (h *Hub) collectAssetVisualBundleImageSources(asset *core.Record, pageURL *url.URL, body string, provider string, result []map[string]any, seen map[string]bool, limit int) []map[string]any {
	for _, scriptURL := range extractAssetVisualProductScriptURLs(pageURL, body) {
		if len(result) >= limit {
			break
		}
		scriptBody, err := h.fetchAssetOnlineURL(scriptURL, 1024*1024)
		if err != nil {
			continue
		}
		for _, imageURL := range extractAssetVisualProductBundleImageURLs(scriptBody) {
			result = appendAssetVisualReferenceSource(asset, result, seen, map[string]any{
				"title":      "官方产品资源",
				"url":        scriptURL,
				"image_url":  imageURL,
				"type":       "official_product_bundle_image",
				"provider":   provider,
				"color":      inferAssetVisualSourceColor(asset, "", imageURL),
				"confidence": 94,
			})
			if len(result) >= limit {
				break
			}
		}
	}
	return result
}

func assetVisualRelatedProductPageInput(page assetVisualReferencePageInput) (assetVisualReferencePageInput, bool) {
	parsed, err := url.Parse(strings.TrimSpace(page.URL))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return assetVisualReferencePageInput{}, false
	}
	path := strings.TrimRight(parsed.Path, "/")
	if !strings.HasSuffix(path, "/specs") {
		return assetVisualReferencePageInput{}, false
	}
	parsed.Path = strings.TrimSuffix(path, "/specs")
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return assetVisualReferencePageInput{Provider: page.Provider, URL: parsed.String()}, true
}

func extractAssetVisualProductScriptURLs(base *url.URL, body string) []string {
	pattern := regexp.MustCompile(`(?is)<script[^>]+src=["']([^"']+\.js)["'][^>]*>`)
	matches := pattern.FindAllStringSubmatch(body, -1)
	result := make([]string, 0, len(matches))
	for _, match := range matches {
		if len(match) < 2 {
			continue
		}
		scriptURL := absolutizeAssetOnlineURL(base, match[1])
		lower := strings.ToLower(scriptURL)
		if strings.Contains(lower, "/product/") && isSameAssetVisualHost(base, scriptURL) {
			result = append(result, scriptURL)
		}
	}
	return dedupeStrings(result)
}

func isSameAssetVisualHost(base *url.URL, rawURL string) bool {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || parsed.Host == "" {
		return false
	}
	if strings.EqualFold(parsed.Host, base.Host) {
		return true
	}
	baseHost := strings.ToLower(base.Host)
	scriptHost := strings.ToLower(parsed.Host)
	if strings.Contains(baseHost, "mi.com") {
		return strings.Contains(scriptHost, "mi-img.com") || strings.Contains(scriptHost, "mifile.cn")
	}
	return false
}

func extractAssetVisualProductBundleImageURLs(scriptBody string) []string {
	baseSites := regexp.MustCompile(`productFileSite:"([^"]+)"`).FindAllStringSubmatch(scriptBody, -1)
	dirs := regexp.MustCompile(`imgPath:""\.concat\([^,]+,\s*"([^"]+)"\)`).FindAllStringSubmatch(scriptBody, -1)
	files := regexp.MustCompile(`imgPath\+"([^"]+\.(?:png|jpg|jpeg|webp|avif))"`).FindAllStringSubmatch(scriptBody, -1)
	result := make([]string, 0, len(files))
	for _, baseMatch := range baseSites {
		if len(baseMatch) < 2 {
			continue
		}
		baseSite := strings.TrimRight(strings.TrimSpace(baseMatch[1]), "/")
		if baseSite == "" || strings.Contains(baseSite, "pre") {
			continue
		}
		for _, dirMatch := range dirs {
			if len(dirMatch) < 2 {
				continue
			}
			dir := strings.Trim(strings.TrimSpace(dirMatch[1]), "/")
			if dir == "" {
				continue
			}
			for _, fileMatch := range files {
				if len(fileMatch) < 2 {
					continue
				}
				fileName := strings.TrimSpace(fileMatch[1])
				if !isLikelyAssetProductBundleImageName(fileName) {
					continue
				}
				result = append(result, baseSite+"/"+dir+"/"+fileName)
			}
		}
	}
	return dedupeStrings(result)
}

func isLikelyAssetProductBundleImageName(fileName string) bool {
	lower := strings.ToLower(strings.TrimSpace(fileName))
	if lower == "" {
		return false
	}
	rejected := []string{
		"logo",
		"screen",
		"cpu",
		"chip",
		"soc",
		"battery",
		"charge",
		"camera",
		"speaker",
		"audio",
		"nfc",
		"wifi",
		"antenna",
		"icon",
		"add",
		"banner",
		"banner-title",
		"hero",
		"kv",
		"marketing",
		"poster",
		"promo",
		"sample",
		"spec-color",
		"color-spec",
		"colour-spec",
		"color-overview",
		"colors-overview",
		"colour-overview",
		"overview-color",
		"overview-colors",
		"sw1-",
		"sw3-",
	}
	for _, marker := range rejected {
		if strings.Contains(lower, marker) {
			return false
		}
	}
	preferred := []string{"sw2-", "product", "phone", "appearance", "front", "back", "side", "gallery", "main"}
	for _, marker := range preferred {
		if strings.Contains(lower, marker) {
			return true
		}
	}
	return false
}

func extractAssetVisualHTMLImageCandidates(base *url.URL, body string) []assetVisualHTMLImageCandidate {
	root, err := nethtml.Parse(strings.NewReader(body))
	result := make([]assetVisualHTMLImageCandidate, 0, 8)
	if err == nil {
		var walk func(*nethtml.Node)
		walk = func(node *nethtml.Node) {
			if node.Type == nethtml.ElementNode && (strings.EqualFold(node.Data, "img") || strings.EqualFold(node.Data, "source")) {
				attrs := assetVisualHTMLNodeAttrs(node)
				rawCandidates := nonEmptyStrings(attrs["data-src"], attrs["src"], attrs["srcset"])
				context := strings.Join(nonEmptyStrings(
					attrs["alt"],
					attrs["title"],
					attrs["aria-label"],
					assetVisualNearbyNodeText(node),
				), " ")
				width, _ := strconv.Atoi(strings.TrimSpace(attrs["width"]))
				height, _ := strconv.Atoi(strings.TrimSpace(attrs["height"]))
				for _, raw := range rawCandidates {
					for _, candidate := range splitAssetImageCandidates(raw) {
						absolute := absolutizeAssetOnlineURL(base, candidate)
						if isLikelyImageURL(absolute) {
							result = append(result, assetVisualHTMLImageCandidate{
								URL:     absolute,
								Context: context,
								Width:   width,
								Height:  height,
							})
						}
					}
				}
			}
			for child := node.FirstChild; child != nil; child = child.NextSibling {
				walk(child)
			}
		}
		walk(root)
	}
	result = append(result, extractAssetVisualEmbeddedImageCandidates(base, body)...)
	return result
}

func assetVisualHTMLNodeAttrs(node *nethtml.Node) map[string]string {
	attrs := make(map[string]string, len(node.Attr))
	for _, attr := range node.Attr {
		key := strings.ToLower(strings.TrimSpace(attr.Key))
		if key == "" {
			continue
		}
		attrs[key] = html.UnescapeString(strings.TrimSpace(attr.Val))
	}
	return attrs
}

func assetVisualNearbyNodeText(node *nethtml.Node) string {
	if node == nil || node.Parent == nil {
		return ""
	}
	parts := make([]string, 0, 4)
	for sibling := node.Parent.FirstChild; sibling != nil; sibling = sibling.NextSibling {
		if sibling == node {
			continue
		}
		if text := assetVisualNodeText(sibling, 240); text != "" {
			parts = append(parts, text)
		}
	}
	return cleanOnlineText(strings.Join(parts, " "))
}

func assetVisualNodeText(node *nethtml.Node, maxRunes int) string {
	if node == nil || maxRunes <= 0 {
		return ""
	}
	var builder strings.Builder
	var walk func(*nethtml.Node)
	walk = func(current *nethtml.Node) {
		if current == nil || len([]rune(builder.String())) >= maxRunes {
			return
		}
		if current.Type == nethtml.ElementNode {
			name := strings.ToLower(current.Data)
			if name == "script" || name == "style" || name == "noscript" {
				return
			}
		}
		if current.Type == nethtml.TextNode {
			builder.WriteString(" ")
			builder.WriteString(current.Data)
		}
		for child := current.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(node)
	text := cleanOnlineText(builder.String())
	runes := []rune(text)
	if len(runes) > maxRunes {
		return string(runes[:maxRunes])
	}
	return text
}

func extractAssetVisualEmbeddedImageCandidates(base *url.URL, body string) []assetVisualHTMLImageCandidate {
	scriptPattern := regexp.MustCompile(`(?is)<script\b[^>]*>(.*?)</script>`)
	scripts := scriptPattern.FindAllStringSubmatch(body, -1)
	pattern := regexp.MustCompile(`(?i)(?:https?:)?//[^"'<>\\\s]+\.(?:png|jpg|jpeg|webp|avif)|/[\w./-]+\.(?:png|jpg|jpeg|webp|avif)`)
	result := make([]assetVisualHTMLImageCandidate, 0)
	seen := map[string]bool{}
	for _, script := range scripts {
		if len(script) < 2 {
			continue
		}
		for _, match := range pattern.FindAllString(script[1], -1) {
			absolute := absolutizeAssetOnlineURL(base, strings.TrimSpace(match))
			if !isLikelyImageURL(absolute) || !isLikelyAssetEmbeddedProductImage(base, absolute) {
				continue
			}
			key := strings.ToLower(absolute)
			if seen[key] {
				continue
			}
			seen[key] = true
			result = append(result, assetVisualHTMLImageCandidate{
				URL:     absolute,
				Context: embeddedAssetVisualImageContext(absolute),
			})
		}
	}
	return result
}

func isLikelyAssetEmbeddedProductImage(base *url.URL, rawURL string) bool {
	lower := strings.ToLower(strings.TrimSpace(rawURL))
	if lower == "" {
		return false
	}
	if strings.Contains(lower, "placeholder") || strings.Contains(lower, "download") || strings.Contains(lower, "logo") || strings.Contains(lower, "icon") {
		return false
	}
	parsed, err := url.Parse(lower)
	if err != nil || parsed.Host == "" {
		return false
	}
	if strings.Contains(strings.ToLower(base.Host), "mi.com") {
		return strings.Contains(parsed.Host, "mi-img.com") ||
			strings.Contains(parsed.Host, "mifile.cn") ||
			strings.Contains(parsed.Host, "fds.api.mi-img.com")
	}
	return strings.EqualFold(parsed.Host, base.Host)
}

func embeddedAssetVisualImageContext(rawURL string) string {
	path := rawURL
	if parsed, err := url.Parse(rawURL); err == nil && parsed.Path != "" {
		path = parsed.Path
	}
	path = strings.ReplaceAll(path, "-", " ")
	path = strings.ReplaceAll(path, "_", " ")
	return path
}

func extractAssetVisualHTMLAttr(tag string, name string) string {
	pattern := regexp.MustCompile(`(?is)\b` + regexp.QuoteMeta(name) + `\s*=\s*["']([^"']+)["']`)
	match := pattern.FindStringSubmatch(tag)
	if len(match) < 2 {
		return ""
	}
	return html.UnescapeString(strings.TrimSpace(match[1]))
}

func extractAssetVisualNearbyText(body string, start int, end int) string {
	left := start - 220
	if left < 0 {
		left = 0
	}
	right := end + 220
	if right > len(body) {
		right = len(body)
	}
	text := body[left:right]
	text = regexp.MustCompile(`(?is)<script\b.*?</script>`).ReplaceAllString(text, " ")
	text = regexp.MustCompile(`(?is)<style\b.*?</style>`).ReplaceAllString(text, " ")
	text = regexp.MustCompile(`(?is)<[^>]+>`).ReplaceAllString(text, " ")
	text = html.UnescapeString(text)
	return cleanOnlineText(text)
}

func assetVisualHTMLCandidateMatchesAsset(asset *core.Record, candidate assetVisualHTMLImageCandidate) bool {
	if assetUsesProviderLogoVisual(asset) {
		return assetVisualHTMLCandidateMatchesProvider(asset, candidate)
	}
	if candidate.Width > 0 && candidate.Height > 0 && (candidate.Width < 240 || candidate.Height < 160) {
		return false
	}
	text := normalizeAssetVisualMatchText(candidate.Context)
	if text == "" {
		return candidate.Width == 0 || candidate.Width >= 320 || candidate.Height >= 320
	}
	for _, rejected := range []string{"appdownload", "下载app", "购物车", "全部商品分类", "查看全部", "小米路由器"} {
		if strings.Contains(strings.ToLower(candidate.Context), strings.ToLower(rejected)) {
			return false
		}
	}
	terms := assetVisualMatchTerms(asset)
	for _, term := range terms {
		if term != "" && strings.Contains(text, term) {
			return true
		}
	}
	if strings.Contains(text, "xiaomi") || strings.Contains(text, "redmi") || strings.Contains(text, "小米") || strings.Contains(text, "红米") {
		return false
	}
	return candidate.Width == 0 || candidate.Width >= 480 || candidate.Height >= 360
}

func assetVisualHTMLCandidateMatchesProvider(asset *core.Record, candidate assetVisualHTMLImageCandidate) bool {
	if candidate.Width > 0 && candidate.Height > 0 && (candidate.Width < 24 || candidate.Height < 24) {
		return false
	}
	context := normalizeAssetVisualMatchText(strings.Join(nonEmptyStrings(candidate.Context, candidate.URL), " "))
	terms := assetVisualServiceMatchTerms(asset)
	if len(terms) == 0 {
		return strings.Contains(context, "logo") || strings.Contains(context, "brand") || strings.Contains(context, "标识")
	}
	for _, term := range terms {
		if strings.Contains(context, term) {
			return true
		}
	}
	return false
}

func assetVisualMatchTerms(asset *core.Record) []string {
	values := nonEmptyStrings(
		asset.GetString("name"),
		asset.GetString("model"),
		recordMetadataString(asset, "internal_model"),
	)
	result := make([]string, 0, len(values)*2)
	for _, value := range values {
		normalized := normalizeAssetVisualMatchText(value)
		if len(normalized) >= 4 {
			result = append(result, normalized)
		}
		noSpaces := strings.ReplaceAll(strings.ToLower(strings.TrimSpace(value)), " ", "")
		if len(noSpaces) >= 4 {
			result = append(result, normalizeAssetVisualMatchText(noSpaces))
		}
	}
	return dedupeStrings(result)
}

func assetVisualServiceMatchTerms(asset *core.Record) []string {
	values := nonEmptyStrings(asset.GetString("vendor"), asset.GetString("name"), asset.GetString("model"))
	result := make([]string, 0, len(values))
	for _, value := range values {
		term := normalizeAssetVisualMatchText(value)
		if len([]rune(term)) >= 2 {
			result = append(result, term)
		}
	}
	return dedupeStrings(result)
}

func normalizeAssetVisualMatchText(value string) string {
	value = strings.ToLower(html.UnescapeString(strings.TrimSpace(value)))
	replacer := strings.NewReplacer(" ", "", "-", "", "_", "", "/", "", "\\", "", "　", "", "(", "", ")", "", "（", "", "）", "")
	return replacer.Replace(value)
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

func assetRequiresOfficialColorSelection(asset *core.Record) bool {
	switch strings.TrimSpace(asset.GetString("type")) {
	case "phone", "tablet", "wearable", "handheld", "ebook", "game_console", "tv", "speaker":
		return true
	default:
		return false
	}
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

func assetColorInOptions(color string, options []string) bool {
	target := normalizeAssetVisualMatchText(color)
	if target == "" {
		return false
	}
	for _, option := range options {
		if normalizeAssetVisualMatchText(option) == target {
			return true
		}
	}
	return false
}

func assetVisualReferenceImageURL(source map[string]any) string {
	return firstNonEmpty(stringFromAny(source["image_url"]), stringFromAny(source["url"]))
}

func assetVisualModelReferenceURLs(sources []map[string]any) []string {
	candidates := make([]map[string]any, 0, len(sources))
	for _, source := range sources {
		imageURL := assetVisualReferenceImageURL(source)
		if imageURL == "" || assetVisualReferenceLooksLikeNonDeviceImage(source) {
			continue
		}
		candidates = append(candidates, map[string]any{
			"url":          imageURL,
			"source_title": source["title"],
			"image_url":    imageURL,
			"type":         source["type"],
			"provider":     source["provider"],
			"visual_score": scoreAssetVisualDisplayCandidate(source),
		})
	}
	if len(candidates) == 0 {
		return nil
	}
	sort.SliceStable(candidates, func(i, j int) bool {
		return intFromAny(candidates[i]["visual_score"]) > intFromAny(candidates[j]["visual_score"])
	})
	urls := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		urls = append(urls, stringFromAny(candidate["url"]))
	}
	return dedupeStrings(urls)
}

func assetVisualReferenceLooksLikeNonDeviceImage(source map[string]any) bool {
	text := strings.ToLower(strings.Join(nonEmptyStrings(
		stringFromAny(source["image_url"]),
		stringFromAny(source["url"]),
		stringFromAny(source["title"]),
		stringFromAny(source["type"]),
	), " "))
	for _, marker := range []string{"spec-color", "color-spec", "colour-spec"} {
		if strings.Contains(text, marker) {
			return true
		}
	}
	for _, marker := range []string{
		"watermark",
		"watermarked",
		"带水印",
		"banner",
		"hero",
		"/kv",
		"-kv",
		"_kv",
		"marketing",
		"poster",
		"promo",
		"sample",
		"样张",
		"color-overview",
		"colors-overview",
		"colour-overview",
		"overview-color",
		"overview-colors",
	} {
		if strings.Contains(text, marker) {
			return true
		}
	}
	return false
}

func (h *Hub) buildCollectedAssetVisualFrames(asset *core.Record, references []map[string]any, limit int, color string) []map[string]any {
	if limit <= 0 {
		limit = defaultAssetVisualCandidateCount
	}
	if limit > defaultAssetVisualCandidateCount {
		limit = defaultAssetVisualCandidateCount
	}
	candidates := make([]map[string]any, 0, limit)
	referenceURLs := assetVisualModelReferenceURLs(references)
	preferredURLs := h.preferredAssetVisualReferenceURLs(referenceURLs, color)
	if len(referenceURLs) > 0 && strings.TrimSpace(color) != "" && len(preferredURLs) == 0 {
		return nil
	}
	preferredURLSet := map[string]bool{}
	for _, rawURL := range preferredURLs {
		preferredURLSet[strings.ToLower(strings.TrimSpace(rawURL))] = true
	}
	for _, source := range references {
		imageURL, _ := source["image_url"].(string)
		if imageURL == "" {
			imageURL, _ = source["url"].(string)
		}
		if !assetVisualReferenceSourceAccepted(asset, source) {
			continue
		}
		title, _ := source["title"].(string)
		sourceURL, _ := source["url"].(string)
		candidates = append(candidates, map[string]any{
			"url":              imageURL,
			"source_title":     title,
			"source_url":       sourceURL,
			"source_image_url": imageURL,
			"color":            firstNonEmpty(stringFromAny(source["color"]), inferAssetVisualSourceColor(asset, color, strings.Join(nonEmptyStrings(title, sourceURL, imageURL), " "))),
			"presentation":     assetVisualPresentation(asset),
			"theme_score":      scoreAssetVisualNightCandidate(source),
			"visual_score":     scoreAssetVisualDisplayCandidate(source),
		})
	}
	if len(preferredURLSet) > 0 {
		filtered := make([]map[string]any, 0, len(candidates))
		for _, rawURL := range preferredURLs {
			key := strings.ToLower(strings.TrimSpace(rawURL))
			for _, candidate := range candidates {
				if strings.ToLower(strings.TrimSpace(stringFromAny(candidate["url"]))) == key {
					filtered = append(filtered, candidate)
					break
				}
			}
		}
		if len(filtered) > 0 {
			candidates = filtered
		}
	}
	if len(candidates) == 0 {
		return nil
	}
	frameLimit := limit
	if assetUsesProviderLogoVisual(asset) {
		// 服务商 Logo 只保存一张，但先保留多个可归档来源逐一尝试，避免模型猜错单个图片 URL 时直接失败。
		frameLimit = len(candidates)
	} else if frameLimit > len(candidates) {
		frameLimit = len(candidates)
	}
	frames := make([]map[string]any, 0, frameLimit)
	orderedCandidates := orderAssetVisualThemeCandidates(candidates, frameLimit)
	for index := 0; index < frameLimit; index++ {
		source := orderedCandidates[index%len(orderedCandidates)]
		frames = append(frames, map[string]any{
			"index":            index,
			"view":             "candidate",
			"theme":            "candidate",
			"presentation":     stringFromAny(source["presentation"]),
			"label":            fmt.Sprintf("候选 %d", index+1),
			"color":            stringFromAny(source["color"]),
			"url":              source["url"],
			"source_title":     source["source_title"],
			"source_url":       source["source_url"],
			"source_image_url": source["source_image_url"],
		})
	}
	return frames
}

type normalizedAssetVisualImage struct {
	Bytes       []byte
	ContentType string
	Extension   string
	Width       int
	Height      int
	Trimmed     bool
}

func (h *Hub) archiveCollectedAssetVisualFrames(asset *core.Record, references []map[string]any, limit int, color string, config assetVisualAIConfig) ([]map[string]any, []*filesystem.File, map[string]any) {
	candidates := h.buildCollectedAssetVisualFrames(asset, references, limit, color)
	frames := make([]map[string]any, 0, len(candidates))
	files := make([]*filesystem.File, 0, len(candidates))
	verificationInputs := make([]assetVisualVerificationInput, 0, len(candidates))
	skipped := make([]map[string]string, 0)
	for _, candidate := range candidates {
		if len(frames) >= limit {
			break
		}
		sourceImageURL := stringFromAny(candidate["source_image_url"])
		body, err := h.fetchAssetVisualImage(sourceImageURL, assetVisualMaxDownloadBytes)
		if err != nil {
			skipped = append(skipped, map[string]string{"source_image_url": sourceImageURL, "reason": "download_failed"})
			continue
		}
		var processed normalizedAssetVisualImage
		if assetUsesProviderLogoVisual(asset) {
			processed, err = normalizeAssetServiceLogoImage(body, sourceImageURL)
		} else {
			processed, err = normalizeAssetVisualImage(body, sourceImageURL)
		}
		if err != nil {
			skipped = append(skipped, map[string]string{"source_image_url": sourceImageURL, "reason": "image_processing_failed"})
			continue
		}
		file, err := filesystem.NewFileFromBytes(processed.Bytes, fmt.Sprintf("asset-visual-%02d.%s", len(frames)+1, processed.Extension))
		if err != nil {
			skipped = append(skipped, map[string]string{"source_image_url": sourceImageURL, "reason": "file_archive_failed"})
			continue
		}
		frame := cloneStringAnyMap(candidate)
		frame["processing"] = map[string]any{
			"stored_locally": true,
			"trimmed":        processed.Trimmed,
			"format":         processed.Extension,
			"width":          processed.Width,
			"height":         processed.Height,
		}
		frames = append(frames, frame)
		files = append(files, file)
		if dataURI, err := assetVisualVerificationDataURI(processed); err == nil {
			verificationInputs = append(verificationInputs, assetVisualVerificationInput{Index: len(frames) - 1, DataURI: dataURI})
		}
	}
	verificationSummary := map[string]any{"status": "official_rules_only"}
	if config.Ready() && len(verificationInputs) > 0 {
		verdicts, summary := h.verifyArchivedAssetVisualCandidates(asset, color, config, verificationInputs)
		verificationSummary = summary
		if len(verdicts) > 0 {
			acceptedFrames := make([]map[string]any, 0, len(frames))
			acceptedFiles := make([]*filesystem.File, 0, len(files))
			for index, frame := range frames {
				verdict, found := verdicts[index]
				if !found || !verdict.Accepted || verdict.Confidence < 85 {
					skipped = append(skipped, map[string]string{"source_image_url": stringFromAny(frame["source_image_url"]), "reason": "ai_accuracy_rejected"})
					continue
				}
				if verdict.Color != "" {
					frame["color"] = verdict.Color
				}
				frame["verification"] = map[string]any{"accepted": true, "confidence": verdict.Confidence, "reason": verdict.Reason, "color": verdict.Color}
				acceptedFrames = append(acceptedFrames, frame)
				acceptedFiles = append(acceptedFiles, files[index])
			}
			frames = acceptedFrames
			files = acceptedFiles
		}
	}
	for index := range frames {
		frames[index]["index"] = index
		frames[index]["label"] = fmt.Sprintf("候选 %d", index+1)
	}
	return frames, files, map[string]any{
		"stored_locally": len(files),
		"skipped":        skipped,
		"verification":   verificationSummary,
	}
}

type assetVisualVerificationInput struct {
	Index   int
	DataURI string
}

type assetVisualVerificationResult struct {
	Accepted   bool
	Confidence int
	Reason     string
	Color      string
}

func assetVisualVerificationDataURI(processed normalizedAssetVisualImage) (string, error) {
	decoded, _, err := image.Decode(bytes.NewReader(processed.Bytes))
	if err != nil {
		return "", err
	}
	thumbnail := imaging.Fit(decoded, 512, 512, imaging.Lanczos)
	var output bytes.Buffer
	if err := jpeg.Encode(&output, thumbnail, &jpeg.Options{Quality: 82}); err != nil {
		return "", err
	}
	return "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(output.Bytes()), nil
}

func buildAssetVisualVerificationPayload(asset *core.Record, color string, inputs []assetVisualVerificationInput, model string) (map[string]any, error) {
	if len(inputs) == 0 {
		return nil, errors.New("no visual verification inputs")
	}
	content := make([]any, 0, len(inputs)+1)
	content = append(content, map[string]any{
		"type": "text",
		"text": mustJSON(map[string]any{
			"task": "只判断已归档的官方候选图片是否准确匹配当前资产，不搜索、不生成、不返回 URL。",
			"asset": map[string]any{
				"name":           asset.GetString("name"),
				"type":           asset.GetString("type"),
				"vendor":         asset.GetString("vendor"),
				"model":          asset.GetString("model"),
				"internal_model": recordMetadataString(asset, "internal_model"),
				"selected_color": color,
			},
			"rules":  []string{"拒绝错误型号、不同变体、带水印、横幅、海报、色卡、Logo（实体设备）和非设备主体图", "只接受完整、清晰、与型号和颜色一致的设备图或服务商官方 Logo"},
			"output": `{"candidates":[{"index":0,"accepted":true,"confidence":0,"reason":"","color":""}]}`,
		}),
	})
	for _, input := range inputs {
		content = append(content, map[string]any{
			"type":      "image_url",
			"image_url": map[string]any{"url": input.DataURI, "detail": "low"},
		})
	}
	return map[string]any{
		"model":       model,
		"temperature": 0,
		"messages": []map[string]any{
			{"role": "system", "content": "你是资产图片准确性审核器。只能返回 JSON，不得查找、生成或猜测图片 URL。"},
			{"role": "user", "content": content},
		},
		"response_format": map[string]string{"type": "json_object"},
	}, nil
}

func (h *Hub) verifyArchivedAssetVisualCandidates(asset *core.Record, color string, config assetVisualAIConfig, inputs []assetVisualVerificationInput) (map[int]assetVisualVerificationResult, map[string]any) {
	allVerdicts := map[int]assetVisualVerificationResult{}
	attempts := 0
	for _, batch := range splitAssetVisualVerificationInputs(inputs) {
		payload, err := buildAssetVisualVerificationPayload(asset, color, batch, config.Model)
		if err != nil {
			return allVerdicts, map[string]any{"status": "request_build_failed", "attempts": attempts}
		}
		body, err := json.Marshal(payload)
		if err != nil {
			return allVerdicts, map[string]any{"status": "request_encode_failed", "attempts": attempts}
		}
		rawBody, batchAttempts, message := callAssetOnlineAIModel(assetOnlineAIConfig{Enabled: config.Enabled, Provider: config.Provider, Endpoint: config.Endpoint, APIKey: config.APIKey, Model: config.Model}, body)
		attempts += batchAttempts
		if message != "" {
			return allVerdicts, map[string]any{"status": "unavailable", "attempts": attempts, "error": truncateAssetVisualVerificationError(message)}
		}
		verdicts := parseAssetVisualVerificationResults(extractAssetOnlineAIContent(rawBody))
		if len(verdicts) == 0 {
			return allVerdicts, map[string]any{"status": "invalid_response", "attempts": attempts}
		}
		for index, verdict := range verdicts {
			allVerdicts[index] = verdict
		}
	}
	return allVerdicts, map[string]any{"status": "verified", "attempts": attempts, "accepted": countAcceptedAssetVisualVerificationResults(allVerdicts), "batches": len(splitAssetVisualVerificationInputs(inputs))}
}

func splitAssetVisualVerificationInputs(inputs []assetVisualVerificationInput) [][]assetVisualVerificationInput {
	if len(inputs) == 0 {
		return nil
	}
	result := make([][]assetVisualVerificationInput, 0, (len(inputs)+assetVisualVerificationBatchSize-1)/assetVisualVerificationBatchSize)
	for start := 0; start < len(inputs); start += assetVisualVerificationBatchSize {
		end := start + assetVisualVerificationBatchSize
		if end > len(inputs) {
			end = len(inputs)
		}
		result = append(result, inputs[start:end])
	}
	return result
}

func truncateAssetVisualVerificationError(message string) string {
	message = cleanOnlineText(message)
	if len([]rune(message)) <= 240 {
		return message
	}
	return string([]rune(message)[:240]) + "..."
}

func parseAssetVisualVerificationResults(content string) map[int]assetVisualVerificationResult {
	content = strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(strings.TrimPrefix(content, "```json"), "```"), "```"))
	var parsed struct {
		Candidates []struct {
			Index      int    `json:"index"`
			Accepted   bool   `json:"accepted"`
			Confidence int    `json:"confidence"`
			Reason     string `json:"reason"`
			Color      string `json:"color"`
		} `json:"candidates"`
	}
	if err := json.Unmarshal([]byte(content), &parsed); err != nil {
		return nil
	}
	result := make(map[int]assetVisualVerificationResult, len(parsed.Candidates))
	for _, candidate := range parsed.Candidates {
		if candidate.Index < 0 || candidate.Confidence < 0 || candidate.Confidence > 100 {
			continue
		}
		result[candidate.Index] = assetVisualVerificationResult{Accepted: candidate.Accepted, Confidence: candidate.Confidence, Reason: cleanOnlineText(candidate.Reason), Color: cleanOnlineText(candidate.Color)}
	}
	return result
}

func countAcceptedAssetVisualVerificationResults(results map[int]assetVisualVerificationResult) int {
	count := 0
	for _, result := range results {
		if result.Accepted && result.Confidence >= 85 {
			count++
		}
	}
	return count
}

func (h *Hub) fetchAssetVisualImage(rawURL string, maxBytes int64) ([]byte, error) {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return nil, errors.New("invalid image URL")
	}
	req, err := http.NewRequest(http.MethodGet, parsed.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8")
	req.Header.Set("User-Agent", "PulseAssetVisual/1.0")
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return nil, http.ErrNotSupported
	}
	if maxBytes > 0 && resp.ContentLength > maxBytes {
		return nil, errAssetOnlineResponseTooLarge
	}
	if contentType := strings.TrimSpace(resp.Header.Get("Content-Type")); contentType != "" {
		mediaType, _, parseErr := mime.ParseMediaType(contentType)
		if parseErr == nil && !strings.HasPrefix(strings.ToLower(mediaType), "image/") {
			return nil, errors.New("unsupported image content type")
		}
	}
	reader := io.Reader(resp.Body)
	if maxBytes > 0 {
		reader = io.LimitReader(resp.Body, maxBytes+1)
	}
	body, err := io.ReadAll(reader)
	if err != nil {
		return nil, err
	}
	if len(body) == 0 || (maxBytes > 0 && int64(len(body)) > maxBytes) {
		return nil, errAssetOnlineResponseTooLarge
	}
	return body, nil
}

func normalizeAssetVisualImage(source []byte, sourceName string) (normalizedAssetVisualImage, error) {
	return normalizeAssetVisualImageWithMinimumDimension(source, sourceName, 24, false)
}

func normalizeAssetServiceLogoImage(source []byte, sourceName string) (normalizedAssetVisualImage, error) {
	return normalizeAssetVisualImageWithMinimumDimension(source, sourceName, assetVisualMinLogoDimension, true)
}

func normalizeAssetVisualImageWithMinimumDimension(source []byte, sourceName string, minimumDimension int, expandSmallSquare bool) (normalizedAssetVisualImage, error) {
	_ = sourceName
	decoded, _, err := image.Decode(bytes.NewReader(source))
	if err != nil {
		return normalizedAssetVisualImage{}, err
	}
	if decoded.Bounds().Dx() < minimumDimension || decoded.Bounds().Dy() < minimumDimension {
		return normalizedAssetVisualImage{}, errors.New("image is too small")
	}
	trimmedImage, trimmed := trimUniformAssetVisualPadding(decoded)
	resized := imaging.Fit(trimmedImage, assetVisualMaxDimension, assetVisualMaxDimension, imaging.Lanczos)
	if expandSmallSquare && resized.Bounds().Dx() < assetVisualMinLogoCanvas && resized.Bounds().Dy() < assetVisualMinLogoCanvas {
		resized = imaging.Resize(resized, assetVisualMinLogoCanvas, assetVisualMinLogoCanvas, imaging.NearestNeighbor)
	}
	result := normalizedAssetVisualImage{
		Width:   resized.Bounds().Dx(),
		Height:  resized.Bounds().Dy(),
		Trimmed: trimmed,
	}
	var output bytes.Buffer
	if assetVisualImageHasTransparency(resized) {
		result.ContentType = "image/png"
		result.Extension = "png"
		err = png.Encode(&output, resized)
	} else {
		result.ContentType = "image/jpeg"
		result.Extension = "jpg"
		err = jpeg.Encode(&output, resized, &jpeg.Options{Quality: 88})
	}
	if err != nil {
		return normalizedAssetVisualImage{}, err
	}
	result.Bytes = output.Bytes()
	return result, nil
}

func trimUniformAssetVisualPadding(source image.Image) (image.Image, bool) {
	bounds := source.Bounds()
	background, ok := uniformAssetVisualBorderColor(source, bounds)
	if !ok {
		return source, false
	}
	content := image.Rectangle{Min: image.Point{X: bounds.Max.X, Y: bounds.Max.Y}, Max: bounds.Min}
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			if assetVisualPixelDiffersFromBackground(source.At(x, y), background) {
				if x < content.Min.X {
					content.Min.X = x
				}
				if y < content.Min.Y {
					content.Min.Y = y
				}
				if x+1 > content.Max.X {
					content.Max.X = x + 1
				}
				if y+1 > content.Max.Y {
					content.Max.Y = y + 1
				}
			}
		}
	}
	if content.Empty() || content.Dx()*content.Dy()*8 < bounds.Dx()*bounds.Dy() {
		return source, false
	}
	padding := max(8, max(bounds.Dx(), bounds.Dy())/40)
	content = content.Inset(-padding)
	if content.Min.X < bounds.Min.X {
		content.Min.X = bounds.Min.X
	}
	if content.Min.Y < bounds.Min.Y {
		content.Min.Y = bounds.Min.Y
	}
	if content.Max.X > bounds.Max.X {
		content.Max.X = bounds.Max.X
	}
	if content.Max.Y > bounds.Max.Y {
		content.Max.Y = bounds.Max.Y
	}
	if content.Dx()*100 >= bounds.Dx()*96 && content.Dy()*100 >= bounds.Dy()*96 {
		return source, false
	}
	return imaging.Crop(source, content), true
}

func uniformAssetVisualBorderColor(source image.Image, bounds image.Rectangle) (color.NRGBA, bool) {
	points := []image.Point{
		{X: bounds.Min.X, Y: bounds.Min.Y},
		{X: bounds.Max.X - 1, Y: bounds.Min.Y},
		{X: bounds.Min.X, Y: bounds.Max.Y - 1},
		{X: bounds.Max.X - 1, Y: bounds.Max.Y - 1},
	}
	var totalR, totalG, totalB, totalA uint32
	colors := make([]color.NRGBA, 0, len(points))
	for _, point := range points {
		r, g, b, a := source.At(point.X, point.Y).RGBA()
		pixel := color.NRGBA{R: uint8(r >> 8), G: uint8(g >> 8), B: uint8(b >> 8), A: uint8(a >> 8)}
		colors = append(colors, pixel)
		totalR += uint32(pixel.R)
		totalG += uint32(pixel.G)
		totalB += uint32(pixel.B)
		totalA += uint32(pixel.A)
	}
	background := color.NRGBA{
		R: uint8(totalR / uint32(len(colors))),
		G: uint8(totalG / uint32(len(colors))),
		B: uint8(totalB / uint32(len(colors))),
		A: uint8(totalA / uint32(len(colors))),
	}
	if !(background.A < 16 || (background.R > 245 && background.G > 245 && background.B > 245) || (background.R < 12 && background.G < 12 && background.B < 12)) {
		return color.NRGBA{}, false
	}
	for _, pixel := range colors {
		if assetVisualColorDistance(pixel, background) > 14 {
			return color.NRGBA{}, false
		}
	}
	return background, true
}

func assetVisualPixelDiffersFromBackground(value color.Color, background color.NRGBA) bool {
	r, g, b, a := value.RGBA()
	pixel := color.NRGBA{R: uint8(r >> 8), G: uint8(g >> 8), B: uint8(b >> 8), A: uint8(a >> 8)}
	return assetVisualColorDistance(pixel, background) > 26
}

func assetVisualColorDistance(left color.NRGBA, right color.NRGBA) int {
	return assetVisualAbs(int(left.R)-int(right.R)) + assetVisualAbs(int(left.G)-int(right.G)) + assetVisualAbs(int(left.B)-int(right.B)) + assetVisualAbs(int(left.A)-int(right.A))
}

func assetVisualAbs(value int) int {
	if value < 0 {
		return -value
	}
	return value
}

func assetVisualImageHasTransparency(source image.Image) bool {
	bounds := source.Bounds()
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			_, _, _, alpha := source.At(x, y).RGBA()
			if alpha < 0xffff {
				return true
			}
		}
	}
	return false
}

func isSelectableAssetVisualFrame(frame map[string]any) bool {
	if stringFromAny(frame["file"]) != "" {
		return true
	}
	if stringFromAny(frame["presentation"]) == "provider_logo" {
		return isLikelyAssetServiceLogoURL(stringFromAny(frame["url"]))
	}
	return isLikelyAssetVisualImageURL(stringFromAny(frame["url"]))
}

func (h *Hub) preferredAssetVisualReferenceURLs(referenceURLs []string, color string) []string {
	if len(referenceURLs) == 0 || strings.TrimSpace(color) == "" {
		return nil
	}
	return dedupeStrings(referenceURLs)
}

func orderAssetVisualThemeCandidates(candidates []map[string]any, limit int) []map[string]any {
	if len(candidates) <= 1 || limit <= 1 {
		return candidates
	}
	dayIndex := 0
	nightIndex := -1
	bestDayVisualScore := -1 << 30
	bestDayNightScore := int(^uint(0) >> 1)
	bestNightScore := -1
	bestNightVisualScore := -1 << 30
	for index, candidate := range candidates {
		nightScore := intFromAny(candidate["theme_score"])
		visualScore := intFromAny(candidate["visual_score"])
		if visualScore > bestDayVisualScore || (visualScore == bestDayVisualScore && nightScore < bestDayNightScore) {
			dayIndex = index
			bestDayVisualScore = visualScore
			bestDayNightScore = nightScore
		}
		if nightScore > bestNightScore || (nightScore == bestNightScore && visualScore > bestNightVisualScore) {
			nightIndex = index
			bestNightScore = nightScore
			bestNightVisualScore = visualScore
		}
	}
	if bestNightScore <= 0 {
		nightIndex = -1
		bestNightVisualScore = -1 << 30
		for index, candidate := range candidates {
			if index == dayIndex {
				continue
			}
			visualScore := intFromAny(candidate["visual_score"])
			if visualScore > bestNightVisualScore {
				nightIndex = index
				bestNightVisualScore = visualScore
			}
		}
	}
	if nightIndex < 0 {
		nightIndex = dayIndex
	}
	if dayIndex == nightIndex && len(candidates) > 1 {
		if dayIndex == 0 {
			nightIndex = 1
		} else {
			dayIndex = 0
		}
	}
	ordered := make([]map[string]any, 0, len(candidates))
	ordered = append(ordered, candidates[dayIndex])
	if nightIndex != dayIndex {
		ordered = append(ordered, candidates[nightIndex])
	}
	for index, candidate := range candidates {
		if index == dayIndex || index == nightIndex {
			continue
		}
		ordered = append(ordered, candidate)
	}
	return ordered
}

func scoreAssetVisualDisplayCandidate(source map[string]any) int {
	text := strings.ToLower(strings.Join(nonEmptyStrings(
		stringFromAny(source["image_url"]),
		stringFromAny(source["url"]),
		stringFromAny(source["title"]),
		stringFromAny(source["source_title"]),
		stringFromAny(source["type"]),
		stringFromAny(source["provider"]),
	), " "))
	score := 0
	if strings.Contains(text, "official_image") || strings.Contains(text, "asset_master") {
		score += 120
	}
	if strings.Contains(text, "official_product_bundle_image") {
		score += 12
	}
	for _, marker := range []string{"sw2-", "front", "back", "side", "appearance", "gallery", "main", "phone", "product"} {
		if strings.Contains(text, marker) {
			score += 20
		}
	}
	for _, marker := range []string{"spec-color", "color-overview", "colors-overview", "specs", "overview", "参数", "规格"} {
		if strings.Contains(text, marker) {
			score -= 18
		}
	}
	for _, marker := range []string{"logo", "screen", "cpu", "chip", "soc", "battery", "charge", "camera", "sample", "样张", "banner", "hero", "marketing", "poster", "promo"} {
		if strings.Contains(text, marker) {
			score -= 30
		}
	}
	return score
}

func scoreAssetVisualNightCandidate(source map[string]any) int {
	text := strings.ToLower(strings.Join(nonEmptyStrings(
		stringFromAny(source["image_url"]),
		stringFromAny(source["url"]),
		stringFromAny(source["title"]),
		stringFromAny(source["source_title"]),
		stringFromAny(source["type"]),
	), " "))
	score := 0
	for _, marker := range []string{
		"night",
		"dark",
		"black",
		"midnight",
		"obsidian",
		"shadow",
		"graphite",
		"墨",
		"黑",
		"夜",
		"暗",
		"玄",
		"幽芒",
		"墨羽",
	} {
		if strings.Contains(text, marker) {
			score += 10
		}
	}
	for _, marker := range []string{"white", "silver", "snow", "晴雪", "银", "白"} {
		if strings.Contains(text, marker) {
			score -= 6
		}
	}
	return score
}

func stringFromAny(value any) string {
	if text, ok := value.(string); ok {
		return text
	}
	return ""
}

func intFromAny(value any) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	case float32:
		return int(typed)
	default:
		return 0
	}
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
		"watermark",
		"watermarked",
		"带水印",
	}
	for _, marker := range rejected {
		if strings.Contains(lower, marker) {
			return false
		}
	}
	return true
}

func isLikelyAssetServiceLogoURL(rawURL string) bool {
	if !isLikelyImageURL(rawURL) {
		return false
	}
	lower := strings.ToLower(strings.TrimSpace(rawURL))
	for _, marker := range []string{"appdownload", "download.png", "qrcode", "qr-code", "/qr", "wechat", "weixin", "sprite", "avatar", "placeholder", "loading", "blank", "appstore", "googleplay", "playstore", "share", "watermark", "watermarked", "带水印"} {
		if strings.Contains(lower, marker) {
			return false
		}
	}
	return true
}

func assetVisualImageURLAccepted(asset *core.Record, rawURL string) bool {
	if assetUsesProviderLogoVisual(asset) {
		return isLikelyAssetServiceLogoURL(rawURL) || isKnownAssetServiceLogoFallbackURL(rawURL)
	}
	return isLikelyAssetVisualImageURL(rawURL)
}

func isKnownAssetServiceLogoFallbackURL(rawURL string) bool {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || parsed.Scheme != "https" || !assetVisualHostMatches(parsed.Hostname(), "google.com") {
		return false
	}
	return parsed.Path == "/s2/favicons" && parsed.Query().Get("domain") != "" && parsed.Query().Get("sz") != ""
}

func assetVisualReferenceSourceAccepted(asset *core.Record, source map[string]any) bool {
	imageURL := assetVisualReferenceImageURL(source)
	if !assetVisualImageURLAccepted(asset, imageURL) {
		return false
	}
	return !assetVisualReferenceLooksLikeNonDeviceImage(source)
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
