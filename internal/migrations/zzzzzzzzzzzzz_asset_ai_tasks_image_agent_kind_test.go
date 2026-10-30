package migrations

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/stretchr/testify/require"
)

func TestEnsureAITasksImageAgentKind(t *testing.T) {
	collection := core.NewBaseCollection("ai_tasks")
	collection.Fields.Add(&core.SelectField{
		Name:      "kind",
		MaxSelect: 1,
		Values:    []string{"asset_enrichment", "asset_visual"},
	})

	require.True(t, ensureSelectFieldValue(collection, "kind", "image_agent"))
	field, ok := collection.Fields.GetByName("kind").(*core.SelectField)
	require.True(t, ok)
	require.Contains(t, field.Values, "image_agent")
	require.False(t, ensureSelectFieldValue(collection, "kind", "image_agent"))
}
