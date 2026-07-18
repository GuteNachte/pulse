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

func TestRenderAssetMediaPlacementPreservesWhiteBlankSpace(t *testing.T) {
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
	requireAssetMediaColorNear(t, decoded.At(20, 450), color.RGBA{R: 255, G: 255, B: 255, A: 255})
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
	requireAssetMediaColorNear(t, decoded.At(1500, 450), color.RGBA{R: 255, G: 255, B: 255, A: 255})
}

func TestAssetMediaOutputUsesOnlySixteenByNine(t *testing.T) {
	require.Equal(t, 1600, assetMediaOutputWidth("16:9"))
	require.Equal(t, 900, assetMediaOutputHeight("16:9"))
	require.Zero(t, assetMediaOutputWidth("4:3"))
	require.Zero(t, assetMediaOutputHeight("4:3"))
}

func requireAssetMediaColorNear(t testing.TB, actual color.Color, expected color.RGBA) {
	t.Helper()
	converted := color.RGBAModel.Convert(actual).(color.RGBA)
	require.InDelta(t, expected.R, converted.R, 8)
	require.InDelta(t, expected.G, converted.G, 8)
	require.InDelta(t, expected.B, converted.B, 8)
}
