package hub

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"os"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/stretchr/testify/require"
)

func TestLegacyAssetMediaRenderObjectKey(t *testing.T) {
	require.True(t, isLegacyAssetMediaRenderObjectKey("renders/a/m/.jpg"))
	require.False(t, isLegacyAssetMediaRenderObjectKey("renders/a/m/version.jpg"))
	require.Equal(t, "renders/a/m/version.jpg", assetMediaRenderObjectKey("a", "m", "version"))
}

func TestRepairLegacyAssetMediaRenderVersionRebuildsUniqueCrop(t *testing.T) {
	canvas := image.NewRGBA(image.Rect(0, 0, 400, 400))
	for y := 0; y < 400; y++ {
		for x := 0; x < 400; x++ {
			if x < 200 {
				canvas.Set(x, y, color.RGBA{R: 240, A: 255})
			} else {
				canvas.Set(x, y, color.RGBA{B: 240, A: 255})
			}
		}
	}
	var source bytes.Buffer
	require.NoError(t, png.Encode(&source, canvas))
	store := newAssetMediaStore(t.TempDir())
	_, err := store.write("originals/asset/media/original", source.Bytes())
	require.NoError(t, err)

	parent := core.NewRecord(&core.Collection{})
	parent.Id = "original-version"
	parent.Set("object_key", "originals/asset/media/original")
	left := newLegacyAssetMediaRenderRecord("left-version", assetMediaCrop{X: 0, Y: 0.359375, Width: 0.5, Height: 0.28125})
	right := newLegacyAssetMediaRenderRecord("right-version", assetMediaCrop{X: 0.5, Y: 0.359375, Width: 0.5, Height: 0.28125})

	changed, err := repairLegacyAssetMediaRenderVersion(store, left, parent)
	require.NoError(t, err)
	require.True(t, changed)
	changed, err = repairLegacyAssetMediaRenderVersion(store, right, parent)
	require.NoError(t, err)
	require.True(t, changed)
	require.NotEqual(t, left.GetString("object_key"), right.GetString("object_key"))

	leftImage := readAssetMediaRepairTestImage(t, store, left.GetString("object_key"))
	rightImage := readAssetMediaRepairTestImage(t, store, right.GetString("object_key"))
	leftCenter := color.RGBAModel.Convert(leftImage.At(800, 450)).(color.RGBA)
	rightCenter := color.RGBAModel.Convert(rightImage.At(800, 450)).(color.RGBA)
	require.Greater(t, leftCenter.R, uint8(180))
	require.Less(t, leftCenter.B, uint8(80))
	require.Greater(t, rightCenter.B, uint8(180))
	require.Less(t, rightCenter.R, uint8(80))

	leftKey := left.GetString("object_key")
	changed, err = repairLegacyAssetMediaRenderVersion(store, left, parent)
	require.NoError(t, err)
	require.False(t, changed)
	require.Equal(t, leftKey, left.GetString("object_key"))
}

func newLegacyAssetMediaRenderRecord(id string, crop assetMediaCrop) *core.Record {
	version := core.NewRecord(&core.Collection{})
	version.Id = id
	version.Set("asset", "asset")
	version.Set("media", "media")
	version.Set("kind", "render")
	version.Set("object_key", "renders/asset/media/.jpg")
	version.Set("recipe", map[string]any{"crop": crop, "ratio": "16:9"})
	return version
}

func readAssetMediaRepairTestImage(t *testing.T, store *assetMediaStore, key string) image.Image {
	t.Helper()
	path, err := store.pathFor(key)
	require.NoError(t, err)
	content, err := os.ReadFile(path)
	require.NoError(t, err)
	decoded, _, err := image.Decode(bytes.NewReader(content))
	require.NoError(t, err)
	return decoded
}
