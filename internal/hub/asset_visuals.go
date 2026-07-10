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
	_ "image/jpeg"
	_ "image/png"
	"io"
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
	_ "golang.org/x/image/webp"
	nethtml "golang.org/x/net/html"
)

const defaultAssetTurntableFrameCount = 1
const defaultAssetVisualCandidateCount = 10
const defaultAssetVisualMaxImages = 12
const assetVisualImageModelMaxAttempts = 3
const assetVisualImageModelQualityMaxAttempts = 2
const defaultAssetVisualImageModelRequestTimeout = 120 * time.Second
const maxAssetVisualImageModelRequestTimeout = 360 * time.Second
const assetVisualImageModelMaxReferenceInputs = 2
const assetVisualImageModelMaxReferenceCandidates = 8
const assetVisualRunningTaskStaleAfter = 15 * time.Minute
const assetVisualReferenceImageMaxBytes = 2 * 1024 * 1024
const assetVisualReferenceImageFetchMaxBytes = 12 * 1024 * 1024
const assetVisualReferenceImageMaxLongEdge = 1024
const assetVisualGeneratedImageMaxBytes = 4 * 1024 * 1024

type assetTurntableVisualRequest struct {
	Color      string `json:"color"`
	FrameCount int    `json:"frame_count"`
	Async      bool   `json:"async"`
}

type assetVisualAIConfig struct {
	Enabled               bool
	Provider              string
	Endpoint              string
	APIKey                string
	Model                 string
	FrameCount            int
	ModelDiscoveryEnabled bool
	MaxImages             int
	OfficialOnly          bool
}

type assetVisualReferenceSkip struct {
	URL    string
	Reason string
}

type assetVisualImageModelInputResult struct {
	Inputs            []string
	URLs              []string
	InputPayloadBytes []int
	ColorMatchScores  []int
	TotalPayloadBytes int
	Skipped           []assetVisualReferenceSkip
}

type assetVisualImageModelInputCandidate struct {
	DataURI      string
	URL          string
	PayloadBytes int
	ColorScore   int
	Index        int
}

type assetVisualGenerationResult struct {
	Frames                      []map[string]any
	SkippedReferences           []assetVisualReferenceSkip
	ReferenceInputCount         int
	ReferenceInputURLs          []string
	ReferenceInputPayloadBytes  []int
	ReferenceInputColorScores   []int
	ReferenceInputTotalBytes    int
	ImageModelOutputDiagnostics assetVisualImageModelDiagnostics
}

type assetVisualImageModelDiagnostics struct {
	Candidates int
	Selected   int
	Rejections []assetVisualImageModelOutputRejection
}

type assetVisualImageModelOutputRejection struct {
	Source string
	URL    string
	Reason string
}

type assetVisualImageModelCallResult struct {
	URL            string
	RevisedPrompt  string
	Diagnostics    assetVisualImageModelDiagnostics
	ResponseFormat string
}

type assetVisualImageModelOutputProbeCache map[string]assetVisualImageModelOutputMaterializeResult

type assetVisualImageModelOutputMaterializeResult struct {
	URL    string
	Reason string
}

type assetVisualGenerationProgress func(map[string]any)

type assetVisualReferenceInputError struct {
	message string
	skipped []assetVisualReferenceSkip
}

func (err *assetVisualReferenceInputError) Error() string {
	return err.message
}

func (err *assetVisualReferenceInputError) SkipSummaries() []map[string]any {
	return assetVisualReferenceSkipSummaries(err.skipped)
}

func newAssetVisualReferenceInputError(skipped []assetVisualReferenceSkip) *assetVisualReferenceInputError {
	message := "没有可用于图片编辑的可读取参考图。"
	if reason := summarizeAssetVisualReferenceSkipReasons(skipped); reason != "" {
		message = "没有可用于图片编辑的可读取参考图：" + reason
	}
	return &assetVisualReferenceInputError{message: message, skipped: skipped}
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
	config.MaxImages = defaultAssetVisualCandidateCount
	frameCount := defaultAssetVisualCandidateCount
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

	frames := h.buildCollectedAssetVisualFrames(asset, references, frameCount, color)
	if len(frames) == 0 {
		message := "没有找到可追溯设备图片。请先补充厂家支持页、官方图片 URL，或运行资料补全 Agent 后再收集。"
		task.Set("status", "failed")
		task.Set("error", message)
		_ = mergeAssetVisualTaskSummary(task, map[string]any{
			"phase":            "failed",
			"phase_label":      "收集失败",
			"progress_percent": 100,
			"collected_images": 0,
			"reason":           "no_traceable_images",
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

	referenceVisual.Set("status", "ready")
	referenceVisual.Set("frames", frames)
	referenceVisual.Set("frame_count", len(frames))
	referenceVisual.Set("metadata", map[string]any{
		"collection_status": "ready",
		"visual_role":       "candidate_set",
		"candidate_count":   len(frames),
		"note":              "设备图片来自官方 / 可追溯来源，作为用户选择主图的候选集。",
	})
	referenceVisual.Set("primary", false)
	if err := h.Save(referenceVisual); err != nil {
		return e.InternalServerError("Failed to update asset visual.", err)
	}
	if err := h.updateAssetVisualTaskProgress(task, map[string]any{
		"phase":            "references_ready",
		"phase_label":      "已收集设备图",
		"progress_percent": 100,
		"collected_images": len(frames),
		"reference_visual": referenceVisual.Id,
		"generated_images": 0,
		"mode":             "reference_image_collection",
		"selected_color":   color,
		"candidate_count":  len(frames),
	}); err != nil {
		return e.InternalServerError("Failed to update AI task.", err)
	}
	task.Set("status", "ready")
	task.Set("error", "")
	if err := h.Save(task); err != nil {
		return e.InternalServerError("Failed to update AI task.", err)
	}
	h.createOperationAudit(e, "", "asset_visual_collect", asset.Id, "", "success", "资产设备候选图片已收集")
	return e.JSON(http.StatusOK, map[string]any{"task": task, "visual": referenceVisual, "status": "ready", "message": "设备候选图片已收集，请在编辑资产右侧选择主图。"})
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
		return e.BadRequestError("候选图为空，请重新找图。", nil)
	}
	if req.FrameIndex < 0 || req.FrameIndex >= len(frames) {
		return e.BadRequestError("候选图序号无效。", nil)
	}
	selectedFrame := cloneStringAnyMap(frames[req.FrameIndex])
	if !isLikelyAssetVisualImageURL(stringFromAny(selectedFrame["url"])) {
		return e.BadRequestError("候选图不是可用图片。", nil)
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

func (h *Hub) runAssetVisualGenerationInBackground(userID string, assetID string, taskID string, referenceVisualID string, color string, references []map[string]any, prompt string, frames []map[string]any, config assetVisualAIConfig) {
	asset, err := h.findUserAssetRecord(assetID, userID)
	if err != nil {
		h.failAssetVisualTaskByID(taskID, "资产不存在或无权访问。", map[string]any{"reason": "asset_not_found"})
		return
	}
	task, err := h.FindRecordById("ai_tasks", taskID)
	if err != nil || task.GetString("user") != userID {
		return
	}
	referenceVisual, err := h.FindRecordById("asset_visuals", referenceVisualID)
	if err != nil || referenceVisual.GetString("user") != userID {
		h.failAssetVisualTaskByID(taskID, "设备参考图记录不存在或无权访问。", map[string]any{"reason": "reference_visual_not_found"})
		return
	}
	_, status, _, _ := h.finishAssetVisualGeneration(userID, asset, task, referenceVisual, color, references, prompt, frames, config)
	if status == "ready" {
		h.createOperationAuditRecord(userID, "", "asset_visual_generate", asset.Id, "", "success", "资产设备统一全貌图已生成", "")
	}
}

func (h *Hub) finishAssetVisualGeneration(userID string, asset *core.Record, task *core.Record, referenceVisual *core.Record, color string, references []map[string]any, prompt string, frames []map[string]any, config assetVisualAIConfig) (*core.Record, string, string, error) {
	progress := func(update map[string]any) {
		_ = h.updateAssetVisualTaskProgress(task, update)
	}
	generationResult, generationErr := h.generateUnifiedAssetVisualFrames(config, asset, color, references, prompt, progress)
	if generationErr != nil {
		message := generationErr.Error()
		outputSummary := map[string]any{
			"phase":            "failed",
			"phase_label":      "生成失败",
			"progress_percent": 100,
			"collected_images": len(frames),
			"reason":           "image_generation_failed",
		}
		var referenceInputErr *assetVisualReferenceInputError
		if errors.As(generationErr, &referenceInputErr) {
			outputSummary["reason"] = "reference_images_unreadable"
			outputSummary["reference_skip_reasons"] = referenceInputErr.SkipSummaries()
		}
		outputSummary = mergeStringAnyMaps(outputSummary, assetVisualImageModelRequestSummary(config, assetVisualImageModelInputResult{
			Inputs:            make([]string, generationResult.ReferenceInputCount),
			URLs:              generationResult.ReferenceInputURLs,
			InputPayloadBytes: generationResult.ReferenceInputPayloadBytes,
			TotalPayloadBytes: generationResult.ReferenceInputTotalBytes,
			Skipped:           generationResult.SkippedReferences,
		}))
		applyAssetVisualImageModelDiagnosticsToSummary(outputSummary, generationResult.ImageModelOutputDiagnostics)
		if err := mergeAssetVisualTaskSummary(task, outputSummary); err != nil {
			return nil, "failed", message, err
		}
		task.Set("status", "failed")
		task.Set("error", message)
		if err := h.Save(task); err != nil {
			return nil, "failed", message, err
		}
		return nil, "failed", message, nil
	}

	visual, err := h.createGeneratedAssetVisualRecord(userID, asset, task.Id, color, generationResult.Frames, references, prompt)
	if err != nil {
		message := "生成图记录保存失败。"
		if saveErr := h.failAssetVisualTask(task, message, map[string]any{"reason": "generated_visual_save_failed"}); saveErr != nil {
			return nil, "failed", message, saveErr
		}
		return nil, "failed", message, err
	}
	outputSummary := map[string]any{
		"phase":                 "ready",
		"phase_label":           "生成完成",
		"progress_percent":      100,
		"collected_images":      len(frames),
		"generated_images":      len(generationResult.Frames),
		"mode":                  "reference_image_unification",
		"style":                 "unified_catalog_day_night",
		"reference_input":       "data_uri",
		"reference_input_count": generationResult.ReferenceInputCount,
		"reference_input_urls":  generationResult.ReferenceInputURLs,
		"selected_color":        color,
		"reference_visual":      referenceVisual.Id,
		"generated_visual":      visual.Id,
	}
	outputSummary = mergeStringAnyMaps(outputSummary, assetVisualImageModelRequestSummary(config, assetVisualImageModelInputResult{
		Inputs:            make([]string, generationResult.ReferenceInputCount),
		URLs:              generationResult.ReferenceInputURLs,
		InputPayloadBytes: generationResult.ReferenceInputPayloadBytes,
		ColorMatchScores:  generationResult.ReferenceInputColorScores,
		TotalPayloadBytes: generationResult.ReferenceInputTotalBytes,
		Skipped:           generationResult.SkippedReferences,
	}))
	if len(generationResult.SkippedReferences) > 0 {
		outputSummary["reference_skip_reasons"] = assetVisualReferenceSkipSummaries(generationResult.SkippedReferences)
	}
	applyAssetVisualImageModelDiagnosticsToSummary(outputSummary, generationResult.ImageModelOutputDiagnostics)
	if err := mergeAssetVisualTaskSummary(task, outputSummary); err != nil {
		return nil, "ready", "", err
	}
	task.Set("status", "ready")
	task.Set("error", "")
	if err := h.Save(task); err != nil {
		return nil, "ready", "", err
	}
	return visual, "ready", "统一全貌图已生成。", nil
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
	modelDiscoveryDefault := true
	if strings.Contains(strings.ToLower(rawEndpoint), "/images/") {
		modelDiscoveryDefault = false
	}
	return assetVisualAIConfig{
		Enabled:               enabled,
		Provider:              firstNonEmpty(strings.TrimSpace(os.Getenv("PULSE_ASSET_VISUAL_AI_PROVIDER")), "agnes"),
		Endpoint:              normalizeAssetVisualDiscoveryEndpoint(firstNonEmpty(rawEndpoint, "https://apihub.agnes-ai.com/v1/chat/completions")),
		APIKey:                key,
		Model:                 firstNonEmpty(strings.TrimSpace(os.Getenv("PULSE_ASSET_VISUAL_AI_MODEL")), "agnes-2.0-flash"),
		FrameCount:            normalizeAssetTurntableFrameCount(0),
		ModelDiscoveryEnabled: configBoolEnvDefault("PULSE_ASSET_VISUAL_AI_MODEL_DISCOVERY_ENABLED", modelDiscoveryDefault),
		MaxImages:             normalizeAssetVisualMaxImages(configIntEnvDefault("PULSE_ASSET_VISUAL_AI_MAX_IMAGES", defaultAssetVisualMaxImages)),
		OfficialOnly:          configBoolEnvDefault("PULSE_ASSET_VISUAL_AI_OFFICIAL_ONLY", true),
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
		"phase":                   "reference_collecting",
		"phase_label":             "正在收集参考图",
		"progress_percent":        10,
		"model_discovery_enabled": config.ModelDiscoveryEnabled,
		"model_discovered_images": countAssetVisualReferencesByProvider(references, "asset_visual_agent"),
		"official_only":           config.OfficialOnly,
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

func (h *Hub) createGeneratedAssetVisualRecord(userID string, asset *core.Record, taskID string, color string, frames []map[string]any, references []map[string]any, prompt string) (*core.Record, error) {
	collection, err := h.FindCachedCollectionByNameOrId("asset_visuals")
	if err != nil {
		return nil, err
	}
	record := core.NewRecord(collection)
	record.Set("user", userID)
	record.Set("asset", asset.Id)
	record.Set("task", taskID)
	record.Set("kind", "ai_turntable")
	record.Set("status", "ready")
	record.Set("title", firstNonEmpty(asset.GetString("name"), asset.GetString("model"), "设备统一全貌图"))
	record.Set("color", color)
	record.Set("frame_count", len(frames))
	record.Set("primary", true)
	record.Set("frames", frames)
	record.Set("sources", references)
	record.Set("prompt", prompt)
	record.Set("metadata", map[string]any{
		"generation_status": "ready",
		"reference_input":   "data_uri",
		"visual_role":       "final_unified",
		"style":             "统一背景、统一摆放、统一资产展示图",
	})
	if err := h.Save(record); err != nil {
		return nil, err
	}
	if err := h.demotePreviousGeneratedAssetVisuals(userID, asset.Id, record.Id); err != nil {
		return nil, err
	}
	return record, nil
}

func (h *Hub) demotePreviousGeneratedAssetVisuals(userID string, assetID string, activeVisualID string) error {
	return h.demotePreviousPrimaryAssetVisuals(userID, assetID, activeVisualID)
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
	candidateLimit := normalizeAssetVisualMaxImages(config.MaxImages)
	if officialImageURL := recordMetadataString(asset, "official_image_url"); isLikelyImageURL(officialImageURL) {
		result = appendAssetVisualReferenceSource(result, seen, map[string]any{
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
	if len(result) >= candidateLimit {
		return result
	}
	online := h.collectAssetOnlineReferenceEnrichment(asset)
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
			"color":      inferAssetVisualSourceColor(asset, color, strings.Join(nonEmptyStrings(source.Title, source.URL, source.ImageURL), " ")),
			"confidence": source.Confidence,
		})
		if len(result) >= candidateLimit {
			break
		}
	}
	if len(result) < candidateLimit {
		result = h.collectAssetVisualAISourceDiscovery(asset, color, config, result, seen, candidateLimit)
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
		if imageURL == "" || !isLikelyAssetVisualImageURL(imageURL) {
			continue
		}
		sourceType := firstNonEmpty(candidate.Type, classifyAssetOnlineURL(imageURL))
		if config.OfficialOnly && !assetVisualAIReferenceSourceAllowed(imageURL, sourceType) {
			continue
		}
		result = appendAssetVisualReferenceSource(result, seen, map[string]any{
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

func assetVisualAIReferenceSourceAllowed(rawURL string, sourceType string) bool {
	if assetOnlineSourceHasOfficialAuthority(assetOnlineSource{Type: sourceType}) {
		return true
	}
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err == nil && isLocalAssetOnlineHost(parsed.Hostname()) {
		return true
	}
	return false
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
	limit = normalizeAssetVisualMaxImages(limit)
	return map[string]any{
		"model":       model,
		"temperature": 0,
		"messages": []map[string]string{
			{
				"role":    "system",
				"content": "你是 Pulse 资产中心的设备图片找图 Agent。你只返回官方或可追溯真实设备图片 URL，不生成图片，不返回产品页截图，不返回营销海报、色卡、图标、Logo、相机样张或不同型号图片。目标是找到最多 10 张同一设备的候选图，并按官方颜色分类。若用户提供 selected_color，优先找这个官方颜色；若 selected_color 为空，必须覆盖官方可确认的不同颜色并给每张图标注官方色名。优先级：1 厂商官网产品图库、规格页、支持页、官方 CDN；2 官方说明书或资料包；3 权威规格库只作兜底。必须匹配厂商、型号和内部型号，不能混入同系列不同型号或电商改色图。返回严格 JSON：{\"sources\":[{\"image_url\":\"https://...\",\"source_url\":\"https://...\",\"title\":\"...\",\"color\":\"官方色名\",\"type\":\"official_image\",\"confidence\":90}]}；每条 sources 都尽量填写 color。",
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
					"max_images": limit,
					"source_policy": map[string]any{
						"must_be_real_device_photo_or_render": true,
						"required_result_count":               limit,
						"must_match_selected_color":           strings.TrimSpace(color) != "",
						"group_by_official_color":             true,
						"color_required_per_source":           true,
						"preferred_sources":                   []string{"official product gallery", "official specs page image", "official support image", "official CDN image"},
						"reject":                              []string{"AI generated image", "marketing banner", "poster", "color chart", "icon", "logo", "camera sample", "different variant", "ecommerce-only image when official source exists"},
					},
				}),
			},
		},
		"response_format": map[string]string{"type": "json_object"},
	}, nil
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
	pageInputs := assetVisualReferencePageInputs(asset)
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
		if !assetOnlineSourceHasOfficialAuthority(assetOnlineSource{Type: sourceType}) {
			continue
		}
		result = h.collectAssetVisualBundleImageSources(asset, parsed, body, page.Provider, result, seen, limit)
		if len(result) >= limit {
			break
		}
		for _, candidate := range extractAssetVisualHTMLImageCandidates(parsed, body) {
			if !assetVisualHTMLCandidateMatchesAsset(asset, candidate) {
				continue
			}
			result = appendAssetVisualReferenceSource(result, seen, map[string]any{
				"title":      title,
				"url":        parsed.String(),
				"image_url":  candidate.URL,
				"type":       "official_page_image",
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
			result = appendAssetVisualReferenceSource(result, seen, map[string]any{
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

func buildAssetVisualUnificationPrompt(asset *core.Record, color string, references []map[string]any) string {
	referenceLines := make([]string, 0, len(references))
	for _, source := range references {
		if imageURL, _ := source["image_url"].(string); imageURL != "" {
			referenceLines = append(referenceLines, imageURL)
		}
	}
	colorInstruction := assetVisualOfficialColorPrompt(color)
	return strings.Join(nonEmptyStrings(
		"You are the Pulse asset image Agent. This is an image-to-image asset catalog cleanup task, not a free text-to-image task and not a 3D redesign task.",
		"Change request: keep the reference device as the product layer, replace only the scene/background, remove poster foreground clutter, and fit the original device into a unified catalog canvas.",
		"Elements to preserve unchanged: the exact real device identity, body outline, body thickness, camera island shape, lens count, lens positions, flash shape, ports, side buttons, bezels, logo placement, proportions, material, and selected official color.",
		"Do not create a new render, a similar phone, or a redesigned product. Treat the input reference device as the final product source, not as loose inspiration.",
		"If references conflict, prefer official product, official support, official CDN, and product bundle images over all other sources.",
		"Device: "+strings.Join(nonEmptyStrings(asset.GetString("vendor"), asset.GetString("model"), recordMetadataString(asset, "internal_model"), asset.GetString("name")), " / "),
		"Selected official color: "+color+".",
		colorInstruction,
		"Reference fidelity is mandatory: use the provided reference image as the exact device source. Do not redraw, redesign, or reinterpret the device body, lens count, camera island shape, logo placement, side buttons, bezels, proportions, color, or material.",
		"Remove the original poster scene, rocks, flames, plants, hands, packaging, marketing text, UI screenshots, and any other non-device background elements from the reference image. Keep only the device on the requested unified catalog background.",
		"If the official reference image hides a small part of the phone behind poster foreground, reconstruct only the missing outer body edge from the same device silhouette. Do not change the camera module, body color, button position, lens count, lens placement, or proportions.",
		"Do not invent or garble brand text, specification text, certification text, or model labels. Preserve text only when it can remain exact from the reference; otherwise remove, fade, or softly blur tiny text instead of creating fake letters.",
		"Composition requirements: show exactly one asset in one selected color, use a portrait 3:4 catalog canvas, show the complete device body from top to bottom with visible top, bottom, left, and right margins, keep the device readable without touching any canvas edge, occupy about 62-78% of the canvas height, center it with consistent scale and placement across all assets.",
		"For phones and tablets, keep the same camera angle as the strongest official reference. Preserve the exact camera island geometry and lens count from the reference; do not simplify it into a generic circular or square phone camera module. Prefer a single clean three-quarter back view only when that is already present in the reference. If front and back are both shown, both views must be the same selected official color. Never place two different colors in one output.",
		"If the official reference has strong colored environment light, treat that light as background contamination only. Keep the device body in the selected official color, not in the poster light color.",
		"Style requirements: clean catalog render, unified neutral background, realistic material, no hands, no packaging, no marketing text, no UI screenshots, no extra accessories, no invented camera modules, no invented colors, no second device color.",
		"Output theme requirement will be provided per request: day uses a light neutral background; night uses a dark immersive neutral background. The device itself must remain clear and must not disappear into the background.",
		"Reference image URLs: "+strings.Join(referenceLines, " ; "),
	), "\n")
}

func assetVisualOfficialColorPrompt(color string) string {
	color = strings.TrimSpace(color)
	colorClass := classifyAssetVisualOfficialColor(color)
	switch colorClass {
	case "dark":
		return "Selected color constraint: render the body as the official " + color + " color, a very dark graphite black / ink-black finish with subtle cool highlights only. Do not turn the device blue, purple, green, silver, or white."
	case "light":
		return "Selected color constraint: render the body as the official " + color + " color, a light white / silver finish. Do not turn the device black, blue, green, purple, or gold."
	case "green":
		return "Selected color constraint: render the body as the official " + color + " color, a green / teal finish matching the official reference. Do not turn the device black, white, blue, purple, or gold."
	case "purple":
		return "Selected color constraint: render the body as the official " + color + " color, a purple / violet finish matching the official reference. Do not turn the device black, white, blue, green, or gold."
	case "blue":
		return "Selected color constraint: render the body as the official " + color + " color, a blue finish matching the official reference. Do not turn the device black, white, green, purple, or gold."
	case "gold":
		return "Selected color constraint: render the body as the official " + color + " color, a gold / warm finish matching the official reference. Do not turn the device black, white, blue, green, or purple."
	default:
		if color == "" {
			return ""
		}
		return "Selected color constraint: render only the official " + color + " color shown by the reference images. Do not invent another device color."
	}
}

func validateAssetVisualGenerationPrerequisites(asset *core.Record, color string, config assetVisualAIConfig) string {
	if strings.TrimSpace(asset.GetString("model")) == "" || strings.TrimSpace(recordMetadataString(asset, "internal_model")) == "" {
		return "收集设备图片需要型号 / 规格和内部型号 / 搜索代码。"
	}
	if strings.TrimSpace(color) != "" && assetRequiresOfficialColorSelection(asset) {
		options := assetOfficialColorOptions(asset)
		if len(options) > 0 && !assetColorInOptions(color, options) {
			return "当前颜色不在已采集的官方配色中。请先从官方配色列表里选择。"
		}
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

func (h *Hub) generateUnifiedAssetVisualFrames(config assetVisualAIConfig, asset *core.Record, color string, referenceSources []map[string]any, basePrompt string, progress assetVisualGenerationProgress) (assetVisualGenerationResult, error) {
	referenceURLs := assetVisualModelReferenceURLs(referenceSources)
	if len(referenceURLs) == 0 {
		return assetVisualGenerationResult{}, fmt.Errorf("没有可用于图片编辑的参考图。")
	}
	referenceInputResult := h.buildAssetVisualImageModelInputs(referenceURLs, color)
	if len(referenceInputResult.Inputs) == 0 {
		return assetVisualGenerationResult{}, newAssetVisualReferenceInputError(referenceInputResult.Skipped)
	}
	result := assetVisualGenerationResult{
		SkippedReferences:          referenceInputResult.Skipped,
		ReferenceInputCount:        len(referenceInputResult.Inputs),
		ReferenceInputURLs:         referenceInputResult.URLs,
		ReferenceInputPayloadBytes: referenceInputResult.InputPayloadBytes,
		ReferenceInputColorScores:  referenceInputResult.ColorMatchScores,
		ReferenceInputTotalBytes:   referenceInputResult.TotalPayloadBytes,
	}
	requestSummary := assetVisualImageModelRequestSummary(config, referenceInputResult)
	if progress != nil {
		progress(mergeStringAnyMaps(map[string]any{
			"phase":                 "reference_input_ready",
			"phase_label":           "已准备模型参考图",
			"progress_percent":      45,
			"reference_input_count": len(referenceInputResult.Inputs),
			"reference_input_urls":  referenceInputResult.URLs,
		}, requestSummary))
	}

	themes := []struct {
		id     string
		label  string
		prompt string
	}{
		{id: "day", label: "白天", prompt: "Generate the day version by preserving the original reference device and replacing the scene with a light neutral catalog background. Use a portrait 3:4 canvas. Keep exactly one complete device, centered, fully visible with top, bottom, left, and right margins, and only in the selected official color. Remove every non-selected body color from the references. Do not change the device model, camera island, lens positions, body color, or logo placement."},
		{id: "night", label: "夜晚", prompt: "Generate the night version by preserving the original reference device and replacing the scene with a dark graphite or near-black immersive neutral catalog background. Use a portrait 3:4 canvas. The background must be truly dark; white, off-white, beige, silver, and light gray backgrounds are forbidden. Keep exactly one complete device, centered, fully visible with top, bottom, left, and right margins, clearly lit, and only in the selected official color. Remove every non-selected body color from the references. Do not change the device model, camera island, lens positions, body color, or logo placement."},
	}
	frames := make([]map[string]any, 0, len(themes))
	outputProbeCache := assetVisualImageModelOutputProbeCache{}
	for index, theme := range themes {
		if progress != nil {
			progress(map[string]any{
				"phase":            "image_model_" + theme.id,
				"phase_label":      "正在生成" + theme.label + "图",
				"progress_percent": 55 + index*20,
				"generated_images": len(frames),
			})
		}
		var modelResult assetVisualImageModelCallResult
		var frameURL string
		var err error
		var validationReason string
		for qualityAttempt := 1; qualityAttempt <= assetVisualImageModelQualityMaxAttempts; qualityAttempt++ {
			prompt := basePrompt + "\n" + theme.prompt
			if validationReason != "" {
				prompt += "\nPrevious output was rejected by Pulse quality checks: " + validationReason + " Regenerate the image with the complete device fully visible, centered, with larger clean margins, correct selected official color, and unchanged camera module geometry."
			}
			modelResult, err = h.callAssetVisualImageModel(config, prompt, referenceInputResult.Inputs, outputProbeCache)
			result.ImageModelOutputDiagnostics = mergeAssetVisualImageModelDiagnostics(result.ImageModelOutputDiagnostics, modelResult.Diagnostics)
			if err != nil {
				result.Frames = frames
				return result, err
			}
			frameURL = postprocessAssetVisualGeneratedFrameDataURI(modelResult.URL, theme.id)
			validationReason = validateAssetVisualGeneratedFrameDataURI(frameURL, asset, color)
			if validationReason == "" {
				break
			}
			result.ImageModelOutputDiagnostics.Rejections = append(result.ImageModelOutputDiagnostics.Rejections, assetVisualImageModelOutputRejection{
				Source: modelResult.ResponseFormat,
				URL:    frameURL,
				Reason: validationReason,
			})
		}
		if validationReason != "" {
			result.Frames = frames
			return result, errors.New(validationReason)
		}
		frames = append(frames, map[string]any{
			"index":           index,
			"view":            "unified",
			"theme":           theme.id,
			"label":           theme.label,
			"url":             frameURL,
			"source_title":    "设备图片 Agent 统一化输出",
			"source_url":      "",
			"revised_prompt":  modelResult.RevisedPrompt,
			"reference_urls":  referenceInputResult.URLs,
			"color":           color,
			"response_format": modelResult.ResponseFormat,
		})
		if progress != nil {
			progress(map[string]any{
				"phase":            "image_model_" + theme.id + "_ready",
				"phase_label":      theme.label + "图已生成",
				"progress_percent": 70 + index*20,
				"generated_images": len(frames),
			})
		}
	}
	result.Frames = frames
	return result, nil
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

func (h *Hub) buildAssetVisualImageModelInputs(referenceURLs []string, color string) assetVisualImageModelInputResult {
	result := assetVisualImageModelInputResult{
		Inputs:            make([]string, 0, len(referenceURLs)),
		URLs:              make([]string, 0, len(referenceURLs)),
		InputPayloadBytes: make([]int, 0, len(referenceURLs)),
		ColorMatchScores:  make([]int, 0, len(referenceURLs)),
		Skipped:           []assetVisualReferenceSkip{},
	}
	candidates := make([]assetVisualImageModelInputCandidate, 0, minInt(len(referenceURLs), assetVisualImageModelMaxReferenceCandidates))
	for index, rawURL := range referenceURLs {
		if len(candidates) >= assetVisualImageModelMaxReferenceCandidates {
			break
		}
		dataURI, rawBody, err := h.fetchAssetVisualReferenceDataURI(rawURL, color)
		if err != nil {
			result.Skipped = append(result.Skipped, assetVisualReferenceSkip{
				URL:    rawURL,
				Reason: strings.TrimSpace(err.Error()),
			})
			continue
		}
		if dataURI != "" {
			candidates = append(candidates, assetVisualImageModelInputCandidate{
				DataURI:      dataURI,
				URL:          rawURL,
				PayloadBytes: len(dataURI),
				ColorScore:   scoreAssetVisualReferenceImageColor(rawBody, color),
				Index:        index,
			})
		}
	}
	for _, candidate := range selectAssetVisualImageModelInputCandidates(candidates, color) {
		if len(result.Inputs) >= assetVisualImageModelMaxReferenceInputs {
			break
		}
		result.Inputs = append(result.Inputs, candidate.DataURI)
		result.URLs = append(result.URLs, candidate.URL)
		result.InputPayloadBytes = append(result.InputPayloadBytes, candidate.PayloadBytes)
		result.ColorMatchScores = append(result.ColorMatchScores, candidate.ColorScore)
		result.TotalPayloadBytes += candidate.PayloadBytes
	}
	return result
}

func selectAssetVisualImageModelInputCandidates(candidates []assetVisualImageModelInputCandidate, color string) []assetVisualImageModelInputCandidate {
	if len(candidates) == 0 {
		return nil
	}
	selected := make([]assetVisualImageModelInputCandidate, len(candidates))
	copy(selected, candidates)
	colorClass := classifyAssetVisualOfficialColor(color)
	if colorClass == "unknown" {
		return selected
	}
	sort.SliceStable(selected, func(i, j int) bool {
		if selected[i].ColorScore == selected[j].ColorScore {
			return selected[i].Index < selected[j].Index
		}
		return selected[i].ColorScore > selected[j].ColorScore
	})
	bestScore := selected[0].ColorScore
	if bestScore < 18 {
		return candidates
	}
	filtered := make([]assetVisualImageModelInputCandidate, 0, assetVisualImageModelMaxReferenceInputs)
	for _, candidate := range selected {
		if candidate.ColorScore <= 0 || bestScore-candidate.ColorScore > 10 {
			continue
		}
		filtered = append(filtered, candidate)
		if len(filtered) >= assetVisualImageModelMaxReferenceInputs {
			break
		}
	}
	if len(filtered) == 0 {
		return candidates
	}
	return filtered
}

func scoreAssetVisualReferenceImageColor(rawBody []byte, color string) int {
	colorClass := classifyAssetVisualOfficialColor(color)
	if colorClass == "unknown" || len(rawBody) == 0 {
		return 0
	}
	img, _, err := image.Decode(bytes.NewReader(rawBody))
	if err != nil {
		return 0
	}
	bounds := img.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()
	if width <= 0 || height <= 0 {
		return 0
	}
	startX := bounds.Min.X + width*38/100
	endX := bounds.Min.X + width*62/100
	startY := bounds.Min.Y + height*14/100
	endY := bounds.Min.Y + height*92/100
	stride := maxInt(1, minInt(width, height)/90)
	total := 0
	matches := 0
	for y := startY; y < endY; y += stride {
		for x := startX; x < endX; x += stride {
			r16, g16, b16, _ := img.At(x, y).RGBA()
			r := int(r16 >> 8)
			g := int(g16 >> 8)
			b := int(b16 >> 8)
			total++
			if assetVisualPixelMatchesColorClass(r, g, b, colorClass) {
				matches++
			}
		}
	}
	if total == 0 {
		return 0
	}
	return matches * 100 / total
}

func assetVisualPixelMatchesColorClass(r int, g int, b int, colorClass string) bool {
	maxChannel := maxInt(r, g, b)
	minChannel := minInt(r, g, b)
	luma := (r*299 + g*587 + b*114) / 1000
	saturation := maxChannel - minChannel
	switch colorClass {
	case "dark":
		return luma < 82 && saturation < 70
	case "light":
		return luma > 178 && saturation < 58
	case "green":
		return g > r+16 && g > b-8 && luma > 70
	case "purple":
		return r > 78 && b > 92 && b > g+12
	case "blue":
		return b > r+12 && b > g-8 && luma > 62
	case "gold":
		return r > 130 && g > 92 && b < 120
	default:
		return false
	}
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

func minInt(values ...int) int {
	if len(values) == 0 {
		return 0
	}
	result := values[0]
	for _, value := range values[1:] {
		if value < result {
			result = value
		}
	}
	return result
}

func absInt(value int) int {
	if value < 0 {
		return -value
	}
	return value
}

func assetVisualImageModelRequestSummary(config assetVisualAIConfig, inputs assetVisualImageModelInputResult) map[string]any {
	endpointHost, endpointPath := safeEndpointHostAndPath(config.Endpoint)
	summary := map[string]any{
		"image_model_endpoint_host":            endpointHost,
		"image_model_endpoint_path":            endpointPath,
		"image_model_size":                     "768x1024",
		"image_model_response_format":          "b64_json",
		"image_model_fallback_response_format": "url",
		"image_model_max_attempts":             assetVisualImageModelMaxAttempts,
		"image_model_timeout_seconds":          int(assetVisualImageModelRequestTimeout().Seconds()),
		"image_model_reference_input_limit":    assetVisualImageModelMaxReferenceInputs,
		"image_model_reference_input_count":    len(inputs.Inputs),
		"image_model_reference_payload_bytes":  inputs.TotalPayloadBytes,
	}
	if len(inputs.InputPayloadBytes) > 0 {
		values := make([]int, len(inputs.InputPayloadBytes))
		copy(values, inputs.InputPayloadBytes)
		summary["image_model_reference_payload_sizes"] = values
	}
	if len(inputs.ColorMatchScores) > 0 {
		values := make([]int, len(inputs.ColorMatchScores))
		copy(values, inputs.ColorMatchScores)
		summary["image_model_reference_color_scores"] = values
	}
	return summary
}

func safeEndpointHostAndPath(raw string) (string, string) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return "", ""
	}
	return parsed.Host, parsed.Path
}

func mergeStringAnyMaps(base map[string]any, overlays ...map[string]any) map[string]any {
	if base == nil {
		base = map[string]any{}
	}
	for _, overlay := range overlays {
		for key, value := range overlay {
			base[key] = value
		}
	}
	return base
}

func summarizeAssetVisualReferenceSkipReasons(skipped []assetVisualReferenceSkip) string {
	reasons := make([]string, 0, len(skipped))
	seen := map[string]bool{}
	for _, item := range skipped {
		reason := strings.TrimSpace(item.Reason)
		if reason == "" || seen[reason] {
			continue
		}
		seen[reason] = true
		reasons = append(reasons, reason)
		if len(reasons) >= 3 {
			break
		}
	}
	return strings.Join(reasons, "；")
}

func assetVisualReferenceSkipSummaries(skipped []assetVisualReferenceSkip) []map[string]any {
	result := make([]map[string]any, 0, len(skipped))
	for _, item := range skipped {
		reason := strings.TrimSpace(item.Reason)
		if reason == "" {
			continue
		}
		result = append(result, map[string]any{
			"url":    strings.TrimSpace(item.URL),
			"reason": reason,
		})
	}
	return result
}

func mergeAssetVisualImageModelDiagnostics(left assetVisualImageModelDiagnostics, right assetVisualImageModelDiagnostics) assetVisualImageModelDiagnostics {
	left.Candidates += right.Candidates
	left.Selected += right.Selected
	if len(right.Rejections) > 0 {
		left.Rejections = append(left.Rejections, right.Rejections...)
	}
	return left
}

func applyAssetVisualImageModelDiagnosticsToSummary(summary map[string]any, diagnostics assetVisualImageModelDiagnostics) {
	if diagnostics.Candidates <= 0 && diagnostics.Selected <= 0 && len(diagnostics.Rejections) == 0 {
		return
	}
	summary["image_model_output_candidates"] = diagnostics.Candidates
	summary["image_model_output_selected"] = diagnostics.Selected
	summary["image_model_output_rejected"] = len(diagnostics.Rejections)
	if len(diagnostics.Rejections) > 0 {
		summary["image_model_output_rejections"] = assetVisualImageModelOutputRejectionSummaries(diagnostics.Rejections)
	}
}

func assetVisualImageModelOutputRejectionSummaries(rejections []assetVisualImageModelOutputRejection) []map[string]any {
	result := make([]map[string]any, 0, len(rejections))
	for _, item := range rejections {
		reason := strings.TrimSpace(item.Reason)
		if reason == "" {
			continue
		}
		result = append(result, map[string]any{
			"source": strings.TrimSpace(item.Source),
			"url":    summarizeAssetVisualImageModelOutputURL(item.URL),
			"reason": reason,
		})
	}
	return result
}

func summarizeAssetVisualImageModelOutputURL(rawURL string) string {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return ""
	}
	if strings.HasPrefix(strings.ToLower(rawURL), "data:") {
		return "data-uri"
	}
	if len(rawURL) > 240 {
		return rawURL[:240] + "..."
	}
	return rawURL
}

func (h *Hub) fetchAssetVisualReferenceDataURI(rawURL string, color string) (string, []byte, error) {
	rawURL = strings.TrimSpace(rawURL)
	if !isLikelyAssetVisualImageURL(rawURL) {
		return "", nil, fmt.Errorf("参考图 URL 不可用。")
	}
	req, err := http.NewRequest(http.MethodGet, rawURL, nil)
	if err != nil {
		return "", nil, err
	}
	req.Header.Set("Accept", "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8")
	req.Header.Set("User-Agent", "PulseAssetVisualAgent/1.0")
	client := &http.Client{Timeout: 25 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", nil, fmt.Errorf("参考图下载失败：%s", strconvItoa(resp.StatusCode))
	}
	if resp.ContentLength > assetVisualReferenceImageFetchMaxBytes {
		return "", nil, fmt.Errorf("参考图大小超过可处理上限。")
	}
	rawBody, err := io.ReadAll(io.LimitReader(resp.Body, assetVisualReferenceImageFetchMaxBytes+1))
	if err != nil {
		return "", nil, err
	}
	if len(rawBody) == 0 {
		return "", nil, fmt.Errorf("参考图大小不符合要求。")
	}
	if len(rawBody) > assetVisualReferenceImageFetchMaxBytes {
		return "", nil, fmt.Errorf("参考图大小超过可处理上限。")
	}
	mimeType := assetVisualReferenceImageMimeType(rawBody)
	if mimeType == "" {
		return "", nil, fmt.Errorf("参考图不是可用图片。")
	}
	preparedBody, preparedMime, err := prepareAssetVisualReferenceImageForModel(rawBody, color)
	if err != nil {
		return "", nil, fmt.Errorf("参考图无法预处理为设备外观输入。")
	}
	rawBody = preparedBody
	mimeType = preparedMime
	if len(rawBody) > assetVisualReferenceImageMaxBytes {
		normalized, normalizedMime, err := normalizeAssetVisualReferenceImage(rawBody)
		if err != nil {
			return "", nil, fmt.Errorf("参考图大小超过模型输入上限，且无法压缩处理。")
		}
		rawBody = normalized
		mimeType = normalizedMime
	}
	if len(rawBody) > assetVisualReferenceImageMaxBytes {
		return "", nil, fmt.Errorf("参考图大小超过模型输入上限。")
	}
	if width, height, ok := assetVisualReferenceImageDimensions(rawBody); ok && !assetVisualReferenceImageDimensionsLookLikeDevice(width, height) {
		return "", nil, fmt.Errorf("参考图尺寸过小，不像设备外观图。")
	}
	return "data:" + mimeType + ";base64," + base64.StdEncoding.EncodeToString(rawBody), rawBody, nil
}

func prepareAssetVisualReferenceImageForModel(rawBody []byte, color string) ([]byte, string, error) {
	mimeType := assetVisualReferenceImageMimeType(rawBody)
	if mimeType == "" {
		return nil, "", fmt.Errorf("invalid reference image")
	}
	img, _, err := image.Decode(bytes.NewReader(rawBody))
	if err != nil {
		return rawBody, mimeType, nil
	}
	bounds := img.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()
	if width <= 0 || height <= 0 {
		return nil, "", fmt.Errorf("invalid image bounds")
	}
	needsNormalize := len(rawBody) > assetVisualReferenceImageMaxBytes
	if assetVisualReferenceImageLooksLikeWidePoster(width, height) {
		img = cropAssetVisualWidePosterToDeviceReference(img, bounds, color)
		needsNormalize = true
	}
	if !needsNormalize {
		return rawBody, mimeType, nil
	}
	return encodeAssetVisualReferenceImageForModel(img)
}

func assetVisualReferenceImageLooksLikeWidePoster(width int, height int) bool {
	if width <= 0 || height <= 0 {
		return false
	}
	return width*10 >= height*16
}

func cropAssetVisualWidePosterToDeviceReference(img image.Image, bounds image.Rectangle, color string) image.Image {
	width := bounds.Dx()
	height := bounds.Dy()
	if width <= 0 || height <= 0 {
		return img
	}
	if cropBounds, ok := assetVisualColorFocusedCropBounds(img, bounds, color); ok {
		return imaging.Crop(img, cropBounds)
	}
	cropWidth := height * 58 / 100
	if cropWidth < width*22/100 {
		cropWidth = width * 22 / 100
	}
	if cropWidth > width {
		cropWidth = width
	}
	if cropWidth < 260 {
		cropWidth = minInt(width, 260)
	}
	x0 := bounds.Min.X + (width-cropWidth)/2
	x1 := x0 + cropWidth
	if x0 < bounds.Min.X {
		x0 = bounds.Min.X
		x1 = x0 + cropWidth
	}
	if x1 > bounds.Max.X {
		x1 = bounds.Max.X
		x0 = x1 - cropWidth
	}
	return imaging.Crop(img, image.Rect(x0, bounds.Min.Y, x1, bounds.Max.Y))
}

func assetVisualColorFocusedCropBounds(img image.Image, bounds image.Rectangle, colorName string) (image.Rectangle, bool) {
	colorClass := classifyAssetVisualOfficialColor(colorName)
	if colorClass == "unknown" {
		return image.Rectangle{}, false
	}
	width := bounds.Dx()
	height := bounds.Dy()
	if width <= 0 || height <= 0 {
		return image.Rectangle{}, false
	}
	search := image.Rect(
		bounds.Min.X+width*28/100,
		bounds.Min.Y+height*4/100,
		bounds.Min.X+width*72/100,
		bounds.Min.Y+height*96/100,
	)
	stride := maxInt(1, minInt(width, height)/120)
	x0, y0 := bounds.Max.X, bounds.Max.Y
	x1, y1 := bounds.Min.X, bounds.Min.Y
	matches := 0
	for y := search.Min.Y; y < search.Max.Y; y += stride {
		for x := search.Min.X; x < search.Max.X; x += stride {
			r16, g16, b16, _ := img.At(x, y).RGBA()
			if !assetVisualPixelMatchesColorClass(int(r16>>8), int(g16>>8), int(b16>>8), colorClass) {
				continue
			}
			matches++
			if x < x0 {
				x0 = x
			}
			if x > x1 {
				x1 = x
			}
			if y < y0 {
				y0 = y
			}
			if y > y1 {
				y1 = y
			}
		}
	}
	if matches < 80 || x1 <= x0 || y1 <= y0 {
		return image.Rectangle{}, false
	}
	deviceWidth := x1 - x0
	deviceHeight := y1 - y0
	if deviceWidth < width*4/100 || deviceHeight < height*28/100 {
		return image.Rectangle{}, false
	}
	paddingX := maxInt(width*3/100, deviceWidth*55/100)
	paddingTop := height * 8 / 100
	paddingBottom := height * 6 / 100
	cropX0 := maxInt(bounds.Min.X, x0-paddingX)
	cropX1 := minInt(bounds.Max.X, x1+paddingX)
	cropY0 := maxInt(bounds.Min.Y, y0-paddingTop)
	cropY1 := minInt(bounds.Max.Y, y1+paddingBottom)
	if cropX1-cropX0 < 260 || cropY1-cropY0 < 480 {
		return image.Rectangle{}, false
	}
	return image.Rect(cropX0, cropY0, cropX1, cropY1), true
}

func assetVisualReferenceImageMimeType(rawBody []byte) string {
	return assetVisualImageMimeTypeFromBytes(rawBody)
}

func assetVisualReferenceImageDimensions(rawBody []byte) (int, int, bool) {
	config, _, err := image.DecodeConfig(bytes.NewReader(rawBody))
	if err != nil || config.Width <= 0 || config.Height <= 0 {
		return 0, 0, false
	}
	return config.Width, config.Height, true
}

func assetVisualReferenceImageDimensionsLookLikeDevice(width int, height int) bool {
	longEdge := maxInt(width, height)
	shortEdge := minInt(width, height)
	return longEdge >= 480 && shortEdge >= 220
}

func normalizeAssetVisualReferenceImage(rawBody []byte) ([]byte, string, error) {
	img, _, err := image.Decode(bytes.NewReader(rawBody))
	if err != nil {
		return nil, "", err
	}
	return encodeAssetVisualReferenceImageForModel(img)
}

func encodeAssetVisualReferenceImageForModel(img image.Image) ([]byte, string, error) {
	bounds := img.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()
	if width <= 0 || height <= 0 {
		return nil, "", fmt.Errorf("invalid image bounds")
	}
	longEdge := assetVisualReferenceImageMaxLongEdge
	for _, quality := range []int{82, 74, 66, 58} {
		normalized := resizeAssetVisualReferenceImage(img, width, height, longEdge)
		var output bytes.Buffer
		if err := imaging.Encode(&output, normalized, imaging.JPEG, imaging.JPEGQuality(quality)); err != nil {
			return nil, "", err
		}
		if output.Len() > 0 && output.Len() <= assetVisualReferenceImageMaxBytes {
			return output.Bytes(), "image/jpeg", nil
		}
		if longEdge > 768 {
			longEdge -= 128
		}
	}
	return nil, "", fmt.Errorf("normalized reference image exceeds limit")
}

func resizeAssetVisualReferenceImage(img image.Image, width int, height int, longEdge int) image.Image {
	if longEdge <= 0 {
		longEdge = assetVisualReferenceImageMaxLongEdge
	}
	if width <= longEdge && height <= longEdge {
		return img
	}
	if width >= height {
		return imaging.Resize(img, longEdge, 0, imaging.Lanczos)
	}
	return imaging.Resize(img, 0, longEdge, imaging.Lanczos)
}

func normalizeAssetVisualImageMimeType(value string) string {
	value = strings.ToLower(strings.TrimSpace(strings.Split(value, ";")[0]))
	switch value {
	case "image/jpeg", "image/png", "image/webp", "image/avif":
		return value
	default:
		return ""
	}
}

func assetVisualMimeTypeFromURL(rawURL string) string {
	lower := strings.ToLower(strings.TrimSpace(rawURL))
	if parsed, err := url.Parse(lower); err == nil && parsed.Path != "" {
		lower = parsed.Path
	}
	switch {
	case strings.HasSuffix(lower, ".jpg"), strings.HasSuffix(lower, ".jpeg"):
		return "image/jpeg"
	case strings.HasSuffix(lower, ".png"):
		return "image/png"
	case strings.HasSuffix(lower, ".webp"):
		return "image/webp"
	case strings.HasSuffix(lower, ".avif"):
		return "image/avif"
	default:
		return ""
	}
}

func (h *Hub) callAssetVisualImageModel(config assetVisualAIConfig, prompt string, referenceInputs []string, outputProbeCache assetVisualImageModelOutputProbeCache) (assetVisualImageModelCallResult, error) {
	var combinedDiagnostics assetVisualImageModelDiagnostics
	var lastErr error
	for _, responseFormat := range []string{"b64_json", "url"} {
		result, err := h.callAssetVisualImageModelWithResponseFormat(config, prompt, referenceInputs, responseFormat, outputProbeCache)
		combinedDiagnostics = mergeAssetVisualImageModelDiagnostics(combinedDiagnostics, result.Diagnostics)
		if err == nil {
			result.Diagnostics = combinedDiagnostics
			result.ResponseFormat = responseFormat
			return result, nil
		}
		lastErr = err
		if responseFormat == "b64_json" && !assetVisualImageModelShouldFallbackToURL(err) {
			return assetVisualImageModelCallResult{Diagnostics: combinedDiagnostics}, err
		}
	}
	if lastErr != nil {
		return assetVisualImageModelCallResult{Diagnostics: combinedDiagnostics}, lastErr
	}
	return assetVisualImageModelCallResult{Diagnostics: combinedDiagnostics}, fmt.Errorf("图片模型请求失败。")
}

func (h *Hub) callAssetVisualImageModelWithResponseFormat(config assetVisualAIConfig, prompt string, referenceInputs []string, responseFormat string, outputProbeCache assetVisualImageModelOutputProbeCache) (assetVisualImageModelCallResult, error) {
	payload := map[string]any{
		"model":  config.Model,
		"prompt": prompt,
		"n":      1,
		"size":   "768x1024",
		"extra_body": map[string]any{
			"image":           referenceInputs,
			"response_format": responseFormat,
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return assetVisualImageModelCallResult{}, fmt.Errorf("图片模型请求编码失败。")
	}
	client := &http.Client{Timeout: assetVisualImageModelRequestTimeout()}
	var lastErr error
	for attempt := 1; attempt <= assetVisualImageModelMaxAttempts; attempt++ {
		req, err := http.NewRequest(http.MethodPost, config.Endpoint, bytes.NewReader(body))
		if err != nil {
			return assetVisualImageModelCallResult{}, fmt.Errorf("图片模型请求创建失败。")
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json")
		req.Header.Set("Authorization", "Bearer "+config.APIKey)
		resp, err := client.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("图片模型请求失败：%s", err.Error())
			if assetVisualImageModelErrorTimedOut(err) {
				return assetVisualImageModelCallResult{}, lastErr
			}
			if attempt < assetVisualImageModelMaxAttempts {
				time.Sleep(assetVisualRetryDelay(attempt, ""))
				continue
			}
			return assetVisualImageModelCallResult{}, lastErr
		}
		rawBody, readErr := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
		_ = resp.Body.Close()
		if readErr != nil {
			lastErr = fmt.Errorf("图片模型响应读取失败。")
			if attempt < assetVisualImageModelMaxAttempts {
				time.Sleep(assetVisualRetryDelay(attempt, ""))
				continue
			}
			return assetVisualImageModelCallResult{}, lastErr
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			lastErr = fmt.Errorf("图片模型返回非成功状态：%s%s", strconvItoa(resp.StatusCode), formatRemoteErrorBody(rawBody))
			if attempt < assetVisualImageModelMaxAttempts && isTransientAssetVisualImageModelStatus(resp.StatusCode) {
				time.Sleep(assetVisualRetryDelay(attempt, resp.Header.Get("Retry-After")))
				continue
			}
			return assetVisualImageModelCallResult{}, lastErr
		}
		diagnostics := assetVisualImageModelDiagnostics{}
		for _, output := range extractAssetVisualImageModelOutputs(rawBody) {
			diagnostics.Candidates++
			stableURL, reason := h.materializeAssetVisualImageModelOutput(output, outputProbeCache)
			if reason != "" {
				diagnostics.Rejections = append(diagnostics.Rejections, assetVisualImageModelOutputRejection{
					Source: output.Source,
					URL:    output.URL,
					Reason: reason,
				})
				continue
			}
			diagnostics.Selected++
			return assetVisualImageModelCallResult{
				URL:            stableURL,
				RevisedPrompt:  output.RevisedPrompt,
				Diagnostics:    diagnostics,
				ResponseFormat: responseFormat,
			}, nil
		}
		return assetVisualImageModelCallResult{Diagnostics: diagnostics}, fmt.Errorf("图片模型没有返回可显示图片。")
	}
	if lastErr != nil {
		return assetVisualImageModelCallResult{}, lastErr
	}
	return assetVisualImageModelCallResult{}, fmt.Errorf("图片模型请求失败。")
}

func assetVisualImageModelShouldFallbackToURL(err error) bool {
	if err == nil {
		return false
	}
	text := strings.ToLower(err.Error())
	if assetVisualImageModelErrorTimedOut(err) {
		return false
	}
	for _, marker := range []string{"401", "403", "unauthorized", "forbidden"} {
		if strings.Contains(text, marker) {
			return false
		}
	}
	for _, marker := range []string{
		"unexpected eof",
		"context deadline exceeded",
		"client.timeout",
		"connection reset",
		"connection refused",
		"timeout",
		"429",
		"500",
		"502",
		"503",
		"504",
		"response_format",
		"b64_json",
		"unsupported",
	} {
		if strings.Contains(text, marker) {
			return true
		}
	}
	return false
}

func assetVisualImageModelErrorTimedOut(err error) bool {
	if err == nil {
		return false
	}
	var timeoutErr interface{ Timeout() bool }
	if errors.As(err, &timeoutErr) && timeoutErr.Timeout() {
		return true
	}
	text := strings.ToLower(err.Error())
	return strings.Contains(text, "client.timeout") ||
		strings.Contains(text, "context deadline exceeded") ||
		strings.Contains(text, "deadline exceeded")
}

func isTransientAssetVisualImageModelStatus(status int) bool {
	return status == http.StatusTooManyRequests || status >= 500
}

func assetVisualImageModelRequestTimeout() time.Duration {
	if milliseconds, err := strconv.Atoi(strings.TrimSpace(os.Getenv("PULSE_ASSET_VISUAL_AI_REQUEST_TIMEOUT_MS"))); err == nil && milliseconds > 0 {
		timeout := time.Duration(milliseconds) * time.Millisecond
		if timeout < 100*time.Millisecond {
			return 100 * time.Millisecond
		}
		if timeout > maxAssetVisualImageModelRequestTimeout {
			return maxAssetVisualImageModelRequestTimeout
		}
		return timeout
	}
	if seconds, err := strconv.Atoi(strings.TrimSpace(os.Getenv("PULSE_ASSET_VISUAL_AI_REQUEST_TIMEOUT_SECONDS"))); err == nil && seconds > 0 {
		timeout := time.Duration(seconds) * time.Second
		if timeout < time.Second {
			return time.Second
		}
		if timeout > maxAssetVisualImageModelRequestTimeout {
			return maxAssetVisualImageModelRequestTimeout
		}
		return timeout
	}
	return defaultAssetVisualImageModelRequestTimeout
}

func assetVisualRetryDelay(attempt int, retryAfter string) time.Duration {
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

type assetVisualImageModelOutput struct {
	URL           string
	RevisedPrompt string
	Source        string
	RejectReason  string
}

func extractAssetVisualImageModelOutputs(rawBody []byte) []assetVisualImageModelOutput {
	var response struct {
		Data []struct {
			URL           string `json:"url"`
			B64JSON       string `json:"b64_json"`
			RevisedPrompt string `json:"revised_prompt"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rawBody, &response); err != nil || len(response.Data) == 0 {
		return nil
	}
	outputs := make([]assetVisualImageModelOutput, 0, len(response.Data))
	for _, item := range response.Data {
		revisedPrompt := strings.TrimSpace(item.RevisedPrompt)
		if strings.TrimSpace(item.URL) != "" {
			outputs = append(outputs, assetVisualImageModelOutput{
				URL:           strings.TrimSpace(item.URL),
				RevisedPrompt: revisedPrompt,
				Source:        "url",
			})
			continue
		}
		if strings.TrimSpace(item.B64JSON) != "" {
			dataURI, rejectReason := assetVisualImageModelDataURIFromBase64WithReason(item.B64JSON)
			outputs = append(outputs, assetVisualImageModelOutput{
				URL:           dataURI,
				RevisedPrompt: revisedPrompt,
				Source:        "b64_json",
				RejectReason:  rejectReason,
			})
			continue
		}
		outputs = append(outputs, assetVisualImageModelOutput{
			RevisedPrompt: revisedPrompt,
			Source:        "empty",
			RejectReason:  "模型候选为空。",
		})
	}
	return outputs
}

func assetVisualImageModelDataURIFromBase64(value string) string {
	dataURI, _ := assetVisualImageModelDataURIFromBase64WithReason(value)
	return dataURI
}

func assetVisualImageModelDataURIFromBase64WithReason(value string) (string, string) {
	payload := strings.TrimSpace(value)
	if payload == "" {
		return "", "模型返回的 Base64 为空。"
	}
	decoded, err := base64.StdEncoding.DecodeString(payload)
	if err != nil || len(decoded) == 0 {
		return "", "模型返回的 Base64 不是可识别图片。"
	}
	mimeType := assetVisualImageMimeTypeFromBytes(decoded)
	if mimeType == "" {
		return "", "模型返回的 Base64 不是可识别图片。"
	}
	return "data:" + mimeType + ";base64," + payload, ""
}

func postprocessAssetVisualGeneratedFrameDataURI(value string, theme string) string {
	if theme != "night" {
		return value
	}
	rawBody, ok := decodeAssetVisualDataURIBytes(value)
	if !ok {
		return value
	}
	img, _, err := image.Decode(bytes.NewReader(rawBody))
	if err != nil {
		return value
	}
	normalized, changed := darkenConnectedLightAssetVisualBackground(img)
	if !changed {
		return value
	}
	var output bytes.Buffer
	if err := imaging.Encode(&output, normalized, imaging.PNG); err != nil || output.Len() == 0 {
		return value
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(output.Bytes())
}

func validateAssetVisualGeneratedFrameDataURI(value string, asset *core.Record, colorName string) string {
	rawBody, ok := decodeAssetVisualDataURIBytes(value)
	if !ok {
		return ""
	}
	img, _, err := image.Decode(bytes.NewReader(rawBody))
	if err != nil {
		return ""
	}
	bounds := img.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()
	if width <= 0 || height <= 0 {
		return "图片模型输出尺寸无效。"
	}
	if assetVisualOutputShouldBePortrait(asset) {
		ratio := float64(width) / float64(height)
		if ratio < 0.58 || ratio > 0.86 {
			return "图片模型输出不是适合手机资产的竖向全貌图。"
		}
	}
	foreground, ok := detectAssetVisualForegroundBounds(img)
	if !ok {
		return ""
	}
	foregroundHeightRatio := float64(foreground.Dy()) / float64(height)
	foregroundTouchesEdge := assetVisualForegroundTouchesCanvasEdge(foreground, bounds, width, height)
	if assetVisualOutputShouldBePortrait(asset) && !foregroundTouchesEdge && (foregroundHeightRatio < 0.48 || foregroundHeightRatio > 0.92) {
		return "图片模型输出的设备主体比例不适合资产详情展示。"
	}
	if reason := validateAssetVisualGeneratedFrameColor(img, foreground, colorName); reason != "" {
		return reason
	}
	return ""
}

func assetVisualForegroundTouchesCanvasEdge(foreground image.Rectangle, bounds image.Rectangle, width int, height int) bool {
	marginX := maxInt(2, width*2/100)
	marginY := maxInt(2, height*2/100)
	return foreground.Min.X <= bounds.Min.X+marginX ||
		foreground.Max.X >= bounds.Max.X-marginX ||
		foreground.Min.Y <= bounds.Min.Y+marginY ||
		foreground.Max.Y >= bounds.Max.Y-marginY
}

func assetVisualOutputShouldBePortrait(asset *core.Record) bool {
	if asset == nil {
		return false
	}
	switch strings.TrimSpace(asset.GetString("type")) {
	case "phone", "tablet", "wearable", "handheld", "ebook":
		return true
	default:
		return false
	}
}

func detectAssetVisualForegroundBounds(img image.Image) (image.Rectangle, bool) {
	bounds := img.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()
	if width <= 0 || height <= 0 {
		return image.Rectangle{}, false
	}
	background := averageAssetVisualCornerColor(img, bounds)
	stride := maxInt(1, minInt(width, height)/180)
	x0, y0 := bounds.Max.X, bounds.Max.Y
	x1, y1 := bounds.Min.X, bounds.Min.Y
	foregroundSamples := 0
	totalSamples := 0
	for y := bounds.Min.Y; y < bounds.Max.Y; y += stride {
		for x := bounds.Min.X; x < bounds.Max.X; x += stride {
			totalSamples++
			r16, g16, b16, a16 := img.At(x, y).RGBA()
			if a16 == 0 {
				continue
			}
			pixel := color.RGBA{R: uint8(r16 >> 8), G: uint8(g16 >> 8), B: uint8(b16 >> 8), A: uint8(a16 >> 8)}
			if !assetVisualPixelDiffersFromBackground(pixel, background) {
				continue
			}
			foregroundSamples++
			if x < x0 {
				x0 = x
			}
			if x > x1 {
				x1 = x
			}
			if y < y0 {
				y0 = y
			}
			if y > y1 {
				y1 = y
			}
		}
	}
	if totalSamples == 0 || foregroundSamples*100/totalSamples < 3 || x1 <= x0 || y1 <= y0 {
		return image.Rectangle{}, false
	}
	return image.Rect(x0, y0, x1+stride, y1+stride).Intersect(bounds), true
}

func averageAssetVisualCornerColor(img image.Image, bounds image.Rectangle) color.RGBA {
	width := bounds.Dx()
	height := bounds.Dy()
	sampleWidth := maxInt(2, width/12)
	sampleHeight := maxInt(2, height/12)
	rects := []image.Rectangle{
		image.Rect(bounds.Min.X, bounds.Min.Y, bounds.Min.X+sampleWidth, bounds.Min.Y+sampleHeight),
		image.Rect(bounds.Max.X-sampleWidth, bounds.Min.Y, bounds.Max.X, bounds.Min.Y+sampleHeight),
		image.Rect(bounds.Min.X, bounds.Max.Y-sampleHeight, bounds.Min.X+sampleWidth, bounds.Max.Y),
		image.Rect(bounds.Max.X-sampleWidth, bounds.Max.Y-sampleHeight, bounds.Max.X, bounds.Max.Y),
	}
	var rTotal, gTotal, bTotal, count int
	for _, rect := range rects {
		stride := maxInt(1, minInt(rect.Dx(), rect.Dy())/16)
		for y := rect.Min.Y; y < rect.Max.Y; y += stride {
			for x := rect.Min.X; x < rect.Max.X; x += stride {
				r16, g16, b16, a16 := img.At(x, y).RGBA()
				if a16 == 0 {
					continue
				}
				rTotal += int(r16 >> 8)
				gTotal += int(g16 >> 8)
				bTotal += int(b16 >> 8)
				count++
			}
		}
	}
	if count == 0 {
		return color.RGBA{}
	}
	return color.RGBA{R: uint8(rTotal / count), G: uint8(gTotal / count), B: uint8(bTotal / count), A: 255}
}

func assetVisualPixelDiffersFromBackground(pixel color.RGBA, background color.RGBA) bool {
	dr := absInt(int(pixel.R) - int(background.R))
	dg := absInt(int(pixel.G) - int(background.G))
	db := absInt(int(pixel.B) - int(background.B))
	distance := dr + dg + db
	maxChannel := maxInt(int(pixel.R), int(pixel.G), int(pixel.B))
	minChannel := minInt(int(pixel.R), int(pixel.G), int(pixel.B))
	saturation := maxChannel - minChannel
	return distance > 68 || (distance > 42 && saturation > 44)
}

func validateAssetVisualGeneratedFrameColor(img image.Image, foreground image.Rectangle, colorName string) string {
	colorClass := classifyAssetVisualOfficialColor(colorName)
	if colorClass == "unknown" {
		return ""
	}
	stride := maxInt(1, minInt(foreground.Dx(), foreground.Dy())/120)
	total := 0
	matches := 0
	for y := foreground.Min.Y; y < foreground.Max.Y; y += stride {
		for x := foreground.Min.X; x < foreground.Max.X; x += stride {
			r16, g16, b16, a16 := img.At(x, y).RGBA()
			if a16 == 0 {
				continue
			}
			total++
			if assetVisualPixelMatchesGeneratedColorClass(int(r16>>8), int(g16>>8), int(b16>>8), colorClass) {
				matches++
			}
		}
	}
	if total < 80 {
		return ""
	}
	if matches*100/total < 10 {
		return "图片模型输出的设备主体颜色与所选官方配色不一致。"
	}
	return ""
}

func assetVisualPixelMatchesGeneratedColorClass(r int, g int, b int, colorClass string) bool {
	maxChannel := maxInt(r, g, b)
	minChannel := minInt(r, g, b)
	luma := (r*299 + g*587 + b*114) / 1000
	saturation := maxChannel - minChannel
	switch colorClass {
	case "dark":
		return luma < 112 && saturation < 112
	case "light":
		return luma > 160 && saturation < 82
	case "green":
		return g > r+10 && g > b-18 && luma > 58
	case "purple":
		return r > 70 && b > 86 && b > g+4
	case "blue":
		return b > r+8 && b > g-16 && luma > 48
	case "gold":
		return r > 118 && g > 82 && b < 138
	default:
		return false
	}
}

func decodeAssetVisualDataURIBytes(value string) ([]byte, bool) {
	trimmed := strings.TrimSpace(value)
	commaIndex := strings.Index(trimmed, ",")
	if commaIndex <= 0 {
		return nil, false
	}
	header := strings.ToLower(strings.TrimSpace(trimmed[:commaIndex]))
	if !strings.HasPrefix(header, "data:") || !strings.Contains(header, ";base64") {
		return nil, false
	}
	payload := strings.TrimSpace(trimmed[commaIndex+1:])
	if payload == "" {
		return nil, false
	}
	rawBody, err := base64.StdEncoding.DecodeString(payload)
	if err != nil || len(rawBody) == 0 {
		return nil, false
	}
	return rawBody, true
}

func darkenConnectedLightAssetVisualBackground(img image.Image) (*image.NRGBA, bool) {
	canvas := imaging.Clone(img)
	bounds := canvas.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()
	if width <= 0 || height <= 0 {
		return canvas, false
	}
	visited := make([]bool, width*height)
	queue := make([]image.Point, 0, width*2+height*2)
	push := func(x int, y int) {
		if x < bounds.Min.X || x >= bounds.Max.X || y < bounds.Min.Y || y >= bounds.Max.Y {
			return
		}
		index := (y-bounds.Min.Y)*width + (x - bounds.Min.X)
		if visited[index] {
			return
		}
		visited[index] = true
		if !assetVisualPixelLooksLikeLightNeutralBackground(canvas.NRGBAAt(x, y)) {
			return
		}
		queue = append(queue, image.Point{X: x, Y: y})
	}
	for x := bounds.Min.X; x < bounds.Max.X; x++ {
		push(x, bounds.Min.Y)
		push(x, bounds.Max.Y-1)
	}
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		push(bounds.Min.X, y)
		push(bounds.Max.X-1, y)
	}
	changed := false
	for len(queue) > 0 {
		point := queue[0]
		queue = queue[1:]
		pixel := canvas.NRGBAAt(point.X, point.Y)
		luma := (int(pixel.R)*299 + int(pixel.G)*587 + int(pixel.B)*114) / 1000
		shade := uint8(8 + maxInt(0, 255-luma)/16)
		canvas.SetNRGBA(point.X, point.Y, color.NRGBA{R: shade, G: shade + 1, B: shade + 4, A: pixel.A})
		changed = true
		push(point.X+1, point.Y)
		push(point.X-1, point.Y)
		push(point.X, point.Y+1)
		push(point.X, point.Y-1)
	}
	return canvas, changed
}

func assetVisualPixelLooksLikeLightNeutralBackground(pixel color.NRGBA) bool {
	maxChannel := maxInt(int(pixel.R), int(pixel.G), int(pixel.B))
	minChannel := minInt(int(pixel.R), int(pixel.G), int(pixel.B))
	luma := (int(pixel.R)*299 + int(pixel.G)*587 + int(pixel.B)*114) / 1000
	saturation := maxChannel - minChannel
	return pixel.A > 0 && luma >= 132 && saturation <= 54
}

func (h *Hub) materializeAssetVisualImageModelOutput(output assetVisualImageModelOutput, outputProbeCache assetVisualImageModelOutputProbeCache) (string, string) {
	if strings.TrimSpace(output.RejectReason) != "" {
		return "", strings.TrimSpace(output.RejectReason)
	}
	return h.materializeAssetVisualGeneratedImageOutput(output.URL, outputProbeCache)
}

func (h *Hub) materializeAssetVisualGeneratedImageOutput(rawURL string, outputProbeCache assetVisualImageModelOutputProbeCache) (string, string) {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return "", "模型候选为空。"
	}
	if assetVisualGeneratedImageDataURIIsUsable(rawURL) {
		return rawURL, ""
	}
	if strings.HasPrefix(strings.ToLower(rawURL), "data:") {
		return "", "模型返回的 Data URI 不是可识别图片。"
	}
	if outputProbeCache != nil {
		if cached, ok := outputProbeCache[rawURL]; ok {
			return cached.URL, cached.Reason
		}
	}
	stableURL, reason := h.fetchAssetVisualGeneratedImageDataURI(rawURL)
	if outputProbeCache != nil {
		outputProbeCache[rawURL] = assetVisualImageModelOutputMaterializeResult{
			URL:    stableURL,
			Reason: reason,
		}
	}
	return stableURL, reason
}

func assetVisualGeneratedImageDataURIIsUsable(value string) bool {
	trimmed := strings.TrimSpace(value)
	commaIndex := strings.Index(trimmed, ",")
	if commaIndex <= 0 {
		return false
	}
	header := strings.ToLower(strings.TrimSpace(trimmed[:commaIndex]))
	if !strings.HasPrefix(header, "data:") || !strings.Contains(header, ";base64") {
		return false
	}
	mimeType := strings.TrimPrefix(strings.Split(header, ";")[0], "data:")
	if normalizeAssetVisualImageMimeType(mimeType) == "" {
		return false
	}
	payload := strings.TrimSpace(trimmed[commaIndex+1:])
	if payload == "" {
		return false
	}
	decoded, err := base64.StdEncoding.DecodeString(payload)
	if err != nil || len(decoded) == 0 {
		return false
	}
	return assetVisualImageMimeTypeFromBytes(decoded) != ""
}

func (h *Hub) fetchAssetVisualGeneratedImageDataURI(rawURL string) (string, string) {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || parsed.Host == "" {
		return "", "模型返回的 URL 不是可验证图片。"
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", "模型返回的 URL 不是可验证图片。"
	}
	req, err := http.NewRequest(http.MethodGet, rawURL, nil)
	if err != nil {
		return "", "模型返回的 URL 不是可验证图片。"
	}
	req.Header.Set("Accept", "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8")
	req.Header.Set("User-Agent", "PulseAssetVisualAgent/1.0")
	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", "模型返回的 URL 不是可验证图片。"
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", "模型返回的 URL 不是可验证图片。"
	}
	if resp.ContentLength > assetVisualGeneratedImageMaxBytes {
		return "", "模型返回的图片超过保存上限。"
	}
	rawBody, err := io.ReadAll(io.LimitReader(resp.Body, assetVisualGeneratedImageMaxBytes+1))
	if err != nil || len(rawBody) == 0 {
		return "", "模型返回的 URL 不是可验证图片。"
	}
	if len(rawBody) > assetVisualGeneratedImageMaxBytes {
		return "", "模型返回的图片超过保存上限。"
	}
	mimeType := assetVisualImageMimeTypeFromBytes(rawBody)
	if mimeType == "" {
		return "", "模型返回的 URL 不是可验证图片。"
	}
	return "data:" + mimeType + ";base64," + base64.StdEncoding.EncodeToString(rawBody), ""
}

func assetVisualImageMimeTypeFromBytes(rawBody []byte) string {
	if len(rawBody) == 0 {
		return ""
	}
	if detectedMime := normalizeAssetVisualImageMimeType(http.DetectContentType(rawBody)); detectedMime != "" {
		return detectedMime
	}
	if len(rawBody) >= 12 && string(rawBody[0:4]) == "RIFF" && string(rawBody[8:12]) == "WEBP" {
		return "image/webp"
	}
	if len(rawBody) >= 12 && string(rawBody[4:8]) == "ftyp" {
		brand := string(rawBody[8:12])
		if brand == "avif" || brand == "avis" {
			return "image/avif"
		}
	}
	return ""
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
		if !isLikelyAssetVisualImageURL(imageURL) {
			continue
		}
		title, _ := source["title"].(string)
		sourceURL, _ := source["url"].(string)
		candidates = append(candidates, map[string]any{
			"url":          imageURL,
			"source_title": title,
			"source_url":   sourceURL,
			"color":        firstNonEmpty(stringFromAny(source["color"]), inferAssetVisualSourceColor(asset, color, strings.Join(nonEmptyStrings(title, sourceURL, imageURL), " "))),
			"theme_score":  scoreAssetVisualNightCandidate(source),
			"visual_score": scoreAssetVisualDisplayCandidate(source),
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
	if limit > len(candidates) {
		limit = len(candidates)
	}
	frames := make([]map[string]any, 0, limit)
	orderedCandidates := orderAssetVisualThemeCandidates(candidates, limit)
	for index := 0; index < limit; index++ {
		source := orderedCandidates[index%len(orderedCandidates)]
		frames = append(frames, map[string]any{
			"index":        index,
			"view":         "candidate",
			"theme":        "candidate",
			"label":        fmt.Sprintf("候选 %d", index+1),
			"color":        stringFromAny(source["color"]),
			"url":          source["url"],
			"source_title": source["source_title"],
			"source_url":   source["source_url"],
		})
	}
	return frames
}

func (h *Hub) preferredAssetVisualReferenceURLs(referenceURLs []string, color string) []string {
	if len(referenceURLs) == 0 || strings.TrimSpace(color) == "" {
		return nil
	}
	inputs := h.buildAssetVisualImageModelInputs(referenceURLs, color)
	if len(inputs.URLs) == 0 {
		return nil
	}
	return inputs.URLs
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
