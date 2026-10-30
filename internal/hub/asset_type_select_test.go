//go:build testing

package hub_test

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	pulseTests "gutenacht.site/pulse/internal/tests"
)

// 2026-10-20 用户把光猫改成 ONT 保存失败：assets.type 的 select 允许值缺 smart_ont 等前端固化类型。
// 这个测试从真实迁移后的 collection 出发，确保 PATCH 类型不会再被 PocketBase 拒绝。
func TestAssetTypeAllowsEveryFixedAssetType(t *testing.T) {
	hub, err := pulseTests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := pulseTests.CreateUserWithRole(hub, "asset-types@example.com", "password", "admin")
	require.NoError(t, err)
	token, err := user.NewAuthToken()
	require.NoError(t, err)
	headers := map[string]string{"Authorization": token}

	createResponse := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/assets/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","name":"类型校验资产","type":"physical_host","status":"active"}`, user.Id)),
		headers,
	)
	require.Equal(t, http.StatusOK, createResponse.Status, createResponse.Body)
	assetID := decodeRecordID(t, createResponse.Body)

	for _, assetType := range []string{"smart_ont", "subscription", "domain_name", "cloud_host", "smart_switch", "vm"} {
		updateResponse := pulseTests.PerformTestAPIRequest(
			t,
			hub.TestApp,
			http.MethodPatch,
			fmt.Sprintf("/api/collections/assets/records/%s", assetID),
			strings.NewReader(fmt.Sprintf(`{"type":%q}`, assetType)),
			headers,
		)
		require.Equal(t, http.StatusOK, updateResponse.Status, "%s: %s", assetType, updateResponse.Body)
		assert.Contains(t, updateResponse.Body, fmt.Sprintf(`"type":%q`, assetType))
	}
}
