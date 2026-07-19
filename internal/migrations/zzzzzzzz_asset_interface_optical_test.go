package migrations

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/stretchr/testify/require"
)

func TestEnsureSelectFieldValueAddsOpticalOnce(t *testing.T) {
	collection := core.NewBaseCollection("asset_interfaces")
	collection.Fields.Add(&core.SelectField{Name: "kind", Values: []string{"ethernet", "pon"}, MaxSelect: 1})

	require.True(t, ensureSelectFieldValue(collection, "kind", "optical"))
	field, ok := collection.Fields.GetByName("kind").(*core.SelectField)
	require.True(t, ok)
	require.Equal(t, []string{"ethernet", "pon", "optical"}, field.Values)
	require.False(t, ensureSelectFieldValue(collection, "kind", "optical"))
}
