package hub

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strings"
	"sync"
	"time"

	"sort"

	"github.com/pocketbase/pocketbase/core"
)

// 2026-10-14 参数获取下线：创建流程的 auto-fetch 端点（联网搜索参数候选）随搜索链路一起移除；
// 本文件保留图片候选链路（网络图墙搜索，与参数填写无关）。

// 2026-10-04 创建流程图墙：按名称只搜不建库地抓取多张候选图（去重），
// 不做厂商/官网过滤——图墙的价值就是人工挑选，来源与原图链接一并提供。
// 2026-10-05 图片专项：候选升级为内容级去重（下载缩图算哈希）并排除图库已有图片。
type assetImageCandidatesRequest struct {
	Name      string `json:"name"`
	TypeLabel string `json:"type_label"`
	// 2026-10-09 图片专项：厂商参与搜索词——裸型号太泛（UM690 会命中无关内容）
	Vendor string `json:"vendor"`
	// 图源勾选（bing / so360），空 = 全部启用
	Sources []string `json:"sources"`
	// 候选数量上限（4-30），0/超界 = 默认 12
	Limit int `json:"limit"`
	// 2026-10-18 服务类资产（宽带/订阅/域名/云主机等）按品牌 Logo 搜索
	AssetType string `json:"asset_type"`
	AssetID   string `json:"asset_id"`
}

func (h *Hub) assetImageCandidates(e *core.RequestEvent) error {
	var req assetImageCandidatesRequest
	if err := json.NewDecoder(e.Request.Body).Decode(&req); err != nil {
		return e.BadRequestError("Invalid request body.", err)
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return e.BadRequestError("Missing asset name.", nil)
	}
	// 图库已有图片的内容哈希：候选与之重复的直接剔除，再搜永远只给"没有的"
	libraryHashes := map[string]bool{}
	if assetID := strings.TrimSpace(req.AssetID); assetID != "" {
		libraryMedia, err := h.FindRecordsByFilter(
			"asset_media",
			"asset = {:asset} && user = {:user}",
			"id", 500, 0,
			map[string]any{"asset": assetID, "user": e.Auth.Id},
		)
		if err == nil {
			for _, media := range libraryMedia {
				if hash := strings.TrimSpace(media.GetString("content_hash")); hash != "" {
					libraryHashes[hash] = true
				}
			}
		}
	}
	// 2026-10-09 图片专项：搜索词按"精美展示图优先"设计——先搜产品图导向词（产品图/product
	// image），再退到通用词、中文别名与类型词，保证冷门设备也能搜到图；实拍/拆解类图片
	// 不靠查询词排除（避免搜不到），而是在打分阶段降级、优质候选足够时剔除。
	// 2026-10-18 服务类资产没有实体：改为搜品牌 Logo，不再套产品图/渲染图关键词。
	vendor := strings.TrimSpace(req.Vendor)
	assetType := strings.TrimSpace(req.AssetType)
	if assetType == "" && strings.TrimSpace(req.AssetID) != "" {
		if record, err := h.FindRecordById("assets", strings.TrimSpace(req.AssetID)); err == nil {
			assetType = record.GetString("type")
		}
	}
	serviceLogo := assetTypeUsesProviderLogo(assetType) && vendor != ""
	identity := name
	if vendor != "" && !strings.Contains(strings.ToLower(name), strings.ToLower(vendor)) {
		identity = vendor + " " + name
	}
	queries := []string{identity + " 渲染图", identity + " 宣传图", identity + " 产品图", identity + " product image", identity}
	if serviceLogo {
		queries = buildAssetServiceLogoQueriesForVendor(vendor)
	}
	for _, alias := range assetImageSearchVendorAliases(vendor) {
		if serviceLogo {
			break
		}
		queries = append(queries, alias+" "+name)
	}
	queries = dedupeStrings(queries)
	imageCandidateLimit := 12
	if req.Limit >= 4 && req.Limit <= 30 {
		imageCandidateLimit = req.Limit
	}
	// 2026-10-11 图片获取 Agent：AI 规划查询变体（启用时替换规则查询）；视觉评估候选需设备身份
	imageAgentConfig := h.assetImageAgentConfig()
	onlineAIConfig := h.assetOnlineAIConfig()
	imageAgentSteps := make([]map[string]any, 0, 4)
	collection, _ := h.FindCachedCollectionByNameOrId("assets")
	if !serviceLogo && imageAgentConfig.Enabled && onlineAIConfig.Enabled && onlineAIConfig.Endpoint != "" && onlineAIConfig.APIKey != "" && onlineAIConfig.Model != "" {
		pseudo := core.NewRecord(collection)
		pseudo.Set("user", e.Auth.Id)
		pseudo.Set("name", name)
		pseudo.Set("type", assetType)
		if vendor != "" {
			pseudo.Set("vendor", vendor)
		}
		if planned := h.agentPlanImageQueries(e.Request.Context(), onlineAIConfig, identity, assetType); len(planned) > 0 {
			queries = dedupeStrings(planned)
			imageAgentSteps = append(imageAgentSteps, map[string]any{"step": "plan", "detail": fmt.Sprintf("AI 规划图片搜索策略 %d 组", len(planned)), "count": len(planned)})
		}
	}
	// 2026-10-10 数量修复：原始候选池上限从 30 提到 60，且随所选数量翻倍——
	// 冷门设备经 URL/内容/图库三层去重后所剩不多，池子必须先挖大才够筛。
	imageCandidateRawLimit := imageCandidateLimit * 2
	if imageCandidateRawLimit > 60 {
		imageCandidateRawLimit = 60
	}
	// 先多收再筛选：匹配度/比例过滤后仍能凑满图墙
	// 优质候选少于这个数时，才回捞匹配度低或比例不合适的候选（避免图墙空荡）
	const imageCandidateMinKept = 4
	// 2026-10-10 数量修复：收集改为两阶段——先并行度低的 HTML/JSON 翻页收满原始池
	// （只做 URL 级去重，不下载），再统一并行下载做内容哈希去重，整体耗时大幅下降。
	seenURLs := map[string]bool{}
	seenHashes := map[string]bool{}
	// 服务类 Logo：同一篇文章/图集里的多张图只取一张，避免图墙被同一标题刷屏
	seenLogoArticles := map[string]bool{}
	rawPool := make([]map[string]any, 0, imageCandidateRawLimit)
	// 先按匹配度分流：型号未命中的候选先不下载，优质候选不足时再回捞
	pendingLowMatch := make([]map[string]any, 0, imageCandidateRawLimit)
	appendPool := func(candidates []map[string]any) {
		for _, candidate := range candidates {
			if len(rawPool) >= imageCandidateRawLimit {
				return
			}
			imageURL := strings.TrimSpace(stringFromAny(candidate["image_url"]))
			key := strings.ToLower(imageURL)
			if imageURL == "" || seenURLs[key] {
				continue
			}
			seenURLs[key] = true
			title := stringFromAny(candidate["title"])
			sourceURL := stringFromAny(candidate["source_url"])
			if serviceLogo {
				articleKey := strings.ToLower(strings.TrimSpace(title)) + "|" + strings.TrimSpace(sourceURL)
				if seenLogoArticles[articleKey] {
					continue
				}
				seenLogoArticles[articleKey] = true
				if assetImageWallStockLogoHost(sourceURL, imageURL) {
					continue
				}
			}
			if assetImageWallCandidateMatchTier(name, vendor, title, sourceURL, imageURL) == 2 {
				pendingLowMatch = append(pendingLowMatch, candidate)
				continue
			}
			rawPool = append(rawPool, candidate)
		}
	}
	// 2026-10-09 图片专项：按勾选的图源聚合搜索（必应两步 cookie + 360 JSON 接口），
	// 结果统一进入打分管线；来源清单为空视为全部启用。
	enabledSources := requestedAssetImageSources(req.Sources)
	client := newBingImageSearchClient()
	seedBingImageSearchSession(client)
	// 2026-10-10 数量修复：翻页从 1-2 页加深到 3-4 页（实测必应第 2-4 页每页还有 7-10 张新图，
	// 360 每页产出少但稳定），每轮收满即停，不再多抓。
	for _, query := range queries {
		if len(rawPool) >= imageCandidateRawLimit {
			break
		}
		if enabledSources["bing"] {
			body, err := fetchBingImageSearchWithClient(client, query, "")
			if err == nil {
				appendPool(parseBingImageSearchCandidates(body, query))
			}
		}
		if enabledSources["so360"] && len(rawPool) < imageCandidateRawLimit {
			appendPool(h.fetchSo360ImageCandidatesPage(query, 0))
		}
	}
	// 第 2 轮：必应宽幅过滤变体（qft=aspect-wide 直接命中 16:9 宽图）+ 360 第二页
	if len(rawPool) < imageCandidateRawLimit {
		for _, query := range queries {
			if len(rawPool) >= imageCandidateRawLimit {
				break
			}
			if enabledSources["bing"] {
				body, err := fetchBingImageSearchWithClient(client, query, "&qft=+filterui:aspect-wide&first=11")
				if err == nil {
					appendPool(parseBingImageSearchCandidates(body, query))
				}
			}
			if enabledSources["so360"] && len(rawPool) < imageCandidateRawLimit {
				appendPool(h.fetchSo360ImageCandidatesPage(query, 1))
			}
		}
	}
	// 第 3 轮：必应深翻页 first=21 + 360 第三页
	if len(rawPool) < imageCandidateRawLimit {
		for _, query := range queries {
			if len(rawPool) >= imageCandidateRawLimit {
				break
			}
			if enabledSources["bing"] {
				body, err := fetchBingImageSearchWithClient(client, query, "&first=21")
				if err == nil {
					appendPool(parseBingImageSearchCandidates(body, query))
				}
			}
			if enabledSources["so360"] && len(rawPool) < imageCandidateRawLimit {
				appendPool(h.fetchSo360ImageCandidatesPage(query, 2))
			}
		}
	}
	// 第 4 轮：必应 first=31（只在前三轮都不够时才跑）
	if len(rawPool) < imageCandidateRawLimit {
		for _, query := range queries {
			if len(rawPool) >= imageCandidateRawLimit {
				break
			}
			if enabledSources["bing"] {
				body, err := fetchBingImageSearchWithClient(client, query, "&first=31")
				if err == nil {
					appendPool(parseBingImageSearchCandidates(body, query))
				}
			}
		}
	}
	// 阶段 2：并行下载原始池做内容哈希去重（与候选集、图库已有图片都比对）
	collected := h.collectAssetImageWallEntries(rawPool, libraryHashes, seenHashes)
	// 回捞：优质候选不足时把型号未命中的也下载进来（排序时天然排最后）
	if len(collected) < imageCandidateMinKept {
		collected = append(collected, h.collectAssetImageWallEntries(pendingLowMatch, libraryHashes, seenHashes)...)
	}
	// 打分排序：匹配度 → 内容类型（展示图优先）→ 16:9 贴合度 → 搜索顺序；比例离谱/过小/实拍拆解类择后
	infos := make([]assetImageWallCandidateInfo, 0, len(collected))
	for _, entry := range collected {
		infos = append(infos, assetImageWallCandidateInfo{
			Title:     entry.title,
			SourceURL: entry.sourceURL,
			ImageURL:  entry.imageURL,
			Width:     entry.width,
			Height:    entry.height,
		})
	}
	scores := scoreAssetImageWallCandidates(name, vendor, infos)
	// 2026-10-11 图片获取 Agent：视觉模型评估前 N 张候选的内容类型（渲染图/图表/实拍），修正文件名推断的内容分级
	assessRecord := core.NewRecord(collection)
	assessRecord.Set("user", e.Auth.Id)
	assessRecord.Set("name", name)
	assessRecord.Set("type", assetType)
	if vendor != "" {
		assessRecord.Set("vendor", vendor)
	}
	if imageAgentConfig.Enabled && imageAgentConfig.AssessCount > 0 {
		ordered := assetImageWallSelectIndices(scores, imageAgentConfig.AssessCount)
		assessEntries := make([]assetImageWallEntry, 0, len(ordered))
		assessIndexMap := make([]int, 0, len(ordered))
		for _, index := range ordered {
			assessEntries = append(assessEntries, collected[index])
			assessIndexMap = append(assessIndexMap, index)
		}
		assessTiers, assessStepList := h.assetImageAgentAssess(e.Request.Context(), assessRecord, assessEntries, imageAgentConfig.AssessCount)
		for _, step := range assessStepList {
			imageAgentSteps = append(imageAgentSteps, map[string]any{"step": step.Step, "detail": step.Detail, "count": step.Count})
		}
		if len(assessTiers) > 0 {
			// 修正内容分级：视觉评估 render=0 提升、hands_on=2 降级，然后按新分级稳定重排
			for pos, itemIndex := range assessIndexMap {
				tier, ok := assessTiers[pos]
				if !ok {
					continue
				}
				for scoreIndex := range scores {
					if scores[scoreIndex].Index == itemIndex {
						scores[scoreIndex].ContentTier = tier
						break
					}
				}
			}
			sort.SliceStable(scores, func(left, right int) bool {
				l, r := scores[left], scores[right]
				if l.ContentTier != r.ContentTier {
					return l.ContentTier < r.ContentTier
				}
				return l.Index < r.Index
			})
		}
	}
	// 2026-10-10 数量补位：排序已把优质展示图排前、实拍拆解/比例差排后，
	// 按排序顺序填满用户要的数量——优质不足时由低优先级候选自然补位（不再直接剔除）。
	items := make([]map[string]any, 0, imageCandidateLimit)
	for _, index := range assetImageWallSelectIndices(scores, imageCandidateLimit) {
		items = append(items, collected[index].item)
	}
	if len(imageAgentSteps) > 0 {
		if taskCollection, err := h.FindCachedCollectionByNameOrId("ai_tasks"); err == nil {
			record := core.NewRecord(taskCollection)
			record.Set("user", e.Auth.Id)
			if req.AssetID != "" {
				record.Set("asset", req.AssetID)
			}
			record.Set("kind", "image_agent")
			record.Set("status", "ready")
			record.Set("provider", onlineAIConfig.Provider)
			record.Set("model", onlineAIConfig.Model)
			record.Set("input_summary", map[string]any{
				"manual_trigger": true,
			})
			record.Set("output_summary", map[string]any{
				"steps":      imageAgentSteps,
				"candidates": len(items),
			})
			if err := h.Save(record); err != nil {
				return e.InternalServerError("Failed to create image agent task record.", err)
			}
		}
	}
	return e.JSON(http.StatusOK, map[string]any{"items": items, "agent_steps": imageAgentSteps})
}

// assetImageWallEntry 图墙候选条目：item 为返回给前端的字段集，其余字段供打分使用。
type assetImageWallEntry struct {
	item      map[string]any
	title     string
	sourceURL string
	imageURL  string
	width     int
	height    int
	bytes     []byte
}

// assetImageWallSelectIndices 按打分顺序选出最多 limit 个候选下标。
func assetImageWallSelectIndices(scores []assetImageWallCandidateScore, limit int) []int {
	indices := make([]int, 0, limit)
	for _, score := range scores {
		indices = append(indices, score.Index)
		if len(indices) >= limit {
			break
		}
	}
	return indices
}

// collectAssetImageWallEntries 并行下载候选图并做内容哈希去重（与候选集、图库已有图片比对），
// 返回按搜索顺序去重后的候选条目；单张失败（超时/非图片/超大）直接跳过。
// 2026-10-10 数量修复：下载从逐张串行改为并发 8——整轮搜索从 75-100 秒降到约 20-30 秒。
func (h *Hub) collectAssetImageWallEntries(candidates []map[string]any, libraryHashes map[string]bool, seenHashes map[string]bool) []assetImageWallEntry {
	type wallDownload struct {
		digest        string
		width, height int
		source        []byte
	}
	downloads := make([]wallDownload, len(candidates))
	var wg sync.WaitGroup
	sem := make(chan struct{}, 8)
	for i, candidate := range candidates {
		imageURL := strings.TrimSpace(stringFromAny(candidate["image_url"]))
		if imageURL == "" {
			continue
		}
		wg.Add(1)
		go func(i int, imageURL string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			source, err := h.fetchAssetVisualImage(imageURL, 512*1024)
			if err != nil {
				return
			}
			width, height := decodeAssetImageDimensions(source)
			downloads[i] = wallDownload{
				digest: fmt.Sprintf("%x", sha256.Sum256(source)),
				source: source,
				width:  width,
				height: height,
			}
		}(i, imageURL)
	}
	wg.Wait()
	collected := make([]assetImageWallEntry, 0, len(candidates))
	for i, candidate := range candidates {
		download := downloads[i]
		if download.digest == "" {
			continue
		}
		if seenHashes[download.digest] || libraryHashes[download.digest] {
			continue
		}
		seenHashes[download.digest] = true
		imageURL := strings.TrimSpace(stringFromAny(candidate["image_url"]))
		sourceURL := stringFromAny(candidate["source_url"])
		collected = append(collected, assetImageWallEntry{
			bytes: downloads[i].source,
			item: map[string]any{
				"url":        imageURL,
				"title":      stringFromAny(candidate["title"]),
				"source_url": sourceURL,
				"provider":   stringFromAny(candidate["provider"]),
				// 宽高随响应返回：前端可用于展示比例信息，也便于质量排查
				"width":  download.width,
				"height": download.height,
			},
			title:     stringFromAny(candidate["title"]),
			sourceURL: sourceURL,
			imageURL:  imageURL,
			width:     download.width,
			height:    download.height,
		})
	}
	return collected
}

// 2026-10-09 图片专项：图源勾选——默认必应+360 全开；勾选为空时视为全部启用。
func requestedAssetImageSources(sources []string) map[string]bool {
	enabled := map[string]bool{}
	for _, source := range sources {
		switch strings.ToLower(strings.TrimSpace(source)) {
		case "bing":
			enabled["bing"] = true
		case "so360":
			enabled["so360"] = true
		}
	}
	if len(enabled) == 0 {
		enabled["bing"] = true
		enabled["so360"] = true
	}
	return enabled
}

// 2026-10-09 图片专项：必应图片搜索两步 cookie 流程——无 cookie 时必应只返回降级结果
// （约 5 个卡片、1 条真结果）。同一次图墙搜索复用同一个 client 与种子 cookie，
// 多个查询之间不再重复握手。
const bingImageSearchUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 PulseAssetEnrichment/1.0"

func newBingImageSearchClient() *http.Client {
	jar, err := cookiejar.New(nil)
	if err != nil {
		return &http.Client{Timeout: 12 * time.Second}
	}
	return &http.Client{Timeout: 12 * time.Second, Jar: jar}
}

func seedBingImageSearchSession(client *http.Client) {
	if client == nil {
		return
	}
	seedReq, err := http.NewRequest(http.MethodGet, "https://cn.bing.com/", nil)
	if err != nil {
		return
	}
	seedReq.Header.Set("User-Agent", bingImageSearchUserAgent)
	seedReq.Header.Set("Accept", "text/html")
	if resp, err := client.Do(seedReq); err == nil {
		resp.Body.Close()
	}
}

func fetchBingImageSearchWithClient(client *http.Client, query string, extraParams string) (string, error) {
	if client == nil {
		return "", http.ErrNotSupported
	}
	searchReq, err := http.NewRequest(http.MethodGet, "https://cn.bing.com/images/search?q="+url.QueryEscape(query)+extraParams, nil)
	if err != nil {
		return "", err
	}
	searchReq.Header.Set("User-Agent", bingImageSearchUserAgent)
	searchReq.Header.Set("Referer", "https://cn.bing.com/")
	searchReq.Header.Set("Accept", "text/html,application/xhtml+xml")
	resp, err := client.Do(searchReq)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", http.ErrNotSupported
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1024*1024))
	if err != nil {
		return "", err
	}
	return string(body), nil
}
