// This file was created by mechanically splitting internal/hub/asset_enrichment_online.go.
// All declarations below were moved verbatim from that file; there is no behavior change.
// Theme: online source classification, filtering and ranking.

package hub

import (
	"net/url"
	"regexp"
	"sort"
	"strings"
	"unicode"

	"github.com/pocketbase/pocketbase/core"
)

func assetAIFieldRequiresOfficialSource(field string) bool {
	switch strings.TrimSpace(field) {
	case "colors_available", "official_colors", "official_image_url", "support_url", "product_url", "official_url":
		return true
	default:
		return false
	}
}

func assetOnlineSourcesHaveOfficialAuthority(sources []assetOnlineSource) bool {
	for _, source := range sources {
		if assetOnlineSourceHasOfficialAuthority(source) {
			return true
		}
	}
	return false
}

func assetOfficialImageSuggestionValueAllowed(value string, sources []assetOnlineSource) bool {
	if !isLikelyImageURL(value) {
		return false
	}
	if classifyAssetOnlineURL(value) == "official_image" {
		return true
	}
	normalizedValue := normalizeAssetOnlineURLForComparison(value)
	for _, source := range sources {
		if !assetOnlineSourceHasOfficialAuthority(source) {
			continue
		}
		for _, candidate := range []string{source.ImageURL, source.URL} {
			if isLikelyImageURL(candidate) && normalizeAssetOnlineURLForComparison(candidate) == normalizedValue {
				return true
			}
		}
	}
	return false
}

func normalizeAssetOnlineURLForComparison(rawURL string) string {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return ""
	}
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return strings.ToLower(rawURL)
	}
	parsed.Fragment = ""
	parsed.Host = strings.ToLower(parsed.Host)
	parsed.Scheme = strings.ToLower(parsed.Scheme)
	return strings.ToLower(parsed.String())
}

func normalizeAssetOnlineAISourceURLs(urls []string) []string {
	result := make([]string, 0, len(urls))
	seen := map[string]bool{}
	for _, rawURL := range urls {
		rawURL = strings.TrimSpace(rawURL)
		if rawURL == "" {
			continue
		}
		parsed, err := url.Parse(rawURL)
		if err != nil || parsed.Scheme == "" || parsed.Host == "" {
			continue
		}
		if parsed.Scheme != "http" && parsed.Scheme != "https" {
			continue
		}
		parsed.Fragment = ""
		normalized := parsed.String()
		key := strings.ToLower(normalized)
		if seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, normalized)
	}
	return result
}

func capAssetAISuggestionConfidenceBySourceQuality(confidence int, sources []assetOnlineSource) int {
	if len(sources) == 0 {
		return 0
	}
	best := 0
	for _, source := range sources {
		capValue := 68
		switch source.Type {
		case "official_support", "official_product", "official_image":
			capValue = 96
		case "spec_database", "structured_profile":
			capValue = 82
		case "web_result":
			capValue = 70
		}
		if capValue > best {
			best = capValue
		}
	}
	if confidence > best {
		return best
	}
	if confidence <= 0 {
		return 50
	}
	return confidence
}

func assetAISuggestionsVariantConflict(asset *core.Record, suggestions []struct {
	Field      string   `json:"field"`
	Label      string   `json:"label"`
	Value      string   `json:"value"`
	Confidence int      `json:"confidence"`
	Notes      string   `json:"notes"`
	SourceURLs []string `json:"source_urls"`
}) bool {
	currentCPU := strings.ToLower(recordMetadataString(asset, "cpu_model"))
	if currentCPU == "" {
		return false
	}
	currentFamily := chipsetFamily(currentCPU)
	if currentFamily == "" {
		return false
	}
	for _, item := range suggestions {
		if strings.TrimSpace(item.Field) != "cpu_model" {
			continue
		}
		suggestedFamily := chipsetFamily(strings.ToLower(item.Value))
		if suggestedFamily != "" && suggestedFamily != currentFamily {
			return true
		}
	}
	return false
}

func chipsetFamily(value string) string {
	switch {
	case strings.Contains(value, "dimensity") || strings.Contains(value, "天玑") || strings.Contains(value, "mediatek"):
		return "mediatek-dimensity"
	case strings.Contains(value, "snapdragon") || strings.Contains(value, "骁龙") || strings.Contains(value, "qualcomm"):
		return "qualcomm-snapdragon"
	case strings.Contains(value, "apple a") || strings.Contains(value, "apple m"):
		return "apple-silicon"
	default:
		return ""
	}
}

func (h *Hub) assetOnlineSourcesFromAIURLs(asset *core.Record, urls []string) []assetOnlineSource {
	urls = normalizeAssetOnlineAISourceURLs(urls)
	result := make([]assetOnlineSource, 0, len(urls))
	for _, rawURL := range urls {
		rawURL = strings.TrimSpace(rawURL)
		if rawURL == "" {
			continue
		}
		source := assetOnlineSource{
			Provider:   "asset_agent",
			Type:       classifyAssetOnlineURL(rawURL),
			Title:      rawURL,
			URL:        rawURL,
			Snippet:    "资料补全 Agent 返回的可追溯来源。",
			Confidence: 68,
		}
		if isLikelyImageURL(rawURL) {
			source.ImageURL = rawURL
			if source.Type == "official_image" {
				source.Confidence = 86
			}
			result = append(result, source)
			continue
		}
		body, err := h.fetchAssetOnlineURL(rawURL, 512*1024)
		if err != nil {
			continue
		}
		title := extractHTMLTitle(body)
		if title != "" {
			source.Title = title
		}
		if parsed, err := url.Parse(rawURL); err == nil {
			source.Type = classifyFetchedAssetOnlineAIURL(parsed, source.Title)
		}
		source.Snippet = firstNonEmpty(extractMetaDescription(body), source.Snippet)
		if imageURL := extractMetaImageURL(body); imageURL != "" {
			if parsed, err := url.Parse(rawURL); err == nil {
				source.ImageURL = absolutizeAssetOnlineURL(parsed, imageURL)
			}
		}
		source.Text = extractAssetOnlinePageText(body)
		if parsed, err := url.Parse(rawURL); err == nil {
			if scriptText := h.extractAssetProductScriptText(parsed, body); scriptText != "" {
				source.Text = cleanOnlineText(source.Text + " " + scriptText)
				if len([]rune(source.Text)) > 18000 {
					source.Text = string([]rune(source.Text)[:18000])
				}
			}
		}
		if assetOnlineSourceVariantConflicts(asset, source) {
			continue
		}
		result = append(result, source)
	}
	return dedupeAssetOnlineSources(result)
}

func classifyFetchedAssetOnlineAIURL(parsed *url.URL, title string) string {
	sourceType := classifyAssetOnlineURL(parsed.String())
	if sourceType != "web_result" {
		return sourceType
	}
	host := strings.ToLower(strings.TrimSpace(parsed.Hostname()))
	if !isLocalAssetOnlineHost(host) {
		return sourceType
	}
	lowerTitle := strings.ToLower(strings.TrimSpace(title))
	if !assetOnlineTitleHasStrongOfficialSignal(lowerTitle) {
		return sourceType
	}
	lowerURL := strings.ToLower(parsed.String())
	if strings.Contains(lowerURL, "product") || strings.Contains(lowerURL, "spec") || strings.Contains(lowerURL, "manual") {
		return "official_product"
	}
	return "official_support"
}

func assetOnlineTitleHasStrongOfficialSignal(lowerTitle string) bool {
	for _, marker := range []string{"官方", "官网", "official"} {
		if strings.Contains(lowerTitle, marker) {
			return true
		}
	}
	return false
}

func isLocalAssetOnlineHost(host string) bool {
	host = strings.Trim(strings.ToLower(strings.TrimSpace(host)), "[]")
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}

func filterAssetOnlineSourcesByURLs(sources []assetOnlineSource, urls []string) []assetOnlineSource {
	if len(urls) == 0 {
		return nil
	}
	wanted := map[string]bool{}
	for _, rawURL := range urls {
		rawURL = strings.TrimSpace(strings.ToLower(rawURL))
		if rawURL != "" {
			wanted[rawURL] = true
		}
	}
	result := make([]assetOnlineSource, 0, len(sources))
	for _, source := range sources {
		if wanted[strings.ToLower(strings.TrimSpace(source.URL))] {
			result = append(result, source)
		}
	}
	return result
}

func buildAssetOnlineSearchQuery(asset *core.Record) string {
	parts := nonEmptyStrings(
		asset.GetString("vendor"),
		asset.GetString("model"),
		recordMetadataString(asset, "internal_model"),
	)
	if len(parts) == 0 {
		parts = append(parts, firstNonEmpty(asset.GetString("name"), asset.GetString("serial_number")))
	}
	if len(parts) == 0 {
		return ""
	}
	typeHint := asset.GetString("type")
	keywords := []string{"官方", "支持", "规格"}
	switch typeHint {
	case "phone", "tablet", "wearable", "handheld", "ereader":
		keywords = append(keywords, "参数")
	case "router", "switch", "ap", "gateway", "ont", "firewall":
		keywords = append(keywords, "固件", "说明书")
	case "physical_host", "nas", "server", "mini_pc", "vm":
		keywords = append(keywords, "驱动", "BIOS")
	}
	return strings.Join(append(parts, keywords...), " ")
}

func assetOnlineSourceHasOfficialAuthority(source assetOnlineSource) bool {
	switch source.Type {
	case "official_support", "official_product", "official_image":
		return true
	default:
		return false
	}
}

func rankAssetOnlineSources(sources []assetOnlineSource, asset *core.Record) []assetOnlineSource {
	for index := range sources {
		sources[index].Confidence += vendorDomainBonus(asset.GetString("vendor"), sources[index].URL)
		sources[index].Confidence += sourceTypeBonus(sources[index].Type)
		if sources[index].Confidence > 98 {
			sources[index].Confidence = 98
		}
	}
	sort.SliceStable(sources, func(i, j int) bool {
		return sources[i].Confidence > sources[j].Confidence
	})
	return sources
}

func filterAssetOnlineSourcesByVariant(sources []assetOnlineSource, asset *core.Record) []assetOnlineSource {
	result := make([]assetOnlineSource, 0, len(sources))
	for _, source := range sources {
		if source.Provider != "support_url" && assetOnlineSourceVariantConflicts(asset, source) {
			continue
		}
		result = append(result, source)
	}
	return result
}

func assetOnlineSourceVariantConflicts(asset *core.Record, source assetOnlineSource) bool {
	expected := strings.ToLower(strings.Join(nonEmptyStrings(
		asset.GetString("name"),
		asset.GetString("model"),
		recordMetadataString(asset, "internal_model"),
	), " "))
	if expected == "" {
		return false
	}
	text := strings.ToLower(source.Title + " " + source.Snippet + " " + source.URL)
	variants := []string{"ultra", "gaming", "game edition", "extreme", "pro", "至尊", "电竞", "冠军"}
	for _, variant := range variants {
		if assetOnlineTextHasVariant(text, variant) && !assetOnlineTextHasVariant(expected, variant) {
			return true
		}
	}
	return false
}

func assetOnlineTextHasVariant(text string, variant string) bool {
	text = strings.ToLower(strings.TrimSpace(text))
	variant = strings.ToLower(strings.TrimSpace(variant))
	if text == "" || variant == "" {
		return false
	}
	if hasChineseRune(variant) {
		return strings.Contains(text, variant)
	}
	pattern := regexp.MustCompile(`(^|[^a-z0-9])` + regexp.QuoteMeta(variant) + `([^a-z0-9]|$)`)
	return pattern.MatchString(text)
}

func hasChineseRune(value string) bool {
	for _, r := range value {
		if unicode.Is(unicode.Han, r) {
			return true
		}
	}
	return false
}

func dedupeAssetOnlineSources(sources []assetOnlineSource) []assetOnlineSource {
	seen := map[string]bool{}
	result := make([]assetOnlineSource, 0, len(sources))
	for _, source := range sources {
		source.URL = strings.TrimSpace(source.URL)
		source.Title = cleanOnlineText(source.Title)
		source.Snippet = cleanOnlineText(source.Snippet)
		if source.URL == "" || source.Title == "" {
			continue
		}
		key := strings.ToLower(source.URL)
		if seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, source)
	}
	return result
}

func appendProvider(providers []string, provider string) []string {
	provider = strings.TrimSpace(provider)
	if provider == "" {
		return providers
	}
	for _, existing := range providers {
		if existing == provider {
			return providers
		}
	}
	return append(providers, provider)
}

func classifyAssetOnlineURL(rawURL string) string {
	lower := strings.ToLower(strings.TrimSpace(rawURL))
	parsed, err := url.Parse(lower)
	host := ""
	if err == nil {
		host = strings.TrimPrefix(parsed.Hostname(), "www.")
	}
	switch {
	case strings.Contains(lower, "devicespecifications") || strings.Contains(lower, "kimovil") || strings.Contains(lower, "gsmarena"):
		return "spec_database"
	case isKnownOfficialAssetHost(host) && isLikelyImageURL(lower):
		return "official_image"
	case isKnownOfficialAssetHost(host) && (strings.Contains(lower, "support") || strings.Contains(lower, "download") || strings.Contains(lower, "driver")):
		return "official_support"
	case isKnownOfficialAssetHost(host) && (strings.Contains(lower, "product") || strings.Contains(lower, "spec") || strings.Contains(lower, "manual")):
		return "official_product"
	default:
		return "web_result"
	}
}

func isKnownOfficialAssetHost(host string) bool {
	host = strings.ToLower(strings.TrimSpace(host))
	if host == "" {
		return false
	}
	officialMarkers := []string{
		"mi.com",
		"mi-img.com",
		"mifile.cn",
		"xiaomi.com",
		"redmi.com",
		"apple.com",
		"samsung.com",
		"lenovo.com",
		"asus.com",
		"tp-link.com",
		"tplinkcloud.com",
		"synology.com",
		"qnap.com",
		"unraid.net",
		"fnos.com",
		"huawei.com",
		"honor.com",
		"oppo.com",
		"vivo.com",
		"iqoo.com",
		"oneplus.com",
		"realme.com",
		"sony.com",
		"dell.com",
		"hp.com",
		"acer.com",
		"msi.com",
		"intel.com",
		"amd.com",
		"nvidia.com",
		"nintendo.com",
		"playstation.com",
		"xbox.com",
		"aqara.com",
		"yeelight.com",
		"roborock.com",
		"ecovacs.com",
		"philips-hue.com",
		"ikea.com",
	}
	for _, marker := range officialMarkers {
		if host == marker || strings.HasSuffix(host, "."+marker) {
			return true
		}
	}
	return false
}

func sourceTypeBonus(sourceType string) int {
	switch sourceType {
	case "official_support":
		return 22
	case "official_image":
		return 20
	case "official_product":
		return 18
	case "spec_database":
		return 3
	case "structured_profile":
		return 5
	default:
		return -4
	}
}

func vendorDomainBonus(vendor string, rawURL string) int {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || parsed.Host == "" {
		return 0
	}
	vendorText := strings.ToLower(vendor)
	host := strings.ToLower(parsed.Host)
	if (strings.Contains(vendorText, "xiaomi") || strings.Contains(vendorText, "redmi") || strings.Contains(vendorText, "小米")) &&
		(strings.Contains(host, "mi.com") || strings.Contains(host, "xiaomi.com") || strings.Contains(host, "redmi.com")) {
		return 8
	}
	officialHosts := []string{"apple.com", "samsung.com", "lenovo.com", "asus.com", "tp-link.com", "synology.com"}
	for _, officialHost := range officialHosts {
		if strings.Contains(host, officialHost) {
			return 8
		}
	}
	if strings.Contains(vendorText, "qnap") && strings.Contains(host, "qnap.com") {
		return 8
	}
	if strings.Contains(vendorText, "unraid") && strings.Contains(host, "unraid.net") {
		return 8
	}
	return 0
}

func assetSourceLooksRelevant(query string, text string) bool {
	queryTokens := assetSearchTokens(query)
	if len(queryTokens) == 0 {
		return false
	}
	normalized := strings.ToLower(text)
	matched := 0
	matchedNumeric := false
	hasNumeric := false
	for _, token := range queryTokens {
		tokenHasNumeric := regexp.MustCompile(`\d`).MatchString(token)
		hasNumeric = hasNumeric || tokenHasNumeric
		if strings.Contains(normalized, strings.ToLower(token)) {
			matched++
			matchedNumeric = matchedNumeric || tokenHasNumeric
		}
	}
	if hasNumeric && !matchedNumeric {
		return false
	}
	return matched > 0
}

func assetSearchTokens(query string) []string {
	raw := strings.FieldsFunc(strings.ToLower(query), func(r rune) bool {
		return unicode.IsSpace(r) || r == '/' || r == '\\' || r == '|' || r == ',' || r == ';'
	})
	stopWords := map[string]bool{"官方": true, "支持": true, "规格": true, "参数": true, "驱动": true, "固件": true, "说明书": true, "bios": true}
	tokens := make([]string, 0, len(raw))
	for _, token := range raw {
		token = strings.Trim(token, `"'()（）[]【】`)
		if len([]rune(token)) < 2 || stopWords[token] {
			continue
		}
		tokens = append(tokens, token)
	}
	return tokens
}

func assetOnlineSourceTexts(sources []assetOnlineSource) []string {
	values := make([]string, 0, len(sources)*4)
	for _, source := range sources {
		values = append(values, source.Title, source.Snippet, source.URL, source.Text)
	}
	return values
}

func assetOnlineSourceURLs(sources []assetOnlineSource) []string {
	values := make([]string, 0, len(sources))
	for _, source := range sources {
		if source.URL != "" {
			values = append(values, source.URL)
		}
	}
	return values
}

func assetOnlineSourceTitles(sources []assetOnlineSource) []string {
	values := make([]string, 0, len(sources))
	for _, source := range sources {
		if source.Title != "" {
			values = append(values, source.Title)
		}
	}
	return values
}

func assetOnlineSourceTypes(sources []assetOnlineSource) []string {
	values := make([]string, 0, len(sources))
	for _, source := range sources {
		if source.Type != "" {
			values = append(values, source.Type)
		}
	}
	return values
}

func assetOnlineSourceImageURLs(sources []assetOnlineSource) []string {
	values := make([]string, 0, len(sources))
	for _, source := range sources {
		if source.ImageURL != "" {
			values = append(values, source.ImageURL)
		}
	}
	return values
}

func assetOnlineSourceMetadataRows(sources []assetOnlineSource) []map[string]any {
	rows := make([]map[string]any, 0, len(sources))
	for _, source := range sources {
		row := map[string]any{}
		if value := strings.TrimSpace(source.Provider); value != "" {
			row["provider"] = value
		}
		if value := strings.TrimSpace(source.Type); value != "" {
			row["type"] = value
		}
		if value := strings.TrimSpace(source.Title); value != "" {
			row["title"] = value
		}
		if value := strings.TrimSpace(source.URL); value != "" {
			row["url"] = value
		}
		if value := strings.TrimSpace(source.ImageURL); value != "" {
			row["image_url"] = value
		}
		if source.Confidence > 0 {
			row["confidence"] = source.Confidence
		}
		if len(row) > 0 {
			rows = append(rows, row)
		}
	}
	return rows
}

func assetOnlineSourceProviders(sources []assetOnlineSource) []string {
	values := make([]string, 0, len(sources))
	for _, source := range sources {
		values = appendProvider(values, source.Provider)
	}
	return values
}
