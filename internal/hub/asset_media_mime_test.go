package hub

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestDetectAssetMediaMimeTypeUsesImageBytes(t *testing.T) {
	canvas := image.NewRGBA(image.Rect(0, 0, 2, 2))
	canvas.Set(0, 0, color.White)

	var jpegSource bytes.Buffer
	require.NoError(t, jpeg.Encode(&jpegSource, canvas, nil))
	var pngSource bytes.Buffer
	require.NoError(t, png.Encode(&pngSource, canvas))

	require.Equal(t, "image/jpeg", detectAssetMediaMimeType(jpegSource.Bytes()))
	require.Equal(t, "image/png", detectAssetMediaMimeType(pngSource.Bytes()))
	require.Equal(t, "image/webp", detectAssetMediaMimeType([]byte("RIFF\x10\x00\x00\x00WEBPVP8 ")))
	require.Empty(t, detectAssetMediaMimeType([]byte("not-an-image")))
}
