// This file was created by mechanically splitting internal/hub/asset_enrichment_online.go.
// All declarations below were moved verbatim from that file; there is no behavior change.
// Theme: web page fetching, parsing and spec extraction.

package hub

import (
	"errors"
	"html"
	"io"
	"mime"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

type assetOnlineReferenceURLInput struct {
	Provider string
	Label    string
	URL      string
}

func assetOnlineReferenceURLInputs(asset *core.Record) []assetOnlineReferenceURLInput {
	candidates := []assetOnlineReferenceURLInput{
		{Provider: "support_url", Label: "厂家支持页", URL: recordMetadataString(asset, "support_url")},
		{Provider: "product_url", Label: "厂家产品页", URL: recordMetadataString(asset, "product_url")},
		{Provider: "official_url", Label: "厂家官网页", URL: recordMetadataString(asset, "official_url")},
	}
	result := make([]assetOnlineReferenceURLInput, 0, len(candidates))
	seen := map[string]bool{}
	for _, candidate := range candidates {
		rawURL := strings.TrimSpace(candidate.URL)
		if rawURL == "" {
			continue
		}
		parsed, err := url.Parse(rawURL)
		if err != nil || parsed.Scheme == "" || parsed.Host == "" {
			continue
		}
		parsed.Fragment = ""
		key := strings.ToLower(parsed.String())
		if seen[key] {
			continue
		}
		seen[key] = true
		candidate.URL = parsed.String()
		result = append(result, candidate)
	}
	return result
}

func (h *Hub) fetchAssetReferenceURLSource(rawURL string, provider string) (assetOnlineSource, error) {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return assetOnlineSource{}, err
	}
	provider = strings.TrimSpace(provider)
	if provider == "" {
		provider = "asset_master"
	}
	body, err := h.fetchAssetOnlineURL(parsed.String(), 512*1024)
	if err != nil {
		return assetOnlineSource{}, err
	}
	title := extractHTMLTitle(body)
	if title == "" {
		title = parsed.Host
	}
	pageText := extractAssetOnlinePageText(body)
	if scriptText := h.extractAssetProductScriptText(parsed, body); scriptText != "" {
		pageText = cleanOnlineText(pageText + " " + scriptText)
		if len([]rune(pageText)) > 18000 {
			pageText = string([]rune(pageText)[:18000])
		}
	}
	sourceType := classifyManualAssetSupportURL(parsed, title)
	confidence := 95
	snippet := firstNonEmpty(extractMetaDescription(body), "来自资产主档中手动填写的厂家资料页。")
	if sourceType != "official_support" && sourceType != "official_product" {
		confidence = 55
		snippet = firstNonEmpty(extractMetaDescription(body), "来自资产主档中手动填写的资料页，需确认是否为厂家官方来源。")
	}
	return assetOnlineSource{
		Provider:   provider,
		Type:       sourceType,
		Title:      title,
		URL:        parsed.String(),
		ImageURL:   absolutizeAssetOnlineURL(parsed, extractMetaImageURL(body)),
		Snippet:    snippet,
		Confidence: confidence,
		Text:       pageText,
	}, nil
}

func classifyManualAssetSupportURL(parsed *url.URL, title string) string {
	host := strings.TrimPrefix(strings.ToLower(parsed.Hostname()), "www.")
	lowerURL := strings.ToLower(parsed.String())
	lowerTitle := strings.ToLower(strings.TrimSpace(title))
	if assetOnlineLooksLowTrustManualReference(lowerURL + " " + lowerTitle) {
		return classifyAssetOnlineURL(parsed.String())
	}
	if isKnownOfficialAssetHost(host) {
		if strings.Contains(lowerURL, "product") || strings.Contains(lowerURL, "spec") || strings.Contains(lowerURL, "manual") {
			return "official_product"
		}
		return "official_support"
	}
	if assetOnlineTitleHasManualReferenceSignal(lowerTitle) {
		if strings.Contains(lowerURL, "product") || strings.Contains(lowerURL, "spec") || strings.Contains(lowerURL, "manual") {
			return "official_product"
		}
		return "official_support"
	}
	return classifyAssetOnlineURL(parsed.String())
}

func assetOnlineTitleHasManualReferenceSignal(lowerTitle string) bool {
	for _, marker := range []string{"官方", "官网", "official", "产品", "规格", "支持", "说明书", "驱动"} {
		if strings.Contains(lowerTitle, marker) {
			return true
		}
	}
	return false
}

func assetOnlineLooksLowTrustManualReference(text string) bool {
	for _, marker := range []string{
		"个人博客",
		"第三方",
		"普通网页",
		"普通博客",
		"评测",
		"论坛",
		"电商",
		"非官方",
		"blog",
		"review",
		"forum",
		"bbs",
		"mall",
		"shop",
		"store",
		"taobao",
		"jd.com",
	} {
		if strings.Contains(text, marker) {
			return true
		}
	}
	return false
}

func (h *Hub) extractAssetProductScriptText(base *url.URL, body string) string {
	scriptURLs := extractAssetProductScriptURLs(base, body)
	parts := make([]string, 0, len(scriptURLs))
	for _, scriptURL := range scriptURLs {
		js, err := h.fetchAssetOnlineURL(scriptURL, 1024*1024)
		if err != nil {
			continue
		}
		if text := extractAssetVueCompiledText(js); text != "" {
			parts = append(parts, text)
		}
		if len(parts) >= 2 {
			break
		}
	}
	return cleanOnlineText(strings.Join(parts, " "))
}

func extractAssetProductScriptURLs(base *url.URL, body string) []string {
	pattern := regexp.MustCompile(`(?is)<script[^>]+src=["']([^"']+)["'][^>]*>`)
	matches := pattern.FindAllStringSubmatch(body, -1)
	result := make([]string, 0, len(matches))
	for _, match := range matches {
		if len(match) < 2 {
			continue
		}
		raw := strings.TrimSpace(html.UnescapeString(match[1]))
		lower := strings.ToLower(raw)
		if !strings.Contains(lower, "/product/") && !strings.Contains(lower, "/spec") {
			continue
		}
		absolute := absolutizeAssetOnlineURL(base, raw)
		if absolute != "" {
			result = append(result, absolute)
		}
	}
	return dedupeStrings(result)
}

func extractAssetVueCompiledText(js string) string {
	pattern := regexp.MustCompile(`e\._v\("((?:\\.|[^"\\])*)"\)`)
	matches := pattern.FindAllStringSubmatch(js, -1)
	parts := make([]string, 0, len(matches))
	for _, match := range matches {
		if len(match) < 2 {
			continue
		}
		value, err := strconv.Unquote(`"` + match[1] + `"`)
		if err != nil {
			value = match[1]
		}
		value = cleanOnlineText(value)
		if value != "" {
			parts = append(parts, value)
		}
	}
	text := strings.Join(parts, "。 ")
	if len([]rune(text)) > 14000 {
		text = string([]rune(text)[:14000])
	}
	return cleanOnlineText(text)
}

func (h *Hub) fetchAssetOnlineURL(rawURL string, maxBytes int64) (string, error) {
	req, err := http.NewRequest(http.MethodGet, rawURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "text/html,application/json;q=0.9,*/*;q=0.8")
	req.Header.Set("User-Agent", "PulseAssetEnrichment/1.0")
	return h.doAssetOnlineRequest(req, maxBytes)
}

func (h *Hub) doAssetOnlineRequest(req *http.Request, maxBytes int64) (string, error) {
	client := &http.Client{Timeout: 6 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", http.ErrNotSupported
	}
	if contentType := strings.TrimSpace(resp.Header.Get("Content-Type")); contentType != "" && !isSupportedAssetOnlineContentType(contentType) {
		return "", errors.New("资料页类型不支持：" + contentType)
	}
	if maxBytes > 0 && resp.ContentLength > maxBytes {
		return "", errAssetOnlineResponseTooLarge
	}
	var reader io.Reader = resp.Body
	if maxBytes > 0 {
		reader = io.LimitReader(resp.Body, maxBytes+1)
	}
	body, err := io.ReadAll(reader)
	if err != nil {
		return "", err
	}
	if maxBytes > 0 && int64(len(body)) > maxBytes {
		return "", errAssetOnlineResponseTooLarge
	}
	return string(body), nil
}

func isSupportedAssetOnlineContentType(contentType string) bool {
	mediaType, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		mediaType = strings.TrimSpace(strings.Split(contentType, ";")[0])
	}
	mediaType = strings.ToLower(mediaType)
	if mediaType == "" {
		return true
	}
	if strings.HasPrefix(mediaType, "text/") {
		return true
	}
	switch mediaType {
	case "application/json", "application/ld+json", "application/javascript", "application/x-javascript", "application/ecmascript", "application/xhtml+xml":
		return true
	default:
		return strings.HasSuffix(mediaType, "+json")
	}
}

func (h *Hub) enrichAssetOnlineSources(sources []assetOnlineSource) []assetOnlineSource {
	for index := range sources {
		if sources[index].Text != "" || sources[index].URL == "" || !shouldFetchAssetOnlineSource(sources[index]) {
			continue
		}
		body, err := h.fetchAssetOnlineURL(sources[index].URL, 1024*1024)
		if err != nil {
			continue
		}
		if description := extractMetaDescription(body); description != "" && sources[index].Snippet == "" {
			sources[index].Snippet = description
		}
		if imageURL := extractMetaImageURL(body); imageURL != "" {
			if parsed, err := url.Parse(sources[index].URL); err == nil {
				sources[index].ImageURL = absolutizeAssetOnlineURL(parsed, imageURL)
			}
		}
		sources[index].Text = extractAssetOnlinePageText(body)
		if parsed, err := url.Parse(sources[index].URL); err == nil {
			if scriptText := h.extractAssetProductScriptText(parsed, body); scriptText != "" {
				sources[index].Text = cleanOnlineText(sources[index].Text + " " + scriptText)
				if len([]rune(sources[index].Text)) > 18000 {
					sources[index].Text = string([]rune(sources[index].Text)[:18000])
				}
			}
		}
		if title := extractHTMLTitle(body); title != "" {
			sources[index].Title = title
		}
	}
	return sources
}

func shouldFetchAssetOnlineSource(source assetOnlineSource) bool {
	if source.Type == "official_support" || source.Type == "official_product" {
		return true
	}
	lower := strings.ToLower(source.URL)
	return strings.Contains(lower, "devicespecifications") ||
		strings.Contains(lower, "kimovil") ||
		strings.Contains(lower, "gsmarena") ||
		strings.Contains(lower, "mi.com") ||
		strings.Contains(lower, "support") ||
		strings.Contains(lower, "spec") ||
		// 2026-10-11 参数 Agent：中文参数库/评测站白名单——参数页为服务端渲染静态表格，可抓到深度参数
		strings.Contains(lower, "detail.zol.com.cn") ||
		strings.Contains(lower, "zol.com.cn/article") ||
		strings.Contains(lower, "mydrivers.com") ||
		strings.Contains(lower, "quickmouse.cn") ||
		strings.Contains(lower, "notebookcheck") ||
		strings.Contains(lower, "minipc") ||
		strings.Contains(lower, "laptopmedia")
}

type assetOnlineSpecExtraction struct {
	Items   []assetOnlineSpecItem
	Summary string
	Sources []assetOnlineSource
}

type assetOnlineSpecItem struct {
	Field      string
	Label      string
	Value      string
	Notes      string
	Confidence int
	Sources    []assetOnlineSource
}

func extractAssetOnlineSpecs(asset *core.Record, sources []assetOnlineSource) assetOnlineSpecExtraction {
	textSources := make([]assetOnlineSource, 0, len(sources))
	for _, source := range sources {
		if strings.TrimSpace(source.Text+" "+source.Snippet+" "+source.Title) != "" {
			textSources = append(textSources, source)
		}
	}
	combined := cleanOnlineText(strings.Join(assetOnlineSourceTexts(textSources), " "))
	if combined == "" {
		return assetOnlineSpecExtraction{}
	}
	specs := assetOnlineSpecExtraction{Sources: textSources}
	add := func(field string, label string, value string, confidence int, notes string) {
		value = cleanOnlineSpecValue(value)
		if value == "" || containsSpecItem(specs.Items, field, value) {
			return
		}
		specs.Items = append(specs.Items, assetOnlineSpecItem{
			Field:      field,
			Label:      label,
			Value:      value,
			Notes:      notes,
			Confidence: confidence,
			Sources:    textSources,
		})
	}

	if value := firstRegexCapture(combined, `(?i)\b(Wi[- ]?Fi\s*(?:4|5|6E?|7|802\.11[a-z/]+))\b`); value != "" {
		add("wifi_standard", "无线标准", value, 66, "联网资料提取到的无线规格。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(Bluetooth\s*\d(?:\.\d)?)\b`); value != "" {
		add("bluetooth_version", "蓝牙版本", value, 64, "联网资料提取到的蓝牙规格。")
	}
	if value := firstRegexCapture(combined, `(?:蓝牙|Bluetooth)\s*(\d(?:\.\d)?)`); value != "" {
		add("bluetooth_version", "蓝牙版本", "Bluetooth "+value, 64, "联网资料提取到的蓝牙规格。")
	}
	if value := firstRegexCapture(combined, `(?i)\b((?:MediaTek\s*)?Dimensity\s*\d{3,5}|Snapdragon\s*\d(?:\s*\w+)?|Apple\s*A\d{1,2}|Exynos\s*\d{3,5})\b`); value != "" {
		add("cpu_model", "芯片 / SoC", value, 72, "联网资料提取到的 SoC 线索。")
	}
	if value := firstRegexCapture(combined, `(天玑\s*\d{3,5}|骁龙\s*\d(?:\s*\w+)?|麒麟\s*\d{3,5})`); value != "" {
		add("cpu_model", "芯片 / SoC", value, 72, "联网资料提取到的 SoC 线索。")
	}
	if value := inferCPUVendorFromSpecs(combined); value != "" {
		add("cpu_vendor", "芯片厂商", value, 58, "联网资料提取到的芯片厂商线索。")
	}
	if value := firstRegexCapture(combined, `(?:工艺制程[:：]?\s*)?((?:台积电|TSMC)?\s*\d+\s*nm)`); value != "" {
		add("cpu_process", "制程 / 架构", value, 58, "联网资料提取到的芯片制程线索。")
	}
	if value := firstRegexCapture(combined, `CPU架构[:：]?\s*([^。；,，]{0,80}(?:Cortex|A78|A55|X\d)[^。；,，]{0,80})`); value != "" {
		add("cpu_architecture", "CPU 架构", value, 58, "联网资料提取到的 CPU 架构线索。")
	}
	if value := firstRegexCapture(combined, `(八核处理器|六核处理器|四核处理器|十核处理器|\d+\s*核处理器|\d+\s*cores?)`); value != "" {
		add("cpu_cores", "CPU 核心", value, 56, "联网资料提取到的 CPU 核心数线索。")
	}
	if value := firstRegexCapture(combined, `(?i)(?:最高主频可达|最高频率|up to)\s*([\d.]+\s*GHz)`); value != "" {
		add("cpu_frequency", "CPU 频率", value, 56, "联网资料提取到的 CPU 频率线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(Mali[- ]?[A-Za-z0-9]+|Adreno\s*\d{3,4}|Apple\s*GPU|Immortalis[- ]?[A-Za-z0-9]+)\b`); value != "" {
		add("gpu_model", "GPU", value, 58, "联网资料提取到的 GPU 线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b((?:Mali[- ]?[A-Za-z0-9]+|Adreno\s*\d{3,4})[^。；,，]{0,24}(?:六核|四核|core|cores))`); value != "" {
		add("gpu_detail", "GPU 详情", value, 56, "联网资料提取到的 GPU 详情线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(\d+(?:\.\d+)?\s*(?:inch|英寸)[^。；,，]{0,32}(?:OLED|AMOLED|LCD|屏|display|screen)?)`); value != "" {
		add("screen_size", "屏幕 / 尺寸", value, 68, "联网资料提取到的屏幕规格。")
	}
	if value := firstRegexCapture(combined, `尺寸[:：]?\s*(\d+(?:\.\d+)?\s*英寸)`); value != "" {
		add("screen_size", "屏幕 / 尺寸", value, 68, "联网资料提取到的屏幕尺寸。")
	}
	if value := firstRegexCapture(combined, `(2K[^。；,，]{0,24}(?:直屏|屏幕|屏))`); value != "" {
		add("screen_size", "屏幕 / 尺寸", value, 68, "联网资料提取到的屏幕规格。")
	}
	if value := extractDisplayTypeSpec(combined, asset.GetString("type")); value != "" {
		add("display_type", "屏幕类型", value, 58, "联网资料提取到的屏幕面板类型。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(\d{3,4}\s*x\s*\d{3,4}\s*(?:pixels|px|像素)?)\b`); value != "" {
		add("display_resolution", "屏幕分辨率", value, 62, "联网资料提取到的屏幕分辨率线索。")
	}
	if value := firstRegexCapture(combined, `分辨率[:：]?\s*(\d{3,4}\s*[*xX]\s*\d{3,4}(?:（2K）|\(2K\)|\s*2K)?)`); value != "" {
		add("display_resolution", "屏幕分辨率", value, 62, "联网资料提取到的屏幕分辨率线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(\d{2,3}\s*Hz)\s*(?:刷新率|refresh|screen|display|屏)`); value != "" {
		add("screen_refresh_rate", "屏幕刷新率", value, 62, "联网资料提取到的刷新率线索。")
	}
	if value := firstRegexCapture(combined, `(?:显示帧率|刷新率)[:：]?\s*(?:最高\s*)?(\d{2,3}\s*Hz)`); value != "" {
		add("screen_refresh_rate", "屏幕刷新率", value, 62, "联网资料提取到的刷新率线索。")
	}
	if value := firstRegexCapture(combined, `触控采样率[:：]?\s*(?:最高\s*)?(\d{2,4}\s*Hz)`); value != "" {
		add("touch_sampling_rate", "触控采样率", value, 58, "联网资料提取到的触控采样率线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(\d{3,4}\s*nits?)\b`); value != "" {
		add("display_brightness", "屏幕亮度", value, 56, "联网资料提取到的屏幕亮度线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b((?:8|10|12)\s*bit[^。；,，]{0,40}(?:DCI-P3|P3|色彩)|DCI-P3[^。；,，]{0,32})`); value != "" {
		add("display_color_depth", "色深 / 色彩", value, 54, "联网资料提取到的显示色彩线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(HDR10(?:/10\+)?[^。；,，]{0,40}|Dolby Vision|杜比视界)`); value != "" {
		add("hdr_support", "HDR", value, 54, "联网资料提取到的 HDR 线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(Corning\s+Gorilla\s+Glass[^。；,，]{0,32}|Gorilla\s+Glass[^。；,，]{0,32})`); value != "" {
		add("display_protection", "屏幕保护", value, 54, "联网资料提取到的屏幕保护玻璃线索。")
	}
	if value := firstRegexCapture(combined, `(康宁[^。；,，]{0,32}玻璃[^。；,，]{0,32}|Victus[^。；,，]{0,24})`); value != "" {
		add("display_protection", "屏幕保护", value, 54, "联网资料提取到的屏幕保护玻璃线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(\d{3,5}\s*mAh)\b`); value != "" {
		add("battery_capacity_mah", "电池容量", value, 70, "联网资料提取到的电池容量。")
	}
	if value := firstRegexCapture(combined, `(锂离子电池|锂聚合物电池|双电芯|single-cell|dual-cell|Li-Po|Li-Ion)`); value != "" {
		add("battery_type", "电池类型", value, 54, "联网资料提取到的电池类型线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(\d{2,3}\s*W)\s*(?:快充|charging|charge|充电)`); value != "" {
		add("charging_power_w", "充电功率", value, 67, "联网资料提取到的充电规格。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(\d{1,3}\s*W\s*(?:wireless charging|无线充电)|wireless charging|无线充电)\b`); value != "" {
		add("wireless_charging", "无线充电", value, 52, "联网资料提取到的无线充电线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b((?:\d{1,3}\s*MP|[一二三四五六七八九十百千万0-9]+\s*万像素)[^。；]{0,40}(?:camera|摄像|相机|主摄))`); value != "" {
		add("camera_summary", "摄像头摘要", value, 62, "联网资料提取到的摄像头线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b((?:rear|后置)[^。；,，]{0,80}(?:camera|摄像|相机|MP|万像素))`); value != "" {
		add("rear_camera_detail", "后置影像", value, 58, "联网资料提取到的后置影像线索。")
	}
	if value := firstRegexCapture(combined, `(4800\s*万像素主摄[^。；]{0,120}|主摄[:：]\s*[^。；]{0,120})`); value != "" {
		add("rear_main_camera", "主摄", value, 58, "联网资料提取到的主摄规格线索。")
	}
	if value := firstRegexCapture(combined, `(800\s*万\s*像素超广角镜头[^。；]{0,80}|超广角镜头[:：]?\s*[^。；]{0,80})`); value != "" {
		add("rear_ultrawide_camera", "超广角", value, 56, "联网资料提取到的超广角规格线索。")
	}
	if value := firstRegexCapture(combined, `(200\s*万\s*像素微距镜头[^。；]{0,80}|微距镜头[:：]?\s*[^。；]{0,80})`); value != "" {
		add("rear_macro_camera", "微距", value, 54, "联网资料提取到的微距规格线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b((?:front|前置)[^。；,，]{0,80}(?:camera|摄像|相机|MP|万像素))`); value != "" {
		add("front_camera_detail", "前置影像", value, 58, "联网资料提取到的前置影像线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(4K[^。；,，]{0,32}(?:video|视频|recording)|1080p[^。；,，]{0,32}(?:video|视频|recording))`); value != "" {
		add("video_recording", "视频规格", value, 52, "联网资料提取到的视频规格线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(\d+\s*GB\s*(?:RAM|内存))\b`); value != "" {
		add("memory_detail", "内存规格", value, 60, "联网资料提取到的内存容量线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(\d+\s*GB\s*(?:ROM|storage|存储))\b`); value != "" {
		add("storage_gb", "存储 GB", value, 58, "联网资料提取到的存储容量线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(UFS\s*\d(?:\.\d)?|NVMe|eMMC\s*\d(?:\.\d)?)\b`); value != "" {
		add("storage_detail", "存储规格", value, 56, "联网资料提取到的存储规格线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(LPDDR\dX?|LPDDR\d)\b`); value != "" {
		add("memory_type", "内存类型", value, 54, "联网资料提取到的内存类型线索。")
	}
	if value := firstRegexCapture(combined, `\b(\d{2,4}(?:\.\d+)?(?:\s+g|克))\b`); value != "" {
		add("weight", "重量", value, 56, "联网资料提取到的重量线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?\s*mm)\b`); value != "" {
		add("dimensions", "机身尺寸", value, 56, "联网资料提取到的尺寸线索。")
	}
	if value := extractMobileNetworkSpec(combined); value != "" {
		add("mobile_network", "蜂窝网络", value, 54, "联网资料提取到的网络制式线索。")
	}
	if value := firstRegexCapture(combined, `\b((?:Nano-)?SIM(?:\s*卡| card| slot| tray| 双卡| 单卡)?[^。；,，]{0,48}|双卡[^。；,，]{0,24}|SIM卡[^。；,，]{0,24})`); value != "" {
		add("sim_detail", "SIM / 卡槽", value, 54, "联网资料提取到的 SIM 或卡槽线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(GPS(?:\s+(?:GLONASS|Galileo|BeiDou|北斗))*)\b`); value != "" {
		add("positioning", "定位系统", value, 52, "联网资料提取到的定位系统线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(USB[- ]?C[^。；,，]{0,32}|USB\s*Type[- ]?C[^。；,，]{0,32})`); value != "" {
		add("usb_detail", "USB / 接口", value, 54, "联网资料提取到的接口线索。")
	}
	if strings.Contains(strings.ToLower(combined), "nfc") || strings.Contains(combined, "多功能NFC") {
		add("nfc", "NFC", "支持 NFC", 54, "联网资料提取到的 NFC 线索。")
	}
	if strings.Contains(combined, "红外") || strings.Contains(strings.ToLower(combined), "infrared") {
		add("infrared", "红外", "支持红外", 54, "联网资料提取到的红外线索。")
	}
	if value := firstRegexCapture(combined, `(?i)\b(IP\d{2})\b`); value != "" {
		add("water_resistance", "防尘防水", value, 52, "联网资料提取到的防尘防水等级线索。")
	}
	if value := firstRegexCapture(combined, `(立体声双扬声器|双扬声器|stereo speakers?|Hi-Res[^。；,，]{0,24})`); value != "" {
		add("speaker_detail", "扬声器 / 音频", value, 50, "联网资料提取到的音频规格线索。")
	}
	if value := firstRegexCapture(combined, `(Hi-Res[^。；]{0,80}|杜比全景声|Dolby Atmos[^。；,，]{0,32})`); value != "" {
		add("audio_detail", "音频详情", value, 50, "联网资料提取到的音频认证或音效线索。")
	}
	if strings.Contains(combined, "OIS光学防抖") || strings.Contains(strings.ToLower(combined), "ois") {
		add("image_stabilization", "防抖 / 对焦", "OIS 光学防抖", 52, "联网资料提取到的影像防抖线索。")
	}
	if value := firstRegexCapture(combined, `(VC\s*液冷散热|液冷散热[^。；,，]{0,24}|均热板[^。；,，]{0,24})`); value != "" {
		add("cooling_system", "散热", value, 50, "联网资料提取到的散热结构线索。")
	}
	if value := firstRegexCapture(combined, `(指纹识别|屏下指纹|侧边指纹|陀螺仪|距离传感器|环境光传感器|加速度传感器)[^。；,，]{0,48}`); value != "" {
		add("sensor_detail", "传感器", value, 50, "联网资料提取到的传感器线索。")
	}

	specs.Summary = buildOnlineSpecsSummary(specs.Items)
	return specs
}

func containsSpecItem(items []assetOnlineSpecItem, field string, value string) bool {
	for _, item := range items {
		if item.Field == field || sameSuggestionValue(item.Value, value) {
			return true
		}
	}
	return false
}

func buildOnlineSpecsSummary(items []assetOnlineSpecItem) string {
	if len(items) == 0 {
		return ""
	}
	parts := make([]string, 0, len(items))
	for _, item := range items {
		parts = append(parts, item.Label+"："+item.Value)
		if len(parts) >= 10 {
			break
		}
	}
	return strings.Join(parts, "\n")
}

func extractHTMLTitle(body string) string {
	matches := regexp.MustCompile(`(?is)<title[^>]*>(.*?)</title>`).FindStringSubmatch(body)
	if len(matches) < 2 {
		return ""
	}
	return cleanHTMLFragment(matches[1])
}

func extractMetaDescription(body string) string {
	patterns := []*regexp.Regexp{
		regexp.MustCompile(`(?is)<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>`),
		regexp.MustCompile(`(?is)<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>`),
		regexp.MustCompile(`(?is)<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>`),
		regexp.MustCompile(`(?is)<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["'][^>]*>`),
	}
	for _, pattern := range patterns {
		matches := pattern.FindStringSubmatch(body)
		if len(matches) >= 2 {
			if value := cleanHTMLFragment(matches[1]); value != "" {
				return value
			}
		}
	}
	return ""
}

func extractMetaImageURL(body string) string {
	patterns := []*regexp.Regexp{
		regexp.MustCompile(`(?is)<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>`),
		regexp.MustCompile(`(?is)<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>`),
		regexp.MustCompile(`(?is)<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>`),
		regexp.MustCompile(`(?is)<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["'][^>]*>`),
		regexp.MustCompile(`(?is)<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["'][^>]*>`),
	}
	for _, pattern := range patterns {
		matches := pattern.FindStringSubmatch(body)
		if len(matches) >= 2 {
			if value := strings.TrimSpace(html.UnescapeString(matches[1])); value != "" {
				return value
			}
		}
	}
	return ""
}

func splitAssetImageCandidates(raw string) []string {
	raw = html.UnescapeString(strings.TrimSpace(raw))
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		value := strings.TrimSpace(part)
		if value == "" {
			continue
		}
		fields := strings.Fields(value)
		if len(fields) > 0 {
			value = fields[0]
		}
		if value != "" {
			result = append(result, value)
		}
	}
	return result
}

func absolutizeAssetOnlineURL(base *url.URL, raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	return base.ResolveReference(parsed).String()
}

func extractAssetOnlinePageText(body string) string {
	body = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>`).ReplaceAllString(body, " ")
	body = regexp.MustCompile(`(?is)<style[^>]*>.*?</style>`).ReplaceAllString(body, " ")
	body = regexp.MustCompile(`(?is)<noscript[^>]*>.*?</noscript>`).ReplaceAllString(body, " ")
	text := cleanHTMLFragment(body)
	if len([]rune(text)) > 12000 {
		return string([]rune(text)[:12000])
	}
	return text
}

func cleanHTMLFragment(value string) string {
	value = regexp.MustCompile(`(?is)<[^>]+>`).ReplaceAllString(value, " ")
	return cleanOnlineText(html.UnescapeString(value))
}

func cleanOnlineText(value string) string {
	value = strings.TrimSpace(value)
	value = regexp.MustCompile(`\s+`).ReplaceAllString(value, " ")
	return value
}

func cleanOnlineSpecValue(value string) string {
	value = cleanOnlineText(value)
	value = strings.ReplaceAll(value, "｜", " / ")
	value = strings.ReplaceAll(value, "丨", " / ")
	value = regexp.MustCompile(`(?i)(台积电|TSMC)\s*(\d+\s*nm)`).ReplaceAllString(value, "$1 $2")
	value = regexp.MustCompile(`(?i)\b(\d{3,5})\s*mAh\b`).ReplaceAllString(value, "$1 mAh")
	value = regexp.MustCompile(`(?i)\b(\d{2,3})\s*Hz\b`).ReplaceAllString(value, "$1 Hz")
	return value
}

func inferCPUVendorFromSpecs(value string) string {
	lower := strings.ToLower(value)
	switch {
	case strings.Contains(lower, "mediatek") || strings.Contains(value, "天玑"):
		return "MediaTek"
	case strings.Contains(lower, "qualcomm") || strings.Contains(lower, "snapdragon") || strings.Contains(value, "骁龙"):
		return "Qualcomm"
	case strings.Contains(lower, "apple a") || strings.Contains(lower, "apple m"):
		return "Apple"
	case strings.Contains(lower, "exynos"):
		return "Samsung"
	default:
		return ""
	}
}

func firstRegexCapture(value string, pattern string) string {
	matches := regexp.MustCompile(pattern).FindStringSubmatch(value)
	if len(matches) < 2 {
		return ""
	}
	return cleanOnlineText(matches[1])
}

func extractMobileNetworkSpec(value string) string {
	lower := strings.ToLower(value)
	parts := make([]string, 0, 4)
	if strings.Contains(lower, "wi-fi only") || strings.Contains(lower, "wifi only") {
		return "Wi-Fi only"
	}
	if regexp.MustCompile(`\b5G\b`).MatchString(value) {
		parts = append(parts, "5G")
	}
	if regexp.MustCompile(`(?i)\b(?:4G\s*)?LTE\b`).MatchString(value) {
		parts = append(parts, "LTE")
	}
	if strings.Contains(value, "全网通") {
		parts = append(parts, "全网通")
	}
	if len(parts) == 0 {
		return ""
	}
	return strings.Join(dedupeStrings(parts), " / ")
}

func extractDisplayTypeSpec(value string, assetType string) string {
	candidates := []string{"AMOLED", "OLED", "LTPO", "LCD", "IPS", "E-Ink", "E Ink"}
	if assetType != "phone" && assetType != "tablet" && assetType != "wearable" && assetType != "handheld" {
		candidates = append(candidates, "Mini-LED", "Mini LED")
	}
	lower := strings.ToLower(value)
	for _, candidate := range candidates {
		if strings.Contains(lower, strings.ToLower(candidate)) {
			return candidate
		}
	}
	return ""
}

func dedupeStrings(values []string) []string {
	seen := map[string]bool{}
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	return result
}
