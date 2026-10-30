package hub

import (
	"html"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	nethtml "golang.org/x/net/html"
)

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
