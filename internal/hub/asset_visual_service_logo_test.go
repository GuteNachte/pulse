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
