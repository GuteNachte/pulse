package hub

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/stretchr/testify/require"
)

func TestAssetImageSearchPlanUsesRulesWhenTextModelIsUnavailable(t *testing.T) {
	asset := core.NewRecord(core.NewBaseCollection("assets"))
	asset.Set("type", "phone")
	asset.Set("vendor", "Xiaomi")
	asset.Set("model", "Redmi K50")
	asset.Set("metadata", map[string]any{"internal_model": "2211133C", "color": "墨羽"})

	plan := buildAssetImageSearchPlan(asset, "墨羽", assetOnlineAIConfig{})

	require.Equal(t, []string{
		"Xiaomi Redmi K50 2211133C 墨羽 产品图",
		"Xiaomi Redmi K50 2211133C product image",
	}, plan.Queries)
	require.False(t, plan.UsedTextModel)
}

func TestAssetImageSearchPlanAddsKnownChineseVendorAlias(t *testing.T) {
	asset := core.NewRecord(core.NewBaseCollection("assets"))
	asset.Set("type", "mini_pc")
	asset.Set("vendor", "MINISFORUM")
	asset.Set("model", "UM690")
	asset.Set("metadata", map[string]any{"internal_model": "UM690"})

	plan := buildAssetImageSearchPlan(asset, "", assetOnlineAIConfig{})

	require.Contains(t, plan.Queries, "铭凡 UM690")
	require.Contains(t, plan.Queries, "铭凡 UM690 产品图")
}

func TestAssetImageSearchPlanAddsOnlyValidTextModelQueries(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		require.Contains(t, r.URL.Path, "/chat/completions")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"queries\":[\"Redmi K50 2211133C 墨羽 京东 商品图\",\"https://img.example.com/not-allowed.jpg\"]}"}}]}`))
	}))
	defer server.Close()
	asset := core.NewRecord(core.NewBaseCollection("assets"))
	asset.Set("type", "phone")
	asset.Set("vendor", "Xiaomi")
	asset.Set("model", "Redmi K50")

	plan := buildAssetImageSearchPlan(asset, "墨羽", assetOnlineAIConfig{
		Enabled:  true,
		Endpoint: server.URL + "/chat/completions",
		APIKey:   "test-key",
		Model:    "text-model",
	})

	require.True(t, plan.UsedTextModel)
	require.Contains(t, plan.Queries, "Redmi K50 2211133C 墨羽 京东 商品图")
	require.NotContains(t, plan.Queries, "https://img.example.com/not-allowed.jpg")
	require.Contains(t, plan.Queries, "Xiaomi Redmi K50 墨羽 产品图")
}

func TestParseBingImageSearchCandidatesRejectsNonImageResults(t *testing.T) {
	body := `<html><body>
		<a class="iusc" m='{"murl":"https://img.example.com/redmi-k50-black.jpg","purl":"https://example.com/redmi-k50","t":"Redmi K50 墨羽"}'></a>
		<a class="iusc" m='{"murl":"https://img.example.com/qrcode.png","purl":"https://example.com/qrcode","t":"下载二维码"}'></a>
		<a class="iusc" m='{"murl":"https://img.example.com/redmi-k50-black.jpg","purl":"https://example.com/duplicate","t":"重复图"}'></a>
	</body></html>`

	candidates := parseBingImageSearchCandidates(body, "Xiaomi Redmi K50")

	require.Len(t, candidates, 1)
	require.Equal(t, "bing_images", candidates[0]["provider"])
	require.Equal(t, "https://img.example.com/redmi-k50-black.jpg", candidates[0]["image_url"])
	require.Equal(t, "https://example.com/redmi-k50", candidates[0]["url"])
	require.Equal(t, "Xiaomi Redmi K50", candidates[0]["search_query"])
}

func TestBingImageCandidatesRequireAStableAssetModelMatch(t *testing.T) {
	asset := core.NewRecord(core.NewBaseCollection("assets"))
	asset.Set("type", "phone")
	asset.Set("vendor", "Xiaomi")
	asset.Set("model", "Redmi K50")
	body := `<html><body>
		<a class="iusc" m='{"murl":"https://img.example.com/redmi-k50-black.jpg","purl":"https://example.com/redmi-k50","t":"Redmi K50 墨羽"}'></a>
		<a class="iusc" m='{"murl":"https://img.example.com/shark.jpg","purl":"https://example.com/travel","t":"海岛旅行图片"}'></a>
	</body></html>`

	result := (&Hub{}).collectAssetVisualBingImageSourcesFromBody(asset, body, "Xiaomi Redmi K50", nil, map[string]bool{}, 10)

	require.Len(t, result, 1)
	require.Equal(t, "Redmi K50 墨羽", result[0]["title"])
}

func TestBingImageCandidatesRejectModelSuffixVariants(t *testing.T) {
	asset := core.NewRecord(core.NewBaseCollection("assets"))
	asset.Set("type", "mini_pc")
	asset.Set("vendor", "MINISFORUM")
	asset.Set("model", "UM690")
	body := `<html><body>
		<a class="iusc" m='{"murl":"https://img.example.com/um690wt.jpg","purl":"https://example.com/um690wt","t":"铭凡 UM690WT 迷你主机"}'></a>
		<a class="iusc" m='{"murl":"https://img.example.com/um690.jpg","purl":"https://example.com/um690","t":"MINISFORUM UM690 迷你主机"}'></a>
	</body></html>`

	result := (&Hub{}).collectAssetVisualBingImageSourcesFromBody(asset, body, "铭凡 UM690 产品图", nil, map[string]bool{}, 10)

	require.Len(t, result, 1)
	require.Equal(t, "MINISFORUM UM690 迷你主机", result[0]["title"])
}

func TestBingImageCandidatesRequireVendorOrBrandIdentity(t *testing.T) {
	asset := core.NewRecord(core.NewBaseCollection("assets"))
	asset.Set("type", "phone")
	asset.Set("vendor", "Xiaomi")
	asset.Set("model", "Redmi K50")
	body := `<html><body>
		<a class="iusc" m='{"murl":"https://img.example.com/acme-k50.jpg","purl":"https://example.com/acme-k50","t":"Acme K50 设备图片"}'></a>
		<a class="iusc" m='{"murl":"https://img.example.com/redmi-k50.jpg","purl":"https://example.com/redmi-k50","t":"Redmi K50 设备图片"}'></a>
	</body></html>`

	result := (&Hub{}).collectAssetVisualBingImageSourcesFromBody(asset, body, "Xiaomi Redmi K50 产品图", nil, map[string]bool{}, 10)

	require.Len(t, result, 1)
	require.Equal(t, "Redmi K50 设备图片", result[0]["title"])
}

func TestAssetImageSearchRequiresSpecificVendorAndModel(t *testing.T) {
	asset := core.NewRecord(core.NewBaseCollection("assets"))
	asset.Set("type", "computer")
	asset.Set("vendor", "Archive")
	asset.Set("model", "Host")

	require.False(t, assetImageSearchEligible(asset))

	asset.Set("model", "Archive Host A1200")
	require.True(t, assetImageSearchEligible(asset))
}

func TestCollectedAssetVisualFramesKeepSearchProvider(t *testing.T) {
	asset := core.NewRecord(core.NewBaseCollection("assets"))
	asset.Set("type", "phone")
	frames := (&Hub{}).buildCollectedAssetVisualFrames(asset, []map[string]any{{
		"title":      "Redmi K50 墨羽",
		"url":        "https://example.com/redmi-k50",
		"image_url":  "https://img.example.com/redmi-k50.jpg",
		"provider":   "bing_images",
		"confidence": 65,
	}}, 1, "")

	require.Len(t, frames, 1)
	require.Equal(t, "bing_images", frames[0]["provider"])
}

func TestBingImageSourcesOnlyFillRemainingCandidateSlots(t *testing.T) {
	asset := core.NewRecord(core.NewBaseCollection("assets"))
	asset.Set("type", "phone")
	asset.Set("vendor", "Xiaomi")
	asset.Set("model", "Redmi K50")
	result := []map[string]any{{
		"title":      "已确认官方设备图片",
		"url":        "https://official.example.com/redmi-k50.jpg",
		"image_url":  "https://official.example.com/redmi-k50.jpg",
		"provider":   "asset_master",
		"confidence": 96,
	}}
	seen := map[string]bool{"https://official.example.com/redmi-k50.jpg": true}
	body := `<a class="iusc" m='{"murl":"https://img.example.com/redmi-k50-black.jpg","purl":"https://example.com/redmi-k50","t":"Redmi K50 墨羽"}'></a>
		<a class="iusc" m='{"murl":"https://img.example.com/redmi-k50-white.jpg","purl":"https://example.com/redmi-k50-white","t":"Redmi K50 白色"}'></a>`

	result = (&Hub{}).collectAssetVisualBingImageSourcesFromBody(asset, body, "Xiaomi Redmi K50", result, seen, 2)

	require.Len(t, result, 2)
	require.Equal(t, "asset_master", result[0]["provider"])
	require.Equal(t, "bing_images", result[1]["provider"])
}

// 2026-10-09 图片专项：图墙候选质量体系测试——匹配度分级、16:9 比例分级与优先级排序。

func TestAssetImageWallCandidateMatchTier(t *testing.T) {
	// 型号+厂商都命中
	require.Equal(t, 0, assetImageWallCandidateMatchTier("UM690", "MINISFORUM", "Minisforum UM690 准系统开启预售", "", ""))
	// 仅型号命中（标题无厂商词）
	require.Equal(t, 1, assetImageWallCandidateMatchTier("UM690", "MINISFORUM", "UM690 迷你主机开箱评测", "", ""))
	// 不同型号
	require.Equal(t, 2, assetImageWallCandidateMatchTier("UM690", "MINISFORUM", "铭凡发布MS-01迷你工作站", "", ""))
	// 变体后缀（Slim/Pro）不算命中
	require.Equal(t, 2, assetImageWallCandidateMatchTier("UM690", "MINISFORUM", "Minisforum UM690 Slim 评测", "", ""))
	// 商城/官方来源即使标题没有厂商名也视为命中
	require.Equal(t, 0, assetImageWallCandidateMatchTier("UM690", "MINISFORUM", "DroiX Mini PC UM690 AMD Ryzen 9", "https://www.amazon.co.uk/dp/x", ""))
	// 名称没有稳定型号：退化为仅厂商判断
	require.Equal(t, 0, assetImageWallCandidateMatchTier("我的小主机", "MINISFORUM", "Minisforum 新品发布", "", ""))
	require.Equal(t, 1, assetImageWallCandidateMatchTier("我的小主机", "MINISFORUM", "某品牌迷你主机新品", "", ""))
}

func TestAssetImageWallRatioScore(t *testing.T) {
	tier, dropped := assetImageWallRatioScore(1920, 1080)
	require.Equal(t, 0, tier)
	require.False(t, dropped)
	tier, dropped = assetImageWallRatioScore(1600, 1000)
	require.Equal(t, 0, tier)
	require.False(t, dropped)
	tier, dropped = assetImageWallRatioScore(1200, 800)
	require.Equal(t, 1, tier)
	require.False(t, dropped)
	tier, dropped = assetImageWallRatioScore(1000, 1000)
	require.Equal(t, 2, tier)
	require.False(t, dropped)
	// 竖图与超宽横幅：不合适
	_, dropped = assetImageWallRatioScore(800, 1200)
	require.True(t, dropped)
	_, dropped = assetImageWallRatioScore(4000, 900)
	require.True(t, dropped)
	// 过小图片：不合适
	_, dropped = assetImageWallRatioScore(200, 200)
	require.True(t, dropped)
	// 尺寸未知：中性不丢弃
	tier, dropped = assetImageWallRatioScore(0, 0)
	require.Equal(t, 2, tier)
	require.False(t, dropped)
}

func TestScoreAssetImageWallCandidatesOrdersByMatchThenRatio(t *testing.T) {
	infos := []assetImageWallCandidateInfo{
		{Title: "UM690 迷你主机开箱", Width: 1000, Height: 1000},           // 匹配1 比例tier2
		{Title: "Minisforum UM690 准系统", Width: 1200, Height: 800},    // 匹配0 比例tier1
		{Title: "Minisforum UM690 官方产品图", Width: 1920, Height: 1080}, // 匹配0 比例tier0 → 第一
		{Title: "铭凡发布MS-01迷你工作站", Width: 1920, Height: 1080},         // 匹配2
		{Title: "UM690 海报横幅", Width: 4000, Height: 900},              // 匹配1 超宽 → Dropped
	}
	scores := scoreAssetImageWallCandidates("UM690", "MINISFORUM", infos)
	require.Len(t, scores, 5)
	// 第一：匹配0 + 16:9
	require.Equal(t, 2, scores[0].Index)
	// 第二：匹配0 + 比例tier1
	require.Equal(t, 1, scores[1].Index)
	// 第三：匹配1（比例tier2）
	require.Equal(t, 0, scores[2].Index)
	// 第四：匹配2（型号未命中）
	require.Equal(t, 3, scores[3].Index)
	// 最后：Dropped（超宽横幅）
	require.Equal(t, 4, scores[4].Index)
	require.True(t, scores[4].Dropped)
}

// 2026-10-09 图片专项：内容类型分级测试——官方/商品展示图优先，拆解/评测内容降级。

func TestAssetImageWallContentTier(t *testing.T) {
	// 官方/商品展示图：标题词与来源域名
	require.Equal(t, 0, assetImageWallContentTier("Minisforum UM690 官方产品图", "", "", "MINISFORUM"))
	require.Equal(t, 0, assetImageWallContentTier("MINISFORUM UM690 mini pc", "https://www.amazon.com/dp/x", "https://m.media-amazon.com/images/I/x.jpg", "MINISFORUM"))
	require.Equal(t, 0, assetImageWallContentTier("UM690 准系统", "https://www.minisforum.com/products/um690", "", "MINISFORUM"))
	// 拆解/评测/论坛内容：标题词与来源域名
	require.Equal(t, 2, assetImageWallContentTier("Minisforum UM690 拆机图解", "", "", "MINISFORUM"))
	require.Equal(t, 2, assetImageWallContentTier("Minisforum UM690 Review - An AMD Ryzen 9", "", "", "MINISFORUM"))
	require.Equal(t, 2, assetImageWallContentTier("Installing Linux on the UM690", "https://forum.level1techs.com/t/x", "", "MINISFORUM"))
	// 其他内容中性保留
	require.Equal(t, 1, assetImageWallContentTier("Minisforum 又公布了 UM590 和 UM690 准系统", "https://post.smzdm.com/p/x", "https://qna.smzdm.com/a.png", "MINISFORUM"))
}

// 2026-10-10 数量补位：选择只按打分顺序截断，不再剔除实拍/比例差候选——
// 优质不足时由低优先级候选自然补位（排序保证它们只在优质后面）。

func TestAssetImageWallSelectIndicesFillsLimitAcrossQualityTiers(t *testing.T) {
	infos := []assetImageWallCandidateInfo{
		{Title: "Minisforum UM690 官方产品图", Width: 1920, Height: 1080},     // 优质：匹配0 内容0 比例0
		{Title: "Minisforum UM690 Review 拆机", Width: 1920, Height: 1080}, // 内容2（实拍）
		{Title: "UM690 海报横幅", Width: 4000, Height: 900},                  // Dropped（超宽）
	}
	scores := scoreAssetImageWallCandidates("UM690", "MINISFORUM", infos)

	selected := assetImageWallSelectIndices(scores, 3)

	require.Len(t, selected, 3)
	// 优质第一，实拍与超宽按排序补位在后
	require.Equal(t, 0, selected[0])
	require.Equal(t, 1, selected[1])
	require.Equal(t, 2, selected[2])
}

func TestAssetImageWallSelectIndicesStopsAtLimit(t *testing.T) {
	infos := []assetImageWallCandidateInfo{
		{Title: "Minisforum UM690 官方产品图", Width: 1920, Height: 1080},
		{Title: "Minisforum UM690 准系统", Width: 1200, Height: 800},
		{Title: "Minisforum UM690 使用体验", Width: 1920, Height: 1080},
	}
	scores := scoreAssetImageWallCandidates("UM690", "MINISFORUM", infos)

	selected := assetImageWallSelectIndices(scores, 2)

	require.Len(t, selected, 2)
}

func TestScoreAssetImageWallCandidatesPrefersShowcaseAndRatio(t *testing.T) {
	infos := []assetImageWallCandidateInfo{
		{Title: "Minisforum UM690 Review 拆机", SourceURL: "", Width: 1920, Height: 1080},                                   // 匹配0 内容2(实拍/拆解) 比例0
		{Title: "MINISFORUM UM690 AMD Ryzen 9 迷你主机", SourceURL: "https://www.amazon.com/dp/x", Width: 1600, Height: 1600}, // 匹配0 内容0(商品) 比例2
		{Title: "Minisforum UM690 官方产品图", SourceURL: "", Width: 1200, Height: 800},                                        // 匹配0 内容0 比例1
		{Title: "Minisforum UM690 使用体验", SourceURL: "", Width: 1920, Height: 1080},                                        // 匹配0 内容1 比例0
	}
	scores := scoreAssetImageWallCandidates("UM690", "MINISFORUM", infos)
	// 内容同为 0 时按比例：官方产品图(比例1) 先于 Amazon 方图(比例2)
	require.Equal(t, 2, scores[0].Index)
	require.Equal(t, 1, scores[1].Index)
	// 内容 1 的普通内容先于内容 2 的拆机图（即使拆机图比例更好）
	require.Equal(t, 3, scores[2].Index)
	require.Equal(t, 0, scores[3].Index)
	require.Equal(t, 2, scores[3].ContentTier)
}

func TestServiceAssetLogoSearchQueries(t *testing.T) {
	queries := buildAssetServiceLogoQueriesForVendor("中国联通")
	require.Contains(t, queries, "中国联通 Logo")
	require.Contains(t, queries, "中国联通 品牌标志")
	require.True(t, assetTypeUsesProviderLogo("internet"))
	require.True(t, assetTypeUsesProviderLogo("subscription"))
	require.True(t, assetTypeUsesProviderLogo("domain_name"))
	require.True(t, assetTypeUsesProviderLogo("cloud_host"))
	require.False(t, assetTypeUsesProviderLogo("mini_pc"))
	require.True(t, assetImageWallStockLogoHost("https://www.nipic.com/show/1.html", ""))
	require.True(t, assetImageWallStockLogoHost("", "https://pic.58pic.com/logo.png"))
	require.False(t, assetImageWallStockLogoHost("https://www.10010.com/logo.png", ""))
}
