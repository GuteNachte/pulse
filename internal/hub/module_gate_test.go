//go:build testing

package hub_test

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
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
}
