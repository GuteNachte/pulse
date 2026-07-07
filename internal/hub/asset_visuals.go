package hub

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
	nethtml "golang.org/x/net/html"
)

const defaultAssetTurntableFrameCount = 2
const assetVisualImageModelMaxAttempts = 3
const assetVisualReferenceImageMaxBytes = 2 * 1024 * 1024
const assetVisualGeneratedImageMaxBytes = 4 * 1024 * 1024

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

type assetVisualReferenceSkip struct {
	URL    string
	Reason string
}

type assetVisualImageModelInputResult struct {
	Inputs  []string
	URLs    []string
	Skipped []assetVisualReferenceSkip
}

type assetVisualGenerationResult struct {
	Frames                      []map[string]any
	SkippedReferences           []assetVisualReferenceSkip
	ReferenceInputCount         int
	ReferenceInputURLs          []string
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
	URL           string
	RevisedPrompt string
	Diagnostics   assetVisualImageModelDiagnostics
}

type assetVisualImageModelOutputProbeCache map[string]assetVisualImageModelOutputMaterializeResult

type assetVisualImageModelOutputMaterializeResult struct {
	URL    string
	Reason string
}

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
	frameCount := normalizeAssetTurntableFrameCountWithDefault(req.FrameCount, config.FrameCount)
	color := firstNonEmpty(strings.TrimSpace(req.Color), recordMetadataString(asset, "color"), recordMetadataString(asset, "device_color"))
	if message := validateAssetVisualGenerationPrerequisites(asset, color, config); message != "" {
		task, visual, createErr := h.createFailedAssetVisualTaskAndRecord(e.Auth.Id, asset, config, frameCount, color, message, "blocked")
		if createErr != nil {
			return e.InternalServerError("Failed to create AI task.", createErr)
		}
		return e.JSON(http.StatusOK, map[string]any{"task": task, "visual": visual, "status": "blocked", "message": message})
	}
	references := h.collectAssetVisualReferenceSources(asset)
	prompt := buildAssetVisualUnificationPrompt(asset, color, references)

	task, err := h.createAssetAITask(e.Auth.Id, asset.Id, config, frameCount, color, references)
	if err != nil {
		return e.InternalServerError("Failed to create AI task.", err)
	}
	referenceVisual, err := h.createAssetVisualRecord(e.Auth.Id, asset, task.Id, color, frameCount, references, buildAssetImageCollectionPrompt(asset, color, frameCount, references))
	if err != nil {
		return e.InternalServerError("Failed to create asset visual.", err)
	}

	frames := buildCollectedAssetVisualFrames(references, frameCount)
	if len(frames) == 0 {
		message := "没有找到可追溯设备图片。请先补充厂家支持页、官方图片 URL，或运行资料补全 Agent 后再收集。"
		task.Set("status", "failed")
		task.Set("error", message)
		task.Set("output_summary", map[string]any{"collected_images": 0, "reason": "no_traceable_images"})
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
		"visual_role":       "reference_only",
		"note":              "设备图片来自可追溯来源，只作为图片 Agent 统一化编辑参考，不直接作为资产最终展示图。",
	})
	if err := h.Save(referenceVisual); err != nil {
		return e.InternalServerError("Failed to update asset visual.", err)
	}

	generationResult, generationErr := h.generateUnifiedAssetVisualFrames(config, asset, color, references, prompt)
	if generationErr != nil {
		message := generationErr.Error()
		outputSummary := map[string]any{"collected_images": len(frames), "reason": "image_generation_failed"}
		var referenceInputErr *assetVisualReferenceInputError
		if errors.As(generationErr, &referenceInputErr) {
			outputSummary["reason"] = "reference_images_unreadable"
			outputSummary["reference_skip_reasons"] = referenceInputErr.SkipSummaries()
		}
		applyAssetVisualImageModelDiagnosticsToSummary(outputSummary, generationResult.ImageModelOutputDiagnostics)
		task.Set("status", "failed")
		task.Set("error", message)
		task.Set("output_summary", outputSummary)
		if err := h.Save(task); err != nil {
			return e.InternalServerError("Failed to update AI task.", err)
		}
		return e.JSON(http.StatusOK, map[string]any{"task": task, "visual": referenceVisual, "status": "failed", "message": message})
	}

	visual, err := h.createGeneratedAssetVisualRecord(e.Auth.Id, asset, task.Id, color, generationResult.Frames, references, prompt)
	if err != nil {
		return e.InternalServerError("Failed to create generated asset visual.", err)
	}
	outputSummary := map[string]any{
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
	if len(generationResult.SkippedReferences) > 0 {
		outputSummary["reference_skip_reasons"] = assetVisualReferenceSkipSummaries(generationResult.SkippedReferences)
	}
	applyAssetVisualImageModelDiagnosticsToSummary(outputSummary, generationResult.ImageModelOutputDiagnostics)
	task.Set("status", "ready")
	task.Set("output_summary", outputSummary)
	if err := h.Save(task); err != nil {
		return e.InternalServerError("Failed to update AI task.", err)
	}
	h.createOperationAudit(e, "", "asset_visual_generate", asset.Id, "", "success", "资产设备统一全貌图已生成")
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
			// Legacy env var is intentionally ignored now: device visuals are fixed to day/night factual images.
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
		"mode":              "reference_image_unification",
		"style":             "unified_catalog_day_night",
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
	records, err := h.FindRecordsByFilter(
		"asset_visuals",
		"user = {:user} && asset = {:asset} && kind = 'ai_turntable' && primary = true && id != {:active}",
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
	result := make([]map[string]any, 0, defaultAssetTurntableFrameCount*6)
	seen := map[string]bool{}
	candidateLimit := defaultAssetTurntableFrameCount * 6
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
			"confidence": source.Confidence,
		})
		if len(result) >= candidateLimit {
			break
		}
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
		result = h.collectAssetVisualBundleImageSources(parsed, body, page.Provider, result, seen, limit)
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

func (h *Hub) collectAssetVisualBundleImageSources(pageURL *url.URL, body string, provider string, result []map[string]any, seen map[string]bool, limit int) []map[string]any {
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
		"Color: "+color+".",
		fmt.Sprintf("Need exactly %d theme-ready real source images: day and night. Do not invent device appearance.", frameCount),
		"Traceable image URLs: "+strings.Join(referenceLines, " ; "),
	), "\n")
}

func buildAssetVisualUnificationPrompt(asset *core.Record, color string, references []map[string]any) string {
	referenceLines := make([]string, 0, len(references))
	for _, source := range references {
		if imageURL, _ := source["image_url"].(string); imageURL != "" {
			referenceLines = append(referenceLines, imageURL)
		}
	}
	return strings.Join(nonEmptyStrings(
		"You are the Pulse asset image Agent. This is an image-to-image asset catalog task, not a free text-to-image task.",
		"Use the provided reference device images as the source of truth. Preserve the exact real device identity, body shape, camera layout, ports, bezels, logo placement, proportions, and selected official color.",
		"If references conflict, prefer official product, official support, official CDN, and product bundle images over all other sources.",
		"Device: "+strings.Join(nonEmptyStrings(asset.GetString("vendor"), asset.GetString("model"), recordMetadataString(asset, "internal_model"), asset.GetString("name")), " / "),
		"Selected official color: "+color+".",
		"Composition requirements: show the complete device body, keep the device large and readable, occupy about 70-82% of the canvas height, center it with consistent scale and placement across all assets.",
		"For phones and tablets, show front and back views together when the references support it; otherwise show the most complete official product view. Do not crop the device.",
		"Style requirements: clean catalog render, unified neutral background, realistic material, no hands, no packaging, no marketing text, no UI screenshots, no extra accessories, no invented camera modules, no invented colors.",
		"Output theme requirement will be provided per request: day uses a light neutral background; night uses a dark immersive neutral background. The device itself must remain clear and must not disappear into the background.",
		"Reference image URLs: "+strings.Join(referenceLines, " ; "),
	), "\n")
}

func validateAssetVisualGenerationPrerequisites(asset *core.Record, color string, config assetVisualAIConfig) string {
	if !config.Ready() {
		return "设备图片 Agent 未配置完整。请先在 AI 设置里配置 Agnes Base URL、API Key 和图片模型。"
	}
	if strings.TrimSpace(asset.GetString("model")) == "" || strings.TrimSpace(recordMetadataString(asset, "internal_model")) == "" {
		return "生成统一全貌图需要型号 / 规格和内部型号 / 搜索代码。"
	}
	if strings.TrimSpace(color) == "" {
		return "生成统一全貌图前必须先选择设备官方配色。"
	}
	if assetRequiresOfficialColorSelection(asset) {
		options := assetOfficialColorOptions(asset)
		if len(options) == 0 {
			return "手机等固定规格设备必须先点击“获取官方颜色”，由资料补全 Agent 采集官方配色，再选择其中一个配色后才能生成图片。"
		}
		if !assetColorInOptions(color, options) {
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

func (h *Hub) generateUnifiedAssetVisualFrames(config assetVisualAIConfig, asset *core.Record, color string, referenceSources []map[string]any, basePrompt string) (assetVisualGenerationResult, error) {
	referenceURLs := assetVisualModelReferenceURLs(referenceSources)
	if len(referenceURLs) == 0 {
		return assetVisualGenerationResult{}, fmt.Errorf("没有可用于图片编辑的参考图。")
	}
	referenceInputResult := h.buildAssetVisualImageModelInputs(referenceURLs)
	if len(referenceInputResult.Inputs) == 0 {
		return assetVisualGenerationResult{}, newAssetVisualReferenceInputError(referenceInputResult.Skipped)
	}
	result := assetVisualGenerationResult{
		SkippedReferences:   referenceInputResult.Skipped,
		ReferenceInputCount: len(referenceInputResult.Inputs),
		ReferenceInputURLs:  referenceInputResult.URLs,
	}

	themes := []struct {
		id     string
		label  string
		prompt string
	}{
		{id: "day", label: "白天", prompt: "Generate the day version with a light neutral catalog background. Keep the device centered, large, fully visible, and in the selected official color. Do not change the device model."},
		{id: "night", label: "夜晚", prompt: "Generate the night version with a dark immersive neutral catalog background. Keep the device centered, large, fully visible, clearly lit, and in the selected official color. Do not change the device model."},
	}
	frames := make([]map[string]any, 0, len(themes))
	outputProbeCache := assetVisualImageModelOutputProbeCache{}
	for index, theme := range themes {
		modelResult, err := h.callAssetVisualImageModel(config, basePrompt+"\n"+theme.prompt, referenceInputResult.Inputs, outputProbeCache)
		result.ImageModelOutputDiagnostics = mergeAssetVisualImageModelDiagnostics(result.ImageModelOutputDiagnostics, modelResult.Diagnostics)
		if err != nil {
			result.Frames = frames
			return result, err
		}
		frames = append(frames, map[string]any{
			"index":          index,
			"view":           "unified",
			"theme":          theme.id,
			"label":          theme.label,
			"url":            modelResult.URL,
			"source_title":   "设备图片 Agent 统一化输出",
			"source_url":     "",
			"revised_prompt": modelResult.RevisedPrompt,
			"reference_urls": referenceInputResult.URLs,
			"color":          color,
		})
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

func (h *Hub) buildAssetVisualImageModelInputs(referenceURLs []string) assetVisualImageModelInputResult {
	result := assetVisualImageModelInputResult{
		Inputs:  make([]string, 0, len(referenceURLs)),
		URLs:    make([]string, 0, len(referenceURLs)),
		Skipped: []assetVisualReferenceSkip{},
	}
	for _, rawURL := range referenceURLs {
		if len(result.Inputs) >= 4 {
			break
		}
		dataURI, err := h.fetchAssetVisualReferenceDataURI(rawURL)
		if err != nil {
			result.Skipped = append(result.Skipped, assetVisualReferenceSkip{
				URL:    rawURL,
				Reason: strings.TrimSpace(err.Error()),
			})
			continue
		}
		if dataURI != "" {
			result.Inputs = append(result.Inputs, dataURI)
			result.URLs = append(result.URLs, rawURL)
		}
	}
	return result
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

func (h *Hub) fetchAssetVisualReferenceDataURI(rawURL string) (string, error) {
	rawURL = strings.TrimSpace(rawURL)
	if !isLikelyAssetVisualImageURL(rawURL) {
		return "", fmt.Errorf("参考图 URL 不可用。")
	}
	req, err := http.NewRequest(http.MethodGet, rawURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8")
	req.Header.Set("User-Agent", "PulseAssetVisualAgent/1.0")
	client := &http.Client{Timeout: 25 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("参考图下载失败：%s", strconvItoa(resp.StatusCode))
	}
	if resp.ContentLength > assetVisualReferenceImageMaxBytes {
		return "", fmt.Errorf("参考图大小超过模型输入上限。")
	}
	rawBody, err := io.ReadAll(io.LimitReader(resp.Body, assetVisualReferenceImageMaxBytes+1))
	if err != nil {
		return "", err
	}
	if len(rawBody) == 0 || len(rawBody) > assetVisualReferenceImageMaxBytes {
		return "", fmt.Errorf("参考图大小不符合要求。")
	}
	mimeType := assetVisualReferenceImageMimeType(rawBody)
	if mimeType == "" {
		return "", fmt.Errorf("参考图不是可用图片。")
	}
	return "data:" + mimeType + ";base64," + base64.StdEncoding.EncodeToString(rawBody), nil
}

func assetVisualReferenceImageMimeType(rawBody []byte) string {
	return assetVisualImageMimeTypeFromBytes(rawBody)
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
	payload := map[string]any{
		"model":  config.Model,
		"prompt": prompt,
		"n":      1,
		"size":   "768x1024",
		"extra_body": map[string]any{
			"image":           referenceInputs,
			"response_format": "url",
		},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return assetVisualImageModelCallResult{}, fmt.Errorf("图片模型请求编码失败。")
	}
	client := &http.Client{Timeout: 120 * time.Second}
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
				URL:           stableURL,
				RevisedPrompt: output.RevisedPrompt,
				Diagnostics:   diagnostics,
			}, nil
		}
		return assetVisualImageModelCallResult{Diagnostics: diagnostics}, fmt.Errorf("图片模型没有返回可显示图片。")
	}
	if lastErr != nil {
		return assetVisualImageModelCallResult{}, lastErr
	}
	return assetVisualImageModelCallResult{}, fmt.Errorf("图片模型请求失败。")
}

func isTransientAssetVisualImageModelStatus(status int) bool {
	return status == http.StatusTooManyRequests || status >= 500
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

func buildCollectedAssetVisualFrames(references []map[string]any, limit int) []map[string]any {
	themeLabels := []struct {
		theme string
		label string
	}{
		{theme: "day", label: "白天"},
		{theme: "night", label: "夜晚"},
	}
	if limit <= 0 || limit > len(themeLabels) {
		limit = len(themeLabels)
	}
	candidates := make([]map[string]any, 0, limit)
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
			"theme_score":  scoreAssetVisualNightCandidate(source),
			"visual_score": scoreAssetVisualDisplayCandidate(source),
		})
	}
	if len(candidates) == 0 {
		return nil
	}
	frames := make([]map[string]any, 0, limit)
	orderedCandidates := orderAssetVisualThemeCandidates(candidates, limit)
	for index := 0; index < limit; index++ {
		source := orderedCandidates[index%len(orderedCandidates)]
		frames = append(frames, map[string]any{
			"index":        index,
			"view":         "theme",
			"theme":        themeLabels[index].theme,
			"label":        themeLabels[index].label,
			"url":          source["url"],
			"source_title": source["source_title"],
			"source_url":   source["source_url"],
		})
	}
	return frames
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
