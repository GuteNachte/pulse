package hub

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestGetAgentHubURL(t *testing.T) {
	t.Run("keeps non-local app url", func(t *testing.T) {
		assert.Equal(t, "https://hub.example.com:8090", getAgentHubURL("https://hub.example.com:8090/"))
	})

	t.Run("honors override", func(t *testing.T) {
		t.Setenv("AGENT_HUB_URL", "http://192.168.1.10:8090/")
		assert.Equal(t, "http://192.168.1.10:8090", getAgentHubURL("http://localhost:8090"))
	})

	t.Run("keeps local app url port when replacing host", func(t *testing.T) {
		assert.Contains(t, getAgentHubURL("http://localhost:8090"), ":8090")
	})
}

func TestFirstNonEmptyString(t *testing.T) {
	assert.Equal(t, "http://localhost:8090", firstNonEmptyString("", "  ", "http://localhost:8090"))
}

func TestProductionStaticFilesDoNotFallbackToIndex(t *testing.T) {
	assert.True(t, embeddedStaticFileExists("/sw.js"))
	assert.True(t, embeddedStaticFileExists("/static/manifest.json"))
	assert.False(t, embeddedStaticFileExists("/system/example"))
	assert.Equal(t, "no-cache", staticCacheControl("/sw.js"))
	assert.Equal(t, "public, max-age=2592000", staticCacheControl("/static/manifest.json"))
}
