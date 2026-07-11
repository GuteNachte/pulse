package systems

import (
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/store"
	"github.com/pocketbase/pocketbase/tools/subscriptions"
	"github.com/stretchr/testify/require"
	"gutenacht.site/pulse/internal/alerts"
	entitySystem "gutenacht.site/pulse/internal/entities/system"
)

type realtimeTestHub struct {
	core.App
}

func (realtimeTestHub) HandleSystemAlerts(*core.Record, *entitySystem.CombinedData) error {
	return nil
}

func (realtimeTestHub) HandleStatusAlerts(string, *core.Record) error {
	return nil
}

func (realtimeTestHub) CancelPendingStatusAlerts(string) {}

func (realtimeTestHub) SendAlert(alerts.AlertMessageData) error {
	return nil
}

func (realtimeTestHub) MakeLink(parts ...string) string {
	return "https://example.test/" + strings.Join(parts, "/")
}

func TestRealtimeSubscriptionsAreScopedToSystemManager(t *testing.T) {
	first := &SystemManager{
		systems:             store.New(map[string]*System{}),
		activeSubscriptions: make(map[string]*subscriptionInfo),
	}
	second := &SystemManager{
		systems:             store.New(map[string]*System{}),
		activeSubscriptions: make(map[string]*subscriptionInfo),
	}

	topic := `rt_metrics?options={"query":{"system":"system-1"}}`
	first.registerRealtimeSubscription("system-1", topic, "user-1")

	require.Len(t, first.activeSubscriptions, 1)
	require.Empty(t, second.activeSubscriptions)
}

func TestRealtimeSubscriptionRemovalDoesNotUnderflow(t *testing.T) {
	sm := &SystemManager{
		systems:             store.New(map[string]*System{}),
		activeSubscriptions: make(map[string]*subscriptionInfo),
	}
	topic := `rt_metrics?options={"query":{"system":"system-1"}}`
	sm.registerRealtimeSubscription("system-1", topic, "user-1")

	sm.removeRealtimeSubscription(topic, "user-1")
	sm.removeRealtimeSubscription(topic, "user-1")

	require.Empty(t, sm.activeSubscriptions)
}

func TestDisableRealtimeForUserUnsubscribesMetrics(t *testing.T) {
	app, err := tests.NewTestApp()
	require.NoError(t, err)
	defer app.Cleanup()

	authCollection, err := app.FindCachedCollectionByNameOrId("users")
	require.NoError(t, err)
	auth := core.NewRecord(authCollection)
	auth.Set("email", "realtime-test@example.com")
	auth.Set("password", "password123")
	require.NoError(t, app.Save(auth))

	client := subscriptions.NewDefaultClient()
	client.Set(apis.RealtimeClientAuthKey, auth)
	topic := `rt_metrics?options={"query":{"system":"system-1"}}`
	client.Subscribe(topic)
	app.SubscriptionsBroker().Register(client)

	sm := &SystemManager{
		hub:                 realtimeTestHub{App: app},
		systems:             store.New(map[string]*System{}),
		activeSubscriptions: make(map[string]*subscriptionInfo),
		workerRunning:       true,
		tickerStopChan:      make(chan struct{}),
	}
	sm.registerRealtimeSubscription("system-1", topic, auth.Id)

	sm.DisableRealtimeForUser(auth.Id)

	require.False(t, client.HasSubscription(topic))
	require.Empty(t, sm.activeSubscriptions)
	require.False(t, sm.workerRunning)
}
