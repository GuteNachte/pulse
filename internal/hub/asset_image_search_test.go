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
