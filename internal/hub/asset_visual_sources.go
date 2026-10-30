package hub

import (
	"encoding/json"
	"net/url"
	"sort"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

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

func (h *Hub) collectAssetImageSearchFallbackSources(asset *core.Record, color string, result []map[string]any, limit int) []map[string]any {
	if len(result) >= limit || !assetImageSearchEnabled() {
		return result
	}
	seen := make(map[string]bool, len(result))
	for _, source := range result {
		if imageURL := assetVisualReferenceImageURL(source); imageURL != "" {
			seen[strings.ToLower(strings.TrimSpace(imageURL))] = true
		}
	}
	if assetUsesProviderLogoVisual(asset) {
		return h.collectAssetVisualBingServiceLogoSources(asset, buildAssetServiceLogoSearchQueries(asset), result, seen, limit)
	}
	if !assetImageSearchEligible(asset) {
		return result
	}
	plan := buildAssetImageSearchPlan(asset, color, h.assetOnlineAIConfig())
	return h.collectAssetVisualBingImageSources(asset, plan.Queries, result, seen, limit)
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
	for _, metadataKey := range []string{"official_url", "service_url", "public_url", "external_url", "internal_url", "check_url", "url"} {
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
	systemPrompt := "你是 Pulse 资产中心的设备图片找图 Agent。先使用提供的 search_keywords 组合多组检索词，再收集同一资产适合作为档案主图的真实图片候选。不要生成图片，不要返回产品页截图、营销横幅、海报、色卡、图标、Logo、相机样张、带水印图片或明显不同型号。目标是尽可能返回 15 张高适配候选，并按可识别颜色分类；颜色未知时可留空。优先级：厂商官网产品图库、官方 CDN、支持页和说明书，其次是可追溯规格库、可信媒体或零售产品图。厂商、型号和内部型号用于提高匹配度，不完整时应结合资产名称和类型继续检索，不得因此拒绝任务。返回严格 JSON：{\"search_keywords\":[\"...\"],\"sources\":[{\"image_url\":\"https://...\",\"source_url\":\"https://...\",\"title\":\"...\",\"color\":\"可选颜色\",\"type\":\"official_image|reference_image\",\"confidence\":90}]}。"
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
		return isLikelyAssetServiceLogoURL(rawURL)
	}
	return isLikelyAssetVisualImageURL(rawURL)
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
