//go:build testing

package hub_test

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	pulseTests "gutenacht.site/pulse/internal/tests"
)

func TestNetworkTopologyLegacyCollectionsRejectApiWrites(t *testing.T) {
	hub, err := pulseTests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := pulseTests.CreateUser(hub, "legacy-network-topology@example.com", "password")
	require.NoError(t, err)
	token, err := user.NewAuthToken()
	require.NoError(t, err)
	headers := map[string]string{"Authorization": token}

	sourcePort, err := pulseTests.CreateRecord(hub, "network_ports", map[string]any{
		"user": user.Id,
		"name": "验收旧源端口",
		"type": "lan",
	})
	require.NoError(t, err)
	targetPort, err := pulseTests.CreateRecord(hub, "network_ports", map[string]any{
		"user": user.Id,
		"name": "验收旧目标端口",
		"type": "lan",
	})
	require.NoError(t, err)

	scenarios := []struct {
		name string
		body string
	}{
		{
			name: "network_devices",
			body: fmt.Sprintf(`{"user":"%s","name":"验收旧设备","type":"switch"}`, user.Id),
		},
		{
			name: "network_ports",
			body: fmt.Sprintf(`{"user":"%s","name":"验收旧端口","type":"lan"}`, user.Id),
		},
		{
			name: "network_links",
			body: fmt.Sprintf(
				`{"user":"%s","source_port":"%s","target_port":"%s","kind":"ethernet"}`,
				user.Id,
				sourcePort.Id,
				targetPort.Id,
			),
		},
	}

	for _, scenario := range scenarios {
		t.Run("create_"+scenario.name, func(t *testing.T) {
			res := pulseTests.PerformTestAPIRequest(
				t,
				hub.TestApp,
				http.MethodPost,
				fmt.Sprintf("/api/collections/%s/records", scenario.name),
				strings.NewReader(scenario.body),
				headers,
			)
			require.Equal(t, http.StatusBadRequest, res.Status, res.Body)
			require.Contains(t, res.Body, "已迁移到资产中心")
		})
	}
}

func TestNetworkTopologyLegacyCollectionsRejectApiUpdatesButAllowLayouts(t *testing.T) {
	hub, err := pulseTests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := pulseTests.CreateUser(hub, "legacy-network-topology-update@example.com", "password")
	require.NoError(t, err)
	token, err := user.NewAuthToken()
	require.NoError(t, err)
	headers := map[string]string{"Authorization": token}

	legacyDevice, err := pulseTests.CreateRecord(hub, "network_devices", map[string]any{
		"user": user.Id,
		"name": "验收旧设备",
		"type": "switch",
	})
	require.NoError(t, err)

	rejectedUpdate := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPatch,
		fmt.Sprintf("/api/collections/network_devices/records/%s", legacyDevice.Id),
		strings.NewReader(`{"name":"验收旧设备更新"}`),
		headers,
	)
	require.Equal(t, http.StatusBadRequest, rejectedUpdate.Status, rejectedUpdate.Body)
	require.Contains(t, rejectedUpdate.Body, "已迁移到资产中心")

	acceptedLayout := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/network_layouts/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","key":"network-workspace","layout":{"nodes":{}}}`, user.Id)),
		headers,
	)
	require.Equal(t, http.StatusOK, acceptedLayout.Status, acceptedLayout.Body)
}
