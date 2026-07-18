package migrations

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/stretchr/testify/require"
)

func TestEnsureSelectFieldValueAddsPONOnce(t *testing.T) {
	collection := core.NewBaseCollection("asset_interfaces")
	collection.Fields.Add(&core.SelectField{Name: "kind", Values: []string{"ethernet", "wan"}, MaxSelect: 1})

	require.True(t, ensureSelectFieldValue(collection, "kind", "pon"))
	field, ok := collection.Fields.GetByName("kind").(*core.SelectField)
	require.True(t, ok)
	require.Equal(t, []string{"ethernet", "wan", "pon"}, field.Values)
	require.False(t, ensureSelectFieldValue(collection, "kind", "pon"))
}
