package migrations

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/stretchr/testify/require"
)

func TestEnsureAssetTypeSelectValuesAddsMissingAssetTypes(t *testing.T) {
	collection := core.NewBaseCollection("assets")
	collection.Fields.Add(&core.SelectField{
		Name:   "type",
		Values: []string{"internet", "physical_host", "ont", "custom"},
	})

	require.True(t, ensureAssetTypeSelectValues(collection))
	field, ok := collection.Fields.GetByName("type").(*core.SelectField)
	require.True(t, ok)
	require.Subset(t, field.Values, []string{
		"internet",
		"ont",
		"smart_ont",
		"subscription",
		"domain_name",
		"cloud_host",
		"smart_switch",
		"vm",
		"custom",
	})
	// 追加不能打乱历史值顺序，避免已有数据展示顺序变化。
	require.Equal(t, []string{"internet", "physical_host", "ont", "custom"}, field.Values[:4])
	require.False(t, ensureAssetTypeSelectValues(collection))
}

func TestEnsureAssetTypeSelectValuesIgnoresCollectionWithoutTypeSelect(t *testing.T) {
	collection := core.NewBaseCollection("assets")
	collection.Fields.Add(&core.TextField{Name: "type"})

	require.False(t, ensureAssetTypeSelectValues(collection))
	require.False(t, ensureAssetTypeSelectValues(nil))
}
