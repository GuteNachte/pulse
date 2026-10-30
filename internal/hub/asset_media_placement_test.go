package hub

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/stretchr/testify/require"
)

func TestSetAssetMediaPlacementsVisibleUpdatesExistingRecords(t *testing.T) {
	first := core.NewRecord(&core.Collection{})
	first.Set("visible", true)
	second := core.NewRecord(&core.Collection{})
	second.Set("visible", true)

	updated := setAssetMediaPlacementsVisible([]*core.Record{first, second}, false, 7)

	require.Equal(t, 2, updated)
	require.False(t, first.GetBool("visible"))
	require.False(t, second.GetBool("visible"))
	require.Equal(t, 7, first.GetInt("sort_order"))
	require.Equal(t, 7, second.GetInt("sort_order"))
}
