package hub

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestAssetMediaLibraryFilterExcludesDeletedMedia(t *testing.T) {
	require.Equal(t,
		"asset = {:asset} && user = {:user} && state != 'deleted'",
		assetMediaLibraryFilter(),
	)
}
