package migrations

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/stretchr/testify/require"
)

func TestEnsureAssetMediaEditSourceKind(t *testing.T) {
	collection := core.NewBaseCollection("asset_media")
	collection.Fields.Add(&core.SelectField{
		Name:      "source_kind",
		MaxSelect: 1,
		Values:    []string{"search", "upload", "url_import", "legacy_visual"},
	})

	require.True(t, ensureAssetMediaEditSourceKind(collection))
	field, ok := collection.Fields.GetByName("source_kind").(*core.SelectField)
	require.True(t, ok)
	require.Contains(t, field.Values, "edit")
	require.False(t, ensureAssetMediaEditSourceKind(collection))
}
