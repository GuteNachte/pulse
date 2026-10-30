package hub

import (
	"bytes"
	"encoding/json"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"net/url"
	"slices"
	"strings"
	"unicode"

	"github.com/pocketbase/pocketbase/core"
	_ "golang.org/x/image/webp"
	nethtml "golang.org/x/net/html"
)

// 2026-10-09 图片专项：图墙候选质量体系——匹配度（型号+厂商标题核对，复用资料获取的
// token 逻辑）优先、内容类型（官方/商品展示图优于拆解评测内容）其次、画面比例贴近
// 16:9 再次；竖图/超宽横幅与过小图判为不合适（Dropped，仅在优质候选不足时回捞展示）。

type assetImageWallCandidateInfo struct {
	Title     string
	SourceURL string
	ImageURL  string
	Width     int
	Height    int
}

type assetImageWallCandidateScore struct {
	Index       int
	MatchTier   int
	ContentTier int
	RatioTier   int
	Dropped     bool
}

// assetImageWallContentTier 内容类型分级（2026-10-09 用户要求优先"图库里的这种图"）：
// 0=官方/商品展示图（电商商品图、厂商官网、产品宣传）；1=其他；2=拆解/评测/论坛等非展示型内容。
func assetImageWallContentTier(title string, sourceURL string, imageURL string, vendor string) int {
	if assetImageWallMarketingContent(title, sourceURL, imageURL, vendor) {
		return 0
	}
	if assetImageWallHandsOnContent(title, sourceURL, imageURL) {
		return 2
	}
	return 1
}

var assetImageWallMarketingTitleMarkers = []string{
	"渲染图", "渲染", "宣传图", "宣传", "官图", "官方", "产品图", "商品", "购买", "京东", "天猫", "淘宝", "旗舰店",
	"render", "product image", "official", "buy now", "banner", "press",
}

var assetImageWallMarketingHostMarkers = []string{
	"amazon", "360buyimg", "alicdn", "aliexpress", "ebayimg", "walmartimages",
}

var assetImageWallHandsOnTitleMarkers = []string{
	"拆解", "拆机", "开箱", "评测", "测评", "上手体验", "装机", "主板",
	"review", "teardown", "disassembly", "installing", "hands-on", "handson",
	"motherboard", "pcb", "inside the",
}

var assetImageWallHandsOnHostMarkers = []string{
	"forum", "notebookcheck", "level1techs", "reddit", "ifixit", "tomshardware", "techpowerup", "chiphell", "koolshare",
}

// 2026-10-18 服务类 Logo 图墙：素材站/图库站的 Logo 多带水印或拼版，
// 不适合作为资产封面，直接跳过；官方站点与品牌资料站保留。
var assetImageWallStockLogoHostMarkers = []string{
	"nipic", "58pic", "616pic", "tukuppt", "pngtree", "cleanpng", "dreamstime",
	"shutterstock", "istockphoto", "vecteezy",
}

func assetImageWallStockLogoHost(sourceURL string, imageURL string) bool {
	for _, rawURL := range []string{sourceURL, imageURL} {
		host := assetImageWallHost(rawURL)
		if host == "" {
			continue
		}
		for _, marker := range assetImageWallStockLogoHostMarkers {
			if strings.Contains(host, marker) {
				return true
			}
		}
	}
	return false
}

func assetImageWallMarketingContent(title string, sourceURL string, imageURL string, vendor string) bool {
	lowerTitle := strings.ToLower(title)
	for _, marker := range assetImageWallMarketingTitleMarkers {
		if strings.Contains(lowerTitle, marker) {
			return true
		}
	}
	return assetImageWallProductHost(sourceURL, imageURL, vendor)
}

// assetImageWallProductHost 判断来源域名是否属于商城或厂商官方（如 amazon、京东 CDN、厂商域名）。
func assetImageWallProductHost(sourceURL string, imageURL string, vendor string) bool {
	vendorTerm := strings.ToLower(strings.TrimSpace(vendor))
	for _, rawURL := range []string{sourceURL, imageURL} {
		host := assetImageWallHost(rawURL)
		if host == "" {
			continue
		}
		for _, marker := range assetImageWallMarketingHostMarkers {
			if strings.Contains(host, marker) {
				return true
			}
		}
		// 厂商域名（如 minisforum.com）视为官方来源
		if vendorTerm != "" && strings.Contains(host, vendorTerm) {
			return true
		}
	}
	return false
}

func assetImageWallHandsOnContent(title string, sourceURL string, imageURL string) bool {
	lowerTitle := strings.ToLower(title)
	for _, marker := range assetImageWallHandsOnTitleMarkers {
		if strings.Contains(lowerTitle, marker) {
			return true
		}
	}
	for _, rawURL := range []string{sourceURL, imageURL} {
		host := assetImageWallHost(rawURL)
		if host == "" {
			continue
		}
		for _, marker := range assetImageWallHandsOnHostMarkers {
			if strings.Contains(host, marker) {
				return true
			}
		}
	}
	return false
}

func assetImageWallHost(rawURL string) string {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		return ""
	}
	return strings.ToLower(parsed.Hostname())
}

// decodeAssetImageDimensions 读取图片宽高（只解析头部，不整图解码；webp/png/gif/jpeg 已注册）。
func decodeAssetImageDimensions(source []byte) (int, int) {
	config, _, err := image.DecodeConfig(bytes.NewReader(source))
	if err != nil {
		return 0, 0
	}
	return config.Width, config.Height
}

// assetImageWallCandidateMatchTier 标题匹配分级：
// 0=型号 token 命中且（厂商命中 或 来源是商城/官方域名）；1=仅型号命中；
// 2=型号未命中（不同型号、无关内容），只在数量不足时回捞。
func assetImageWallCandidateMatchTier(name string, vendor string, title string, sourceURL string, imageURL string) int {
	modelTokens := assetImageSearchTextTokens(name)
	vendorTerm := normalizeAssetVisualMatchText(vendor)
	titleText := normalizeAssetVisualMatchText(title)
	productHost := assetImageWallProductHost(sourceURL, imageURL, vendor)
	if !assetImageSearchTokenSequenceHasStableModelToken(modelTokens) {
		// 名称里没有可比对的稳定型号：有厂商词或商城来源算命中，否则中性保留
		if (vendorTerm != "" && strings.Contains(titleText, vendorTerm)) || productHost {
			return 0
		}
		return 1
	}
	if !assetImageWallTitleHasModelTokens(assetImageSearchTextTokens(title), modelTokens) {
		return 2
	}
	if (vendorTerm != "" && !strings.Contains(titleText, vendorTerm)) && !productHost {
		return 1
	}
	return 0
}

func assetImageWallTitleHasModelTokens(titleTokens []string, modelTokens []string) bool {
	if len(titleTokens) == 0 || len(modelTokens) == 0 {
		return false
	}
	for start := 0; start+len(modelTokens) <= len(titleTokens); start++ {
		if !slices.Equal(titleTokens[start:start+len(modelTokens)], modelTokens) {
			continue
		}
		// 型号后面紧跟变体后缀（Slim/Pro/SE…）说明是同系列不同型号，不算命中
		if start+len(modelTokens) < len(titleTokens) && assetImageSearchModelVariantSuffix(titleTokens[start+len(modelTokens)]) {
			continue
		}
		return true
	}
	return false
}

// assetImageWallRatioScore 画面比例分级（16:9 ≈ 1.78 为理想）：
// 0=1.6~2.0；1=1.35~1.6 或 2.0~2.4；2=1.0~1.35 或 2.4~2.9 或尺寸未知；
// 3=接近竖图（0.9~1.0）。竖图/超宽横幅与小于 320×200 的图判为 Dropped。
func assetImageWallRatioScore(width int, height int) (int, bool) {
	if width <= 0 || height <= 0 {
		return 2, false
	}
	ratio := float64(width) / float64(height)
	dropped := ratio < 0.9 || ratio > 2.9 || width < 320 || height < 200
	switch {
	case ratio >= 1.6 && ratio <= 2.0:
		return 0, dropped
	case (ratio >= 1.35 && ratio < 1.6) || (ratio > 2.0 && ratio <= 2.4):
		return 1, dropped
	case (ratio >= 1.0 && ratio < 1.35) || (ratio > 2.4 && ratio <= 2.9):
		return 2, dropped
	default:
		return 3, dropped
	}
}

// scoreAssetImageWallCandidates 打分并按优先级排序：匹配度 → 内容类型（官方/商品展示图优先）
// → 16:9 贴合度 → 搜索顺序；不合适（比例离谱/过小）的候选排在最后，由调用方按优质候选数量决定是否展示。
func scoreAssetImageWallCandidates(name string, vendor string, infos []assetImageWallCandidateInfo) []assetImageWallCandidateScore {
	scores := make([]assetImageWallCandidateScore, 0, len(infos))
	for index, info := range infos {
		ratioTier, dropped := assetImageWallRatioScore(info.Width, info.Height)
		scores = append(scores, assetImageWallCandidateScore{
			Index:       index,
			MatchTier:   assetImageWallCandidateMatchTier(name, vendor, info.Title, info.SourceURL, info.ImageURL),
			ContentTier: assetImageWallContentTier(info.Title, info.SourceURL, info.ImageURL, vendor),
			RatioTier:   ratioTier,
			Dropped:     dropped,
		})
	}
	slices.SortStableFunc(scores, func(left assetImageWallCandidateScore, right assetImageWallCandidateScore) int {
		if left.Dropped != right.Dropped {
			if left.Dropped {
				return 1
			}
			return -1
		}
		if left.MatchTier != right.MatchTier {
			return left.MatchTier - right.MatchTier
		}
		if left.ContentTier != right.ContentTier {
			return left.ContentTier - right.ContentTier
		}
		if left.RatioTier != right.RatioTier {
			return left.RatioTier - right.RatioTier
		}
		return left.Index - right.Index
	})
	return scores
}

type assetImageSearchPlan struct {
	Queries       []string
	UsedTextModel bool
}

func assetImageSearchEnabled() bool {
	return configBoolEnvDefault("PULSE_ASSET_IMAGE_SEARCH_ENABLED", true)
}

func assetImageSearchEligible(asset *core.Record) bool {
	if asset == nil || assetUsesProviderLogoVisual(asset) || strings.TrimSpace(asset.GetString("vendor")) == "" {
		return false
	}
	return len(assetImageSearchModelMatchTokens(asset)) > 0
}

func assetImageSearchModelMatchTokens(asset *core.Record) []string {
	if asset == nil {
		return nil
	}
	result := make([]string, 0, 4)
	for _, value := range []string{asset.GetString("model"), recordMetadataString(asset, "internal_model")} {
		normalized := normalizeAssetVisualMatchText(value)
		if assetImageSearchStableModelToken(normalized) {
			result = append(result, normalized)
		}
		for _, token := range strings.FieldsFunc(value, func(r rune) bool {
			return !unicode.IsLetter(r) && !unicode.IsDigit(r)
		}) {
			normalizedToken := normalizeAssetVisualMatchText(token)
			if assetImageSearchStableModelToken(normalizedToken) {
				result = append(result, normalizedToken)
			}
		}
	}
	return dedupeStrings(result)
}

func assetImageSearchStableModelToken(value string) bool {
	if len([]rune(value)) < 3 {
		return false
	}
	hasLetter := false
	hasDigit := false
	for _, r := range value {
		hasLetter = hasLetter || unicode.IsLetter(r)
		hasDigit = hasDigit || unicode.IsDigit(r)
	}
	return hasLetter && hasDigit
}

func buildAssetImageSearchPlan(asset *core.Record, color string, config assetOnlineAIConfig) assetImageSearchPlan {
	identity := strings.Join(nonEmptyStrings(
		asset.GetString("vendor"),
		asset.GetString("model"),
		recordMetadataString(asset, "internal_model"),
		asset.GetString("name"),
	), " ")
	if identity == "" {
		identity = asset.GetString("type")
	}
	color = strings.TrimSpace(color)
	ruleIdentities := []string{identity}
	aliasIdentities := make([]string, 0, 2)
	if model := strings.TrimSpace(asset.GetString("model")); model != "" {
		for _, alias := range assetImageSearchVendorAliases(asset.GetString("vendor")) {
			aliasIdentity := strings.Join([]string{alias, model}, " ")
			ruleIdentities = append(ruleIdentities, aliasIdentity)
			aliasIdentities = append(aliasIdentities, aliasIdentity)
		}
	}
	ruleQueries := make([]string, 0, len(aliasIdentities)+len(ruleIdentities)*2)
	ruleQueries = append(ruleQueries, dedupeStrings(aliasIdentities)...)
	for _, ruleIdentity := range dedupeStrings(ruleIdentities) {
		ruleQueries = append(ruleQueries,
			strings.Join(nonEmptyStrings(ruleIdentity, color, "产品图"), " "),
			strings.Join(nonEmptyStrings(ruleIdentity, "product image"), " "),
		)
	}
	ruleQueries = dedupeStrings(ruleQueries)
	modelQueries := collectAssetImageSearchModelQueries(asset, color, config)
	return assetImageSearchPlan{
		Queries:       dedupeStrings(append(modelQueries, ruleQueries...)),
		UsedTextModel: len(modelQueries) > 0,
	}
}

func assetImageSearchVendorAliases(vendor string) []string {
	switch strings.ToLower(strings.TrimSpace(vendor)) {
	case "minisforum":
		return []string{"铭凡"}
	default:
		return nil
	}
}

func collectAssetImageSearchModelQueries(asset *core.Record, color string, config assetOnlineAIConfig) []string {
	if !config.Enabled || strings.TrimSpace(config.Endpoint) == "" || strings.TrimSpace(config.APIKey) == "" || strings.TrimSpace(config.Model) == "" {
		return nil
	}
	payload, err := json.Marshal(map[string]any{
		"model":       config.Model,
		"temperature": 0,
		"messages": []map[string]string{
			{"role": "system", "content": "你是资产图片搜索助手。只能返回 JSON：{\"queries\":[\"...\"]}。只补充可用于公开图片搜索的关键词，不得返回 URL、图片链接或解释。"},
			{"role": "user", "content": mustJSON(map[string]any{
				"asset": map[string]string{
					"name":           asset.GetString("name"),
					"type":           asset.GetString("type"),
					"vendor":         asset.GetString("vendor"),
					"model":          asset.GetString("model"),
					"internal_model": recordMetadataString(asset, "internal_model"),
					"color":          color,
				},
			})},
		},
		"response_format": map[string]string{"type": "json_object"},
	})
	if err != nil {
		return nil
	}
	body, _, message := callAssetOnlineAIModel(config, payload)
	if message != "" {
		return nil
	}
	return parseAssetImageSearchModelQueries(extractAssetOnlineAIContent(body))
}

func parseAssetImageSearchModelQueries(content string) []string {
	content = strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(strings.TrimPrefix(content, "```json"), "```"), "```"))
	var parsed struct {
		Queries []string `json:"queries"`
	}
	if json.Unmarshal([]byte(content), &parsed) != nil {
		return nil
	}
	result := make([]string, 0, len(parsed.Queries))
	for _, query := range parsed.Queries {
		query = cleanOnlineText(query)
		if query == "" || len([]rune(query)) > 120 || strings.Contains(strings.ToLower(query), "://") {
			continue
		}
		result = append(result, query)
		if len(result) == 4 {
			break
		}
	}
	return dedupeStrings(result)
}

func parseBingImageSearchCandidates(body string, query string) []map[string]any {
	root, err := nethtml.Parse(strings.NewReader(body))
	if err != nil {
		return nil
	}
	result := make([]map[string]any, 0, 12)
	seen := map[string]bool{}
	var walk func(*nethtml.Node)
	walk = func(node *nethtml.Node) {
		if node.Type == nethtml.ElementNode && node.Data == "a" && assetImageSearchHTMLClassContains(node, "iusc") {
			metadata := assetImageSearchHTMLAttr(node, "m")
			var parsed struct {
				ImageURL  string `json:"murl"`
				SourceURL string `json:"purl"`
				Title     string `json:"t"`
			}
			if json.Unmarshal([]byte(metadata), &parsed) == nil {
				imageURL := strings.TrimSpace(parsed.ImageURL)
				if imageURL != "" && !seen[strings.ToLower(imageURL)] && isLikelyAssetVisualImageURL(imageURL) {
					seen[strings.ToLower(imageURL)] = true
					result = append(result, map[string]any{
						"title":        firstNonEmpty(cleanOnlineText(parsed.Title), "必应图片候选"),
						"source_title": firstNonEmpty(cleanOnlineText(parsed.Title), "必应图片候选"),
						"url":          strings.TrimSpace(parsed.SourceURL),
						"source_url":   strings.TrimSpace(parsed.SourceURL),
						"image_url":    imageURL,
						"provider":     "bing_images",
						"type":         "bing_image",
						"search_query": strings.TrimSpace(query),
						"confidence":   65,
					})
				}
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(root)
	return result
}

func (h *Hub) collectAssetVisualBingImageSources(
	asset *core.Record,
	queries []string,
	result []map[string]any,
	seen map[string]bool,
	limit int,
) []map[string]any {
	for _, query := range queries {
		if len(result) >= limit {
			break
		}
		searchURL := "https://cn.bing.com/images/search?q=" + url.QueryEscape(query)
		body, err := h.fetchAssetOnlineURL(searchURL, 768*1024)
		if err != nil {
			continue
		}
		result = h.collectAssetVisualBingImageSourcesFromBody(asset, body, query, result, seen, limit)
	}
	return result
}

func (h *Hub) collectAssetVisualBingImageSourcesFromBody(
	asset *core.Record,
	body string,
	query string,
	result []map[string]any,
	seen map[string]bool,
	limit int,
) []map[string]any {
	for _, candidate := range parseBingImageSearchCandidates(body, query) {
		if len(result) >= limit {
			break
		}
		if !assetImageSearchCandidateMatchesAsset(asset, candidate) {
			continue
		}
		result = appendAssetVisualReferenceSource(asset, result, seen, candidate)
	}
	return result
}

func buildAssetServiceLogoSearchQueries(asset *core.Record) []string {
	if asset == nil {
		return nil
	}
	return buildAssetServiceLogoQueriesForVendor(asset.GetString("vendor"))
}

func buildAssetServiceLogoQueriesForVendor(rawVendor string) []string {
	vendor := strings.TrimSpace(rawVendor)
	if vendor == "" {
		return nil
	}
	aliases := []string{vendor}
	switch strings.ToLower(vendor) {
	case "联通", "china unicom", "unicom":
		aliases = append(aliases, "中国联通", "China Unicom")
	case "移动", "china mobile", "mobile":
		aliases = append(aliases, "中国移动", "China Mobile")
	case "电信", "china telecom", "telecom":
		aliases = append(aliases, "中国电信", "China Telecom")
	case "广电", "china broadcasting", "broadcast":
		aliases = append(aliases, "中国广电", "China Broadcasting")
	}
	queries := make([]string, 0, len(aliases)*3)
	for _, alias := range dedupeStrings(aliases) {
		queries = append(queries, alias+" Logo", alias+" 品牌标志", alias+" 官方标志")
	}
	return dedupeStrings(queries)
}

func (h *Hub) collectAssetVisualBingServiceLogoSources(
	asset *core.Record,
	queries []string,
	result []map[string]any,
	seen map[string]bool,
	limit int,
) []map[string]any {
	for _, query := range queries {
		if len(result) >= limit {
			break
		}
		searchURL := "https://cn.bing.com/images/search?q=" + url.QueryEscape(query)
		body, err := h.fetchAssetOnlineURL(searchURL, 768*1024)
		if err != nil {
			continue
		}
		result = h.collectAssetVisualBingServiceLogoSourcesFromBody(asset, body, query, result, seen, limit)
	}
	return result
}

func (h *Hub) collectAssetVisualBingServiceLogoSourcesFromBody(
	asset *core.Record,
	body string,
	query string,
	result []map[string]any,
	seen map[string]bool,
	limit int,
) []map[string]any {
	for _, candidate := range parseBingServiceLogoCandidates(body, query) {
		if len(result) >= limit {
			break
		}
		if !assetVisualServiceLogoCandidateMatchesProvider(asset, candidate) || !assetVisualServiceLogoCandidateSourceAllowed(candidate) {
			continue
		}
		result = appendAssetVisualReferenceSource(asset, result, seen, candidate)
	}
	return result
}

func parseBingServiceLogoCandidates(body string, query string) []map[string]any {
	root, err := nethtml.Parse(strings.NewReader(body))
	if err != nil {
		return nil
	}
	result := make([]map[string]any, 0, 6)
	seen := map[string]bool{}
	var walk func(*nethtml.Node)
	walk = func(node *nethtml.Node) {
		if node.Type == nethtml.ElementNode && node.Data == "a" && assetImageSearchHTMLClassContains(node, "iusc") {
			metadata := assetImageSearchHTMLAttr(node, "m")
			var parsed struct {
				ImageURL  string `json:"murl"`
				SourceURL string `json:"purl"`
				Title     string `json:"t"`
			}
			if json.Unmarshal([]byte(metadata), &parsed) == nil {
				imageURL := strings.TrimSpace(parsed.ImageURL)
				if imageURL != "" && !seen[strings.ToLower(imageURL)] && isLikelyAssetServiceLogoURL(imageURL) {
					seen[strings.ToLower(imageURL)] = true
					result = append(result, map[string]any{
						"title":        firstNonEmpty(cleanOnlineText(parsed.Title), "必应服务 Logo 候选"),
						"source_title": firstNonEmpty(cleanOnlineText(parsed.Title), "必应服务 Logo 候选"),
						"url":          strings.TrimSpace(parsed.SourceURL),
						"source_url":   strings.TrimSpace(parsed.SourceURL),
						"image_url":    imageURL,
						"provider":     "bing_images",
						"type":         "bing_service_logo",
						"search_query": strings.TrimSpace(query),
						"confidence":   60,
					})
				}
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(root)
	return result
}

func assetVisualServiceLogoCandidateMatchesProvider(asset *core.Record, candidate map[string]any) bool {
	matchText := normalizeAssetVisualMatchText(strings.Join(nonEmptyStrings(
		stringFromAny(candidate["title"]),
		stringFromAny(candidate["source_url"]),
	), " "))
	for _, term := range assetVisualServiceMatchTerms(asset) {
		if strings.Contains(matchText, term) {
			return true
		}
	}
	return false
}

func assetVisualServiceLogoCandidateSourceAllowed(candidate map[string]any) bool {
	title := strings.ToLower(strings.Join(nonEmptyStrings(
		stringFromAny(candidate["title"]),
		stringFromAny(candidate["source_title"]),
	), " "))
	for _, marker := range []string{"css", "素材", "模板", "下载"} {
		if strings.Contains(title, marker) {
			return false
		}
	}
	for _, rawURL := range []string{stringFromAny(candidate["source_url"]), stringFromAny(candidate["image_url"])} {
		parsed, err := url.Parse(strings.TrimSpace(rawURL))
		if err != nil || parsed.Hostname() == "" {
			return false
		}
		if isKnownWatermarkedAssetLogoHost(parsed.Hostname()) {
			return false
		}
	}
	return true
}

func isKnownWatermarkedAssetLogoHost(host string) bool {
	host = strings.ToLower(strings.TrimPrefix(strings.TrimSpace(host), "www."))
	for _, blocked := range []string{"nipic.com", "nximg.cn", "588ku.com", "16pic.com", "vcg.com", "vcgimg.com"} {
		if assetVisualHostMatches(host, blocked) {
			return true
		}
	}
	return false
}

func assetImageSearchCandidateMatchesAsset(asset *core.Record, candidate map[string]any) bool {
	if !assetImageSearchEligible(asset) {
		return false
	}
	title := stringFromAny(candidate["title"])
	if !assetImageSearchCandidateTitleMatchesModel(asset, title) {
		return false
	}
	return assetImageSearchCandidateTitleMatchesVendor(asset, title)
}

func assetImageSearchCandidateTitleMatchesModel(asset *core.Record, title string) bool {
	titleTokens := assetImageSearchTextTokens(title)
	if len(titleTokens) == 0 {
		return false
	}
	for _, sequence := range assetImageSearchModelTokenSequences(asset) {
		for start := 0; start+len(sequence) <= len(titleTokens); start++ {
			if !slices.Equal(titleTokens[start:start+len(sequence)], sequence) {
				continue
			}
			if start+len(sequence) < len(titleTokens) && assetImageSearchModelVariantSuffix(titleTokens[start+len(sequence)]) {
				continue
			}
			return true
		}
	}
	return false
}

func assetImageSearchModelTokenSequences(asset *core.Record) [][]string {
	if asset == nil {
		return nil
	}
	result := make([][]string, 0, 2)
	seen := map[string]bool{}
	for _, value := range []string{asset.GetString("model"), recordMetadataString(asset, "internal_model")} {
		tokens := assetImageSearchTextTokens(value)
		if len(tokens) == 0 || !assetImageSearchTokenSequenceHasStableModelToken(tokens) {
			continue
		}
		key := strings.Join(tokens, " ")
		if seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, tokens)
	}
	return result
}

func assetImageSearchTextTokens(value string) []string {
	result := make([]string, 0, 4)
	for _, token := range strings.FieldsFunc(value, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	}) {
		if normalized := normalizeAssetVisualMatchText(token); normalized != "" {
			result = append(result, normalized)
		}
	}
	return result
}

func assetImageSearchTokenSequenceHasStableModelToken(tokens []string) bool {
	for _, token := range tokens {
		if assetImageSearchStableModelToken(token) {
			return true
		}
	}
	return false
}

func assetImageSearchModelVariantSuffix(token string) bool {
	switch strings.ToLower(strings.TrimSpace(token)) {
	case "pro", "ultra", "max", "plus", "mini", "lite", "se", "s", "wt", "slim", "g", "i", "ii":
		return true
	default:
		return false
	}
}

func assetImageSearchCandidateTitleMatchesVendor(asset *core.Record, title string) bool {
	matchText := normalizeAssetVisualMatchText(title)
	for _, term := range assetImageSearchVendorMatchTerms(asset) {
		if strings.Contains(matchText, term) {
			return true
		}
	}
	return false
}

func assetImageSearchVendorMatchTerms(asset *core.Record) []string {
	if asset == nil {
		return nil
	}
	values := []string{asset.GetString("vendor")}
	values = append(values, assetImageSearchVendorAliases(asset.GetString("vendor"))...)
	switch strings.ToLower(strings.TrimSpace(asset.GetString("vendor"))) {
	case "xiaomi", "小米", "redmi", "红米":
		values = append(values, "小米", "红米", "Redmi")
	}
	result := make([]string, 0, len(values))
	for _, value := range values {
		if term := normalizeAssetVisualMatchText(value); len([]rune(term)) >= 2 {
			result = append(result, term)
		}
	}
	return dedupeStrings(result)
}

func assetImageSearchHTMLClassContains(node *nethtml.Node, className string) bool {
	for _, attribute := range node.Attr {
		if attribute.Key != "class" {
			continue
		}
		for _, value := range strings.Fields(attribute.Val) {
			if value == className {
				return true
			}
		}
	}
	return false
}

func assetImageSearchHTMLAttr(node *nethtml.Node, name string) string {
	for _, attribute := range node.Attr {
		if attribute.Key == name {
			return attribute.Val
		}
	}
	return ""
}
