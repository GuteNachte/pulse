//go:build testing

package hub_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	pulseHub "gutenacht.site/pulse/internal/hub"
	pulseTests "gutenacht.site/pulse/internal/tests"
)

func TestModuleGateReturnsExplicitDisabledStatus(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	_, err := pulseTests.CreateRecord(hub, "module_settings", map[string]any{
		"user":      user.Id,
		"module_id": "client-monitoring",
		"enabled":   false,
	})
	require.NoError(t, err)
	token, err := user.NewAuthToken()
	require.NoError(t, err)

	response := performTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodGet,
		"/api/pulse/containers",
		nil,
		map[string]string{"Authorization": token},
	)
	require.Equal(t, http.StatusServiceUnavailable, response.Status, response.Body)
	require.Contains(t, response.Body, `"code":"module_disabled"`)
	require.Contains(t, response.Body, `"module_id":"client-monitoring"`)

	collectionResponse := performTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodGet,
		"/api/collections/containers/records",
		nil,
		map[string]string{"Authorization": token},
	)
	require.Equal(t, http.StatusServiceUnavailable, collectionResponse.Status, collectionResponse.Body)
	require.Contains(t, collectionResponse.Body, `"code":"module_disabled"`)
	require.Contains(t, collectionResponse.Body, `"module_id":"client-monitoring"`)
}

func TestAgentPairIsBlockedWhenAgentManagementIsDisabled(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	asset, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user": user.Id,
		"name": "pair-target",
		"type": "physical_host",
	})
	require.NoError(t, err)
	_, err = pulseTests.CreateRecord(hub, "module_settings", map[string]any{
		"user":      user.Id,
		"module_id": "agent-management",
		"enabled":   false,
	})
	require.NoError(t, err)
	_, err = pulseTests.CreateRecord(hub, "agent_pairing_codes", map[string]any{
		"code":       "111222",
		"user":       user.Id,
		"asset":      asset.Id,
		"expires_at": "2099-01-01 00:00:00.000Z",
	})
	require.NoError(t, err)

	response := performTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/pulse/agent-pair",
		strings.NewReader(`{"code":"111222","hostname":"blocked-agent","fingerprint":"fingerprint","platform":"linux","arch":"amd64","agent_version":"1.0.6","install_method":"docker","run_mode":"linux-container"}`),
		map[string]string{"X-Forwarded-For": "192.168.1.20"},
	)
	require.Equal(t, http.StatusServiceUnavailable, response.Status, response.Body)
	require.Contains(t, response.Body, `"code":"module_disabled"`)
	require.Contains(t, response.Body, `"module_id":"agent-management"`)
}

func TestRealtimeSubscriptionMapsToOwningModule(t *testing.T) {
	tests := []struct {
		topic  string
		module string
		ok     bool
	}{
		{topic: "rt_metrics?options={\"query\":{\"system\":\"sys1\"}}", module: "client-monitoring", ok: true},
		{topic: "systems/*", module: "client-monitoring", ok: true},
		{topic: "website_monitors/*", module: "website-monitoring", ok: true},
		{topic: "unknown/*", ok: false},
	}

	for _, tt := range tests {
		t.Run(tt.topic, func(t *testing.T) {
			module, ok := pulseHub.RealtimeSubscriptionModule(tt.topic)
			if module != tt.module || ok != tt.ok {
				t.Fatalf("realtimeSubscriptionModule(%q) = (%q, %t), want (%q, %t)", tt.topic, module, ok, tt.module, tt.ok)
			}
		})
	}
}
