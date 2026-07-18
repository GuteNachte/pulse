package hub

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/stretchr/testify/require"
)

func TestNewAssetMediaEditedRecordsCreatesIndependentImages(t *testing.T) {
	asset := core.NewRecord(&core.Collection{})
	asset.Id = "asset-1"
	asset.Set("name", "UM690")
	mediaCollection := &core.Collection{}
	versionCollection := &core.Collection{}
	placement := assetMediaPlacement{X: 0.21875, Y: 0, Width: 0.5625, Height: 1}

	first := newAssetMediaEditedRecords(mediaCollection, versionCollection, asset, "user-1", "source-media", "source-version", placement, "16:9", []byte("first"), 2)
	second := newAssetMediaEditedRecords(mediaCollection, versionCollection, asset, "user-1", "source-media", "source-version", placement, "16:9", []byte("second"), 3)

	require.NotEmpty(t, first.Media.Id)
	require.NotEmpty(t, first.Version.Id)
	require.NotEqual(t, first.Media.Id, second.Media.Id)
	require.NotEqual(t, first.Version.Id, second.Version.Id)
	require.NotEqual(t, first.ObjectKey, second.ObjectKey)
	require.Equal(t, assetMediaEditedObjectKey(asset.Id, first.Media.Id, first.Version.Id), first.ObjectKey)
	require.Equal(t, "UM690-02", first.Media.GetString("source_title"))
	require.Equal(t, "edit", first.Media.GetString("source_kind"))
	require.Equal(t, "library", first.Media.GetString("state"))
	require.Equal(t, first.Version.Id, first.Media.GetString("active_version"))
	require.Equal(t, "original", first.Version.GetString("kind"))
	require.Equal(t, "image/jpeg", first.Version.GetString("mime_type"))

	recipe, ok := first.Version.Get("recipe").(map[string]any)
	require.True(t, ok)
	require.Equal(t, "source-media", recipe["source_media"])
	require.Equal(t, "source-version", recipe["source_version"])
	require.Equal(t, placement, recipe["placement"])
	_, hasCrop := recipe["crop"]
	require.False(t, hasCrop)
}

func TestAssetMediaEditedObjectKeyContainsBothIds(t *testing.T) {
	require.Equal(t, "originals/asset-1/media-2/version-3.jpg", assetMediaEditedObjectKey("asset-1", "media-2", "version-3"))
}
