//go:build testing

package hub

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestAssetOnlineAIModelStopsWhenRequestContextIsCancelled(t *testing.T) {
	started := make(chan struct{})
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(started)
		<-release
	}))
	t.Cleanup(func() {
		close(release)
		server.Close()
	})

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	result := make(chan string, 1)
	go func() {
		_, _, message := callAssetOnlineAIModelContext(ctx, assetOnlineAIConfig{
			Endpoint: server.URL,
			APIKey:   "test-key",
			Model:    "test-model",
		}, []byte(`{"model":"test-model"}`))
		result <- message
	}()

	select {
	case <-started:
		cancel()
	case <-time.After(2 * time.Second):
		t.Fatal("AI request did not start")
	}

	select {
	case message := <-result:
		require.Equal(t, "AI 识别请求已取消", message)
	case <-time.After(2 * time.Second):
		t.Fatal("AI request did not stop after context cancellation")
	}
}
