package hub

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

const defaultAssetTurntableFrameCount = 1
const defaultAssetVisualCandidateCount = 15
const defaultAssetServiceLogoCandidateCount = 4
const defaultAssetVisualMaxImages = 15
const assetVisualRunningTaskStaleAfter = 15 * time.Minute

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
	frameCount := assetVisualCandidateFrameCount(asset)
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
	references = h.collectAssetImageSearchFallbackSources(asset, color, references, assetVisualReferenceLimit(asset, config.MaxImages))

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

type assetVisualCrop struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

type updateAssetVisualCropRequest struct {
	Crop *assetVisualCrop `json:"crop"`
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

func (h *Hub) updateAssetVisualCrop(e *core.RequestEvent) error {
	assetID := strings.TrimSpace(e.Request.PathValue("id"))
	visualID := strings.TrimSpace(e.Request.PathValue("visualId"))
	if assetID == "" || visualID == "" {
		return e.BadRequestError("Missing asset visual crop target.", nil)
	}
	asset, err := h.findUserAssetRecord(assetID, e.Auth.Id)
	if err != nil {
		return e.NotFoundError("Asset not found.", err)
	}
	visual, err := h.FindRecordById("asset_visuals", visualID)
	if err != nil || visual.GetString("user") != e.Auth.Id || visual.GetString("asset") != asset.Id || !visual.GetBool("primary") {
		return e.NotFoundError("Selected asset visual not found.", err)
	}
	var req updateAssetVisualCropRequest
	if err := json.NewDecoder(e.Request.Body).Decode(&req); err != nil {
		return e.BadRequestError("Invalid asset visual crop.", err)
	}
	var frames []map[string]any
	_ = visual.UnmarshalJSONField("frames", &frames)
	if len(frames) != 1 {
		return e.BadRequestError("Selected asset visual must contain one frame.", nil)
	}
	if req.Crop == nil {
		delete(frames[0], "crop")
	} else {
		crop := req.Crop
		if crop.X < 0 || crop.Y < 0 || crop.Width <= 0 || crop.Height <= 0 || crop.X+crop.Width > 1 || crop.Y+crop.Height > 1 {
			return e.BadRequestError("Asset visual crop is outside the image bounds.", nil)
		}
		frames[0]["crop"] = map[string]float64{
			"x": crop.X, "y": crop.Y, "width": crop.Width, "height": crop.Height,
		}
	}
	visual.Set("frames", frames)
	if err := h.Save(visual); err != nil {
		return e.InternalServerError("Failed to update asset visual crop.", err)
	}
	h.createOperationAudit(e, "", "asset_visual_crop", asset.Id, "", "success", "资产主图裁剪已更新")
	return e.JSON(http.StatusOK, map[string]any{"visual": visual, "status": "ready"})
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
		Enabled:  enabled,
		Provider: firstNonEmpty(strings.TrimSpace(os.Getenv("PULSE_ASSET_VISUAL_AI_PROVIDER")), "agnes"),
		Endpoint: normalizeAssetVisualDiscoveryEndpoint(firstNonEmpty(rawEndpoint, "https://apihub.agnes-ai.com/v1/chat/completions")),
		APIKey:   key,
		// 2026-10-09 多服务商架构：默认模型不再硬编码，未显式配置即视为未就绪，由用户按服务商选择
		Model:                 strings.TrimSpace(os.Getenv("PULSE_ASSET_VISUAL_AI_MODEL")),
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
		"phase_label":                    "正在收集图片候选",
		"progress_percent":               10,
		"source_policy":                  assetVisualSourcePolicy(references),
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

func assetVisualSourcePolicy(references []map[string]any) string {
	if countAssetVisualReferencesByProvider(references, "bing_images") > 0 {
		return "official_then_bing_public"
	}
	return "official_only"
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

func normalizeAssetVisualMaxImages(value int) int {
	if value <= 0 {
		return defaultAssetVisualMaxImages
	}
	if value < 2 {
		return 2
	}
	if value > 15 {
		return 15
	}
	return value
}

func assetUsesProviderLogoVisual(asset *core.Record) bool {
	if asset == nil {
		return false
	}
	return assetTypeUsesProviderLogo(asset.GetString("type"))
}

// 2026-10-18 用户拍板：服务类资产没有实体，图墙/配图应搜品牌 Logo 而不是产品图
func assetTypeUsesProviderLogo(assetType string) bool {
	switch strings.TrimSpace(assetType) {
	case "internet", "web_endpoint", "subscription", "domain_name", "cloud_host":
		return true
	default:
		return false
	}
}

func assetVisualReferenceLimit(asset *core.Record, configuredLimit int) int {
	if assetUsesProviderLogoVisual(asset) {
		return defaultAssetServiceLogoCandidateCount
	}
	return normalizeAssetVisualMaxImages(configuredLimit)
}

func assetVisualCandidateFrameCount(asset *core.Record) int {
	if assetUsesProviderLogoVisual(asset) {
		return defaultAssetServiceLogoCandidateCount
	}
	return defaultAssetVisualCandidateCount
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
	return "没有找到可归档的设备图片。请先检查厂商和型号，或维护厂家产品页、支持页或官方图片 URL 后重试。"
}

func assetVisualCollectionNote(asset *core.Record) string {
	if assetUsesProviderLogoVisual(asset) {
		return "优先收集服务商官网 Logo；官网未命中时只保留通过来源和图像质量筛选的公开品牌 Logo，均已归档到本地存储并保留来源用于追溯。"
	}
	return "优先收集厂商官网图片；官网未命中时，只接受必应公开结果中可核验型号的图片。所有候选均已归档到本地存储并保留来源用于追溯。"
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
