package hub

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestRenderAssetMediaVersionCreatesRealCroppedImage(t *testing.T) {
	canvas := image.NewRGBA(image.Rect(0, 0, 800, 400))
	for y := 0; y < 400; y++ {
		for x := 0; x < 800; x++ {
			canvas.Set(x, y, color.RGBA{R: 20, G: 80, B: 200, A: 255})
		}
	}
	var source bytes.Buffer
	require.NoError(t, png.Encode(&source, canvas))
	result, err := renderAssetMediaVersion(source.Bytes(), assetMediaRecipe{Crop: assetMediaCrop{X: .25, Y: 0, Width: .5, Height: 1}})
	require.NoError(t, err)
	decoded, _, err := image.Decode(bytes.NewReader(result))
	require.NoError(t, err)
	require.Equal(t, 400, decoded.Bounds().Dx())
}

func TestRenderAssetMediaVersionNormalizesFixedRatioOutput(t *testing.T) {
	canvas := image.NewRGBA(image.Rect(0, 0, 1600, 900))
	var source bytes.Buffer
	require.NoError(t, png.Encode(&source, canvas))
	result, err := renderAssetMediaVersion(source.Bytes(), assetMediaRecipe{Crop: assetMediaCrop{X: .125, Y: 0, Width: .75, Height: 1}, OutputWidth: assetMediaOutputWidth("16:9"), OutputHeight: assetMediaOutputHeight("16:9")})
	require.NoError(t, err)
	decoded, _, err := image.Decode(bytes.NewReader(result))
	require.NoError(t, err)
	require.Equal(t, 1600, decoded.Bounds().Dx())
	require.Equal(t, 900, decoded.Bounds().Dy())
}

func TestRenderAssetMediaPlacementPreservesBlackBlankSpace(t *testing.T) {
	canvas := image.NewRGBA(image.Rect(0, 0, 400, 400))
	for y := 0; y < 400; y++ {
		for x := 0; x < 400; x++ {
			canvas.Set(x, y, color.RGBA{R: 220, G: 20, B: 40, A: 255})
		}
	}
	var source bytes.Buffer
	require.NoError(t, png.Encode(&source, canvas))
	placement := assetMediaPlacement{X: .21875, Y: 0, Width: .5625, Height: 1}
	result, err := renderAssetMediaVersion(source.Bytes(), assetMediaRecipe{
		Placement: &placement, OutputWidth: 1600, OutputHeight: 900,
	})
	require.NoError(t, err)
	decoded, _, err := image.Decode(bytes.NewReader(result))
	require.NoError(t, err)
	require.Equal(t, 1600, decoded.Bounds().Dx())
	require.Equal(t, 900, decoded.Bounds().Dy())
	// 2026-10-10 图片编辑专项：空白区域按黑色保存（与预览一致）
	requireAssetMediaColorNear(t, decoded.At(20, 450), color.RGBA{R: 0, G: 0, B: 0, A: 255})
	requireAssetMediaColorNear(t, decoded.At(800, 450), color.RGBA{R: 220, G: 20, B: 40, A: 255})
}

func TestRenderAssetMediaPlacementClipsOverflow(t *testing.T) {
	canvas := image.NewRGBA(image.Rect(0, 0, 400, 400))
	for y := 0; y < 400; y++ {
		for x := 0; x < 400; x++ {
			canvas.Set(x, y, color.RGBA{R: 20, G: 180, B: 70, A: 255})
		}
	}
	var source bytes.Buffer
	require.NoError(t, png.Encode(&source, canvas))
	placement := assetMediaPlacement{X: -.25, Y: 0, Width: .5625, Height: 1}
	result, err := renderAssetMediaVersion(source.Bytes(), assetMediaRecipe{
		Placement: &placement, OutputWidth: 1600, OutputHeight: 900,
	})
	require.NoError(t, err)
	decoded, _, err := image.Decode(bytes.NewReader(result))
	require.NoError(t, err)
	requireAssetMediaColorNear(t, decoded.At(20, 450), color.RGBA{R: 20, G: 180, B: 70, A: 255})
	// 2026-10-10 图片编辑专项：空白区域按黑色保存
	requireAssetMediaColorNear(t, decoded.At(1500, 450), color.RGBA{R: 0, G: 0, B: 0, A: 255})
}

// 2026-10-04 图片专项：输出比例扩展 4:3 与 1:1（与前端裁剪预设一致），旧单比例约束解除
func TestAssetMediaOutputUsesOnlySixteenByNine(t *testing.T) {
	require.Equal(t, 1600, assetMediaOutputWidth("16:9"))
	require.Equal(t, 900, assetMediaOutputHeight("16:9"))
	require.Equal(t, 1200, assetMediaOutputWidth("4:3"))
	require.Equal(t, 900, assetMediaOutputHeight("4:3"))
	require.Equal(t, 1000, assetMediaOutputWidth("1:1"))
	require.Equal(t, 1000, assetMediaOutputHeight("1:1"))
	require.Zero(t, assetMediaOutputWidth("9:16"))
	require.Zero(t, assetMediaOutputHeight("9:16"))
}

// 2026-10-10 图片编辑专项：亮度/对比度调节——亮度 +50 提亮红色、对比度 +50 拉开与白底的差距。

func TestRenderAssetMediaPlacementAppliesBrightnessAdjustment(t *testing.T) {
	canvas := image.NewRGBA(image.Rect(0, 0, 400, 400))
	for y := 0; y < 400; y++ {
		for x := 0; x < 400; x++ {
			canvas.Set(x, y, color.RGBA{R: 220, G: 20, B: 40, A: 255})
		}
	}
	var source bytes.Buffer
	require.NoError(t, png.Encode(&source, canvas))
	placement := assetMediaPlacement{X: .21875, Y: 0, Width: .5625, Height: 1}
	result, err := renderAssetMediaVersion(source.Bytes(), assetMediaRecipe{
		Placement: &placement, OutputWidth: 1600, OutputHeight: 900,
		Adjustments: assetMediaAdjustments{Brightness: 50},
	})
	require.NoError(t, err)
	decoded, _, err := image.Decode(bytes.NewReader(result))
	require.NoError(t, err)
	// 红色像素被提亮（原 R=220 → 更接近 255；G/B 通道变亮但仍是红色主导）
	sample := color.RGBAModel.Convert(decoded.At(800, 450)).(color.RGBA)
	require.Greater(t, int(sample.R), 230)
	require.Less(t, int(sample.G), 160)
}

func TestRenderAssetMediaPlacementClampsExtremeAdjustments(t *testing.T) {
	canvas := image.NewRGBA(image.Rect(0, 0, 400, 400))
	for y := 0; y < 400; y++ {
		for x := 0; x < 400; x++ {
			canvas.Set(x, y, color.RGBA{R: 220, G: 20, B: 40, A: 255})
		}
	}
	var source bytes.Buffer
	require.NoError(t, png.Encode(&source, canvas))
	placement := assetMediaPlacement{X: .21875, Y: 0, Width: .5625, Height: 1}
	// 超界参数被 clamp 到 ±100：亮度 -100 全黑
	result, err := renderAssetMediaVersion(source.Bytes(), assetMediaRecipe{
		Placement: &placement, OutputWidth: 1600, OutputHeight: 900,
		Adjustments: assetMediaAdjustments{Brightness: -200},
	})
	require.NoError(t, err)
	decoded, _, err := image.Decode(bytes.NewReader(result))
	require.NoError(t, err)
	sample := color.RGBAModel.Convert(decoded.At(800, 450)).(color.RGBA)
	require.InDelta(t, 0, int(sample.R), 8)
	require.InDelta(t, 0, int(sample.G), 8)
	require.InDelta(t, 0, int(sample.B), 8)
}

func requireAssetMediaColorNear(t testing.TB, actual color.Color, expected color.RGBA) {
	t.Helper()
	converted := color.RGBAModel.Convert(actual).(color.RGBA)
	require.InDelta(t, expected.R, converted.R, 8)
	require.InDelta(t, expected.G, converted.G, 8)
	require.InDelta(t, expected.B, converted.B, 8)
}
