package hub

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/stretchr/testify/require"
)

func TestAssetMediaStoreRejectsEscapingObjectKey(t *testing.T) {
	store := newAssetMediaStore(t.TempDir())
	_, err := store.pathFor("../secret.jpg")
	require.ErrorContains(t, err, "对象键无效")
}

func TestAssetMediaStoreAtomicallyWritesAndReadsObject(t *testing.T) {
	store := newAssetMediaStore(t.TempDir())
	key, err := store.write("temporary/a.jpg", []byte("image"))
	require.NoError(t, err)
	content, err := os.ReadFile(filepath.Join(store.root, filepath.FromSlash(key)))
	require.NoError(t, err)
	require.Equal(t, []byte("image"), content)
}

func TestAssetMediaStoreRemovesObject(t *testing.T) {
	store := newAssetMediaStore(t.TempDir())
	_, err := store.write("temporary/a.jpg", []byte("image"))
	require.NoError(t, err)
	require.NoError(t, store.remove("temporary/a.jpg"))
	_, err = os.Stat(filepath.Join(store.root, "temporary", "a.jpg"))
	require.ErrorIs(t, err, os.ErrNotExist)
}

func TestAssetMediaLibraryNameUsesDeviceNameAndImageNumber(t *testing.T) {
	asset := core.NewRecord(&core.Collection{})
	asset.Set("name", "宽带")

	require.Equal(t, "宽带-01", assetMediaLibraryName(asset, 1))
	require.Equal(t, "宽带-12", assetMediaLibraryName(asset, 12))
}

func TestNextAssetMediaLibraryNumberUsesFirstAvailableStableNumber(t *testing.T) {
	asset := core.NewRecord(&core.Collection{})
	asset.Set("name", "UM690")
	first := core.NewRecord(&core.Collection{})
	first.Set("source_title", "UM690-01")
	first.Set("state", "library")
	third := core.NewRecord(&core.Collection{})
	third.Set("source_title", "UM690-03")
	third.Set("state", "candidate")
	deletedSecond := core.NewRecord(&core.Collection{})
	deletedSecond.Set("source_title", "UM690-02")
	deletedSecond.Set("state", "deleted")

	require.Equal(t, 2, nextAssetMediaLibraryNumber(asset, []*core.Record{third, deletedSecond, first}))
}
