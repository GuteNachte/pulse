package hub

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNormalizeAssetVisualImageTrimsUniformPaddingAndBoundsSize(t *testing.T) {
	canvas := image.NewRGBA(image.Rect(0, 0, 2400, 1800))
	for y := 0; y < 1800; y++ {
		for x := 0; x < 2400; x++ {
			canvas.Set(x, y, color.RGBA{R: 255, G: 255, B: 255, A: 255})
		}
	}
	for y := 300; y < 1500; y++ {
		for x := 900; x < 1500; x++ {
			canvas.Set(x, y, color.RGBA{R: 35, G: 38, B: 42, A: 255})
		}
	}

	var source bytes.Buffer
	require.NoError(t, jpeg.Encode(&source, canvas, &jpeg.Options{Quality: 92}))

	processed, err := normalizeAssetVisualImage(source.Bytes(), "candidate.jpg")
	require.NoError(t, err)
	require.Equal(t, "image/jpeg", processed.ContentType)
	require.True(t, processed.Trimmed)
	require.Less(t, processed.Width, 1600)
	require.LessOrEqual(t, processed.Height, 1600)

	decoded, _, err := image.Decode(bytes.NewReader(processed.Bytes))
	require.NoError(t, err)
	bounds := decoded.Bounds()
	require.Equal(t, processed.Width, bounds.Dx())
	require.Equal(t, processed.Height, bounds.Dy())
}
