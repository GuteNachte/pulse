package migrations

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/stretchr/testify/require"
)

func TestEnsureAssetVisualFileLimitRaisesExistingFieldToFifteen(t *testing.T) {
	collection := core.NewBaseCollection("asset_visuals")
	collection.Fields.Add(&core.FileField{Name: "files", MaxSelect: 10})

	require.True(t, ensureAssetVisualFileLimit(collection, 15))
	field, ok := collection.Fields.GetByName("files").(*core.FileField)
	require.True(t, ok)
	require.Equal(t, 15, field.MaxSelect)
	require.False(t, ensureAssetVisualFileLimit(collection, 15))
}
