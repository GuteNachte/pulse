package hub

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestAssetVisualAccuracyReviewKeepsConfiguredVisionModel(t *testing.T) {
	config := (&Hub{}).assetVisualAIConfigFromSettings(map[string]any{
		"base_url": "https://apihub.agnes-ai.com/v1",
		"ai": map[string]any{
			"enabled": true,
			"api_key": "test-key",
			"model":   "agnes-2.0-flash",
		},
		"visual_ai": map[string]any{
			"enabled": true,
			"api_key": "test-key",
			"model":   "agnes-image-2.1-flash",
		},
	})

	require.Equal(t, "agnes-image-2.1-flash", config.Model)
}
