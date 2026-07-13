package hub

import (
	"encoding/json"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/stretchr/testify/require"
)

func TestAssetVisualVerificationPayloadSendsOnlyLocalImageData(t *testing.T) {
	asset := core.NewRecord(core.NewBaseCollection("assets"))
	asset.Set("type", "phone")
	asset.Set("vendor", "Xiaomi")
	asset.Set("model", "Redmi K50")

	payload, err := buildAssetVisualVerificationPayload(asset, "墨羽", []assetVisualVerificationInput{{
		Index:   0,
		DataURI: "data:image/jpeg;base64,ZmFrZQ==",
	}}, "agnes-2.0-flash")

	require.NoError(t, err)
	encoded, err := json.Marshal(payload)
	require.NoError(t, err)
	require.Contains(t, string(encoded), "data:image/jpeg;base64,ZmFrZQ==")
	require.NotContains(t, string(encoded), "search_keywords")
	require.Contains(t, string(encoded), "accepted")
}

func TestAssetVisualVerificationBatchesRespectProviderImageLimit(t *testing.T) {
	inputs := []assetVisualVerificationInput{{Index: 0}, {Index: 1}, {Index: 2}, {Index: 3}, {Index: 4}, {Index: 5}}

	batches := splitAssetVisualVerificationInputs(inputs)

	require.Len(t, batches, 2)
	require.Len(t, batches[0], 4)
	require.Len(t, batches[1], 2)
}
