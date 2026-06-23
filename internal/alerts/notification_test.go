//go:build testing

package alerts_test

import (
	"strings"
	"sync"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/stretchr/testify/require"
	"gutenacht.site/pulse/internal/alerts"
	pulseTests "gutenacht.site/pulse/internal/tests"
)

type webhookRecorder struct {
	mu       sync.Mutex
	requests []string
	bodies   []string
}

func newWebhookRecorder(t *testing.T) *webhookRecorder {
	t.Helper()

	recorder := &webhookRecorder{}
	restoreSender := alerts.SetShoutrrrSenderForTest(func(url string, message string) error {
		recorder.mu.Lock()
		recorder.requests = append(recorder.requests, url)
		recorder.bodies = append(recorder.bodies, message)
		recorder.mu.Unlock()
		return nil
	})
	t.Cleanup(restoreSender)
	return recorder
}

func (r *webhookRecorder) URL(path string) string {
	return "generic+http://pulse.test" + path
}

func (r *webhookRecorder) Count() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.requests)
}

func (r *webhookRecorder) CountPath(path string) int {
	r.mu.Lock()
	defer r.mu.Unlock()
	count := 0
	for _, request := range r.requests {
		if strings.Contains(request, path) {
			count++
		}
	}
	return count
}

func (r *webhookRecorder) LastBody() string {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.bodies) == 0 {
		return ""
	}
	return r.bodies[len(r.bodies)-1]
}

func setUserWebhook(t *testing.T, hub core.App, userID, webhookURL string) {
	t.Helper()

	userSettings, err := hub.FindFirstRecordByFilter("user_settings", "user={:user}", map[string]any{"user": userID})
	if err != nil {
		userSettings, err = pulseTests.CreateRecord(hub, "user_settings", map[string]any{
			"user": userID,
		})
		require.NoError(t, err)
	}

	userSettings.Set("settings", map[string]any{
		"webhooks": []string{webhookURL},
	})
	require.NoError(t, hub.Save(userSettings))
}
