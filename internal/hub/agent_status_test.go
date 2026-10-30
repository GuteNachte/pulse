package hub_test

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
	pulseTests "gutenacht.site/pulse/internal/tests"
)

func TestAgentStatusRequiresValidAgentToken(t *testing.T) {
	hub, user := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	system, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":              "status-test-system",
		"users":             []string{user.Id},
		"pairing_confirmed": true,
		"status":            "up",
	})
	require.NoError(t, err)
	_, err = pulseTests.CreateRecord(hub, "fingerprints", map[string]any{
		"system":      system.Id,
		"token":       "status-agent-token",
		"fingerprint": "status-agent-fingerprint",
	})
	require.NoError(t, err)

	response := performTestAPIRequest(t, hub.TestApp, http.MethodGet, "/api/pulse/agent-status", nil, map[string]string{
		"X-Token": "status-agent-token",
	})
	require.Equal(t, http.StatusOK, response.Status)
	require.Contains(t, response.Body, `"status":"pending"`)

	response = performTestAPIRequest(t, hub.TestApp, http.MethodGet, "/api/pulse/agent-status", nil, map[string]string{
		"X-Token": "wrong-token",
	})
	require.Equal(t, http.StatusUnauthorized, response.Status)
}
