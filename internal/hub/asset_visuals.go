package hub

import (
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"net/url"
	"os"
	"regexp"
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
		result = h.collectAssetVisualBundleImageSources(parsed, body, result, seen, limit)
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

type assetVisualHTMLImageCandidate struct {
	URL     string
	Context string
	Width   int
	Height  int
}

func (h *Hub) collectAssetVisualBundleImageSources(pageURL *url.URL, body string, result []map[string]any, seen map[string]bool, limit int) []map[string]any {
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
				"provider":   "support_url",
				"confidence": 94,
			})
			if len(result) >= limit {
				break
			}
		}
	}
	return result
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
		"banner-title",
	}
	for _, marker := range rejected {
		if strings.Contains(lower, marker) {
			return false
		}
	}
	preferred := []string{"spec-color", "color", "product", "phone", "appearance", "overview", "front", "back", "side", "gallery", "main"}
	for _, marker := range preferred {
		if strings.Contains(lower, marker) {
			return true
		}
	}
	return false
}

func extractAssetVisualHTMLImageCandidates(base *url.URL, body string) []assetVisualHTMLImageCandidate {
	pattern := regexp.MustCompile(`(?is)<(?:img|source)\b[^>]*>`)
	tags := pattern.FindAllStringIndex(body, -1)
	result := make([]assetVisualHTMLImageCandidate, 0, len(tags))
	for _, loc := range tags {
		tag := body[loc[0]:loc[1]]
		rawCandidates := nonEmptyStrings(
			extractAssetVisualHTMLAttr(tag, "data-src"),
			extractAssetVisualHTMLAttr(tag, "src"),
			extractAssetVisualHTMLAttr(tag, "srcset"),
		)
		context := strings.Join(nonEmptyStrings(
			extractAssetVisualHTMLAttr(tag, "alt"),
			extractAssetVisualHTMLAttr(tag, "title"),
			extractAssetVisualHTMLAttr(tag, "aria-label"),
			extractAssetVisualNearbyText(body, loc[0], loc[1]),
		), " ")
		width, _ := strconv.Atoi(strings.TrimSpace(extractAssetVisualHTMLAttr(tag, "width")))
		height, _ := strconv.Atoi(strings.TrimSpace(extractAssetVisualHTMLAttr(tag, "height")))
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
	return result
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
