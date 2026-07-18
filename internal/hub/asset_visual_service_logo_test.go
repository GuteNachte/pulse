package hub

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/stretchr/testify/require"
)

func TestProviderLogoVisualAcceptsServiceLogoButRejectsItForDevices(t *testing.T) {
	service := core.NewRecord(core.NewBaseCollection("assets"))
	service.Set("type", "internet")
	service.Set("name", "宽带")
	service.Set("vendor", "联通")

	logo := map[string]any{
		"title":     "中国联通官方 Logo",
		"url":       "https://cdn.example.com/china-unicom-logo.png",
		"image_url": "https://cdn.example.com/china-unicom-logo.png",
		"type":      "official_brand_logo",
	}

	require.True(t, assetUsesProviderLogoVisual(service))
	require.True(t, assetVisualReferenceSourceAccepted(service, logo))
	require.True(t, assetVisualAIReferenceSourceAllowed(service, "https://www.10010.com/assets/china-unicom-logo.png"))
	frames := (&Hub{}).buildCollectedAssetVisualFrames(service, []map[string]any{logo}, 1, "")
	require.Len(t, frames, 1)
	require.Equal(t, "provider_logo", frames[0]["presentation"])

	device := core.NewRecord(core.NewBaseCollection("assets"))
	device.Set("type", "phone")
	device.Set("name", "Redmi K50")
	require.False(t, assetUsesProviderLogoVisual(device))
	require.False(t, assetVisualReferenceSourceAccepted(device, logo))
}

func TestProviderLogoVisualNormalizesSmallOfficialSiteIcon(t *testing.T) {
	canvas := image.NewRGBA(image.Rect(0, 0, assetVisualMinLogoDimension, assetVisualMinLogoDimension))
	canvas.Set(8, 8, color.NRGBA{R: 238, G: 30, B: 65, A: 255})
	var encoded bytes.Buffer
	require.NoError(t, png.Encode(&encoded, canvas))

	processed, err := normalizeAssetServiceLogoImage(encoded.Bytes(), "https://www.google.com/s2/favicons?domain=www.10010.com&sz=128")
	require.NoError(t, err)
	require.Equal(t, assetVisualMinLogoCanvas, processed.Width)
	require.Equal(t, assetVisualMinLogoCanvas, processed.Height)
}

func TestProviderLogoVisualRejectsGoogleFaviconFallback(t *testing.T) {
	service := core.NewRecord(core.NewBaseCollection("assets"))
	service.Set("type", "internet")
	service.Set("vendor", "联通")

	fallback := map[string]any{
		"title":     "联通 官方站点图标",
		"url":       "https://www.10010.com/favicon.ico",
		"image_url": "https://www.google.com/s2/favicons?domain=www.10010.com&sz=128",
	}

	require.False(t, assetVisualReferenceSourceAccepted(service, fallback))
}

func TestBingServiceLogoCandidatesRequireProviderMatch(t *testing.T) {
	service := core.NewRecord(core.NewBaseCollection("assets"))
	service.Set("type", "internet")
	service.Set("vendor", "联通")
	body := `<html><body>
		<a class="iusc" m='{"murl":"https://img.example.com/china-unicom-logo.png","purl":"https://example.com/china-unicom","t":"中国联通品牌 Logo"}'></a>
		<a class="iusc" m='{"murl":"https://img.example.com/china-mobile-logo.png","purl":"https://example.com/china-mobile","t":"中国移动品牌 Logo"}'></a>
	</body></html>`

	result := (&Hub{}).collectAssetVisualBingServiceLogoSourcesFromBody(service, body, "中国联通 Logo", nil, map[string]bool{}, 1)

	require.Len(t, result, 1)
	require.Equal(t, "bing_images", result[0]["provider"])
	require.Equal(t, "中国联通品牌 Logo", result[0]["title"])
}

func TestBingServiceLogoCandidatesRejectWatermarkedMarketplaceSources(t *testing.T) {
	service := core.NewRecord(core.NewBaseCollection("assets"))
	service.Set("type", "internet")
	service.Set("vendor", "联通")
	body := `<html><body>
		<a class="iusc" m='{"murl":"https://pic.nximg.cn/china-unicom-logo.jpg","purl":"https://www.nipic.com/show/china-unicom-logo.html","t":"中国联通品牌 Logo"}'></a>
		<a class="iusc" m='{"murl":"https://assets.example.com/china-unicom-logo.png","purl":"https://assets.example.com/china-unicom-logo","t":"中国联通品牌 Logo"}'></a>
	</body></html>`

	result := (&Hub{}).collectAssetVisualBingServiceLogoSourcesFromBody(service, body, "中国联通 Logo", nil, map[string]bool{}, 2)

	require.Len(t, result, 1)
	require.Equal(t, "https://assets.example.com/china-unicom-logo", result[0]["source_url"])
}

func TestServiceLogoCandidateRejectsDemoAndMaterialSources(t *testing.T) {
	for _, candidate := range []map[string]any{
		{
			"title":      "纯CSS3绘制中国联通logo图标样式",
			"source_url": "https://www.17sucai.com/pins/16990.html",
			"image_url":  "https://img.17sucai.com/china-unicom-logo.png",
		},
		{
			"title":      "中国联通logo标志PNG图片素材下载",
			"source_url": "https://www.pngsucai.com/png/8824590.html",
			"image_url":  "https://pic.pngsucai.com/china-unicom-logo.webp",
		},
	} {
		require.False(t, assetVisualServiceLogoCandidateSourceAllowed(candidate))
	}
}

func TestServiceLogoRasterRejectsPhotoLikeImages(t *testing.T) {
	cleanLogo := image.NewRGBA(image.Rect(0, 0, 160, 80))
	for y := 0; y < 80; y++ {
		for x := 0; x < 160; x++ {
			cleanLogo.Set(x, y, color.NRGBA{R: 255, G: 255, B: 255, A: 255})
		}
	}
	for y := 16; y < 64; y++ {
		for x := 16; x < 64; x++ {
			cleanLogo.Set(x, y, color.NRGBA{R: 225, G: 20, B: 45, A: 255})
		}
	}
	require.True(t, isLikelyAssetServiceLogoRaster(cleanLogo))

	photoLike := image.NewRGBA(image.Rect(0, 0, 96, 96))
	for y := 0; y < 96; y++ {
		for x := 0; x < 96; x++ {
			photoLike.Set(x, y, color.NRGBA{R: uint8((x*17 + y*13) % 256), G: uint8((x*11 + y*19) % 256), B: uint8((x*23 + y*7) % 256), A: 255})
		}
	}
	require.False(t, isLikelyAssetServiceLogoRaster(photoLike))
}

func TestProviderLogoVisualKeepsSeveralCandidatesForManualConfirmation(t *testing.T) {
	service := core.NewRecord(core.NewBaseCollection("assets"))
	service.Set("type", "internet")

	require.Equal(t, 4, assetVisualReferenceLimit(service, defaultAssetVisualCandidateCount))
	require.Equal(t, 4, assetVisualCandidateFrameCount(service))
}

func TestDeviceVisualKeepsFifteenCandidatesWhileServiceLogoKeepsFour(t *testing.T) {
	device := core.NewRecord(core.NewBaseCollection("assets"))
	device.Set("type", "mini_pc")
	service := core.NewRecord(core.NewBaseCollection("assets"))
	service.Set("type", "internet")

	require.Equal(t, 15, normalizeAssetVisualMaxImages(18))
	require.Equal(t, 15, assetVisualReferenceLimit(device, 15))
	require.Equal(t, 15, assetVisualCandidateFrameCount(device))
	require.Equal(t, 4, assetVisualReferenceLimit(service, 15))
	require.Equal(t, 4, assetVisualCandidateFrameCount(service))
}
