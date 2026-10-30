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

func TestAssetMonitorBindingUniquenessAndDeleteProtection(t *testing.T) {
	hub, err := pulseTests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := pulseTests.CreateUserWithRole(hub, "asset-monitor-binding@example.com", "password", "admin")
	require.NoError(t, err)
	token, err := user.NewAuthToken()
	require.NoError(t, err)
	headers := map[string]string{"Authorization": token}

	hostAsset, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user": user.Id, "name": "监控绑定主机", "type": "physical_host", "status": "active",
	})
	require.NoError(t, err)
	endpointAsset, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user": user.Id, "name": "监控绑定网站", "type": "web_endpoint", "status": "active",
	})
	require.NoError(t, err)

	systemBody := fmt.Sprintf(`{"name":"监控绑定测试机器","users":["%s"],"asset":"%s"}`, user.Id, hostAsset.Id)
	createdSystem := pulseTests.PerformTestAPIRequest(
		t, hub.TestApp, http.MethodPost, "/api/collections/systems/records", strings.NewReader(systemBody), headers,
	)
	require.Equal(t, http.StatusOK, createdSystem.Status, createdSystem.Body)
	systemID := decodeRecordID(t, createdSystem.Body)

	agentBinding, err := hub.FindFirstRecordByFilter(
		"asset_monitor_bindings", "asset = {:asset}", map[string]any{"asset": hostAsset.Id},
	)
	require.NoError(t, err)
	require.Equal(t, "agent", agentBinding.GetString("provider"))
	require.Equal(t, systemID, agentBinding.GetString("target_id"))

	duplicateSystem := pulseTests.PerformTestAPIRequest(
		t, hub.TestApp, http.MethodPost, "/api/collections/systems/records", strings.NewReader(systemBody), headers,
	)
	require.Equal(t, http.StatusBadRequest, duplicateSystem.Status, duplicateSystem.Body)
	require.Contains(t, duplicateSystem.Body, "已有监控接入")

	blockedDelete := pulseTests.PerformTestAPIRequest(
		t, hub.TestApp, http.MethodDelete, "/api/collections/assets/records/"+hostAsset.Id, nil, headers,
	)
	require.Equal(t, http.StatusBadRequest, blockedDelete.Status, blockedDelete.Body)
	require.Contains(t, blockedDelete.Body, "请先在资产监控中删除监控目标")

	blockedTypeChange := pulseTests.PerformTestAPIRequest(
		t, hub.TestApp, http.MethodPatch, "/api/collections/assets/records/"+hostAsset.Id,
		strings.NewReader(`{"type":"nas"}`), headers,
	)
	require.Equal(t, http.StatusBadRequest, blockedTypeChange.Status, blockedTypeChange.Body)
	require.Contains(t, blockedTypeChange.Body, "不能修改资产类型")

	websiteBody := fmt.Sprintf(`{"user":"%s","asset":"%s","name":"监控绑定网站测试","url":"https://example.com","interval_seconds":300,"timeout_seconds":10,"enabled":true}`, user.Id, endpointAsset.Id)
	createdWebsite := pulseTests.PerformTestAPIRequest(
		t, hub.TestApp, http.MethodPost, "/api/collections/website_monitors/records", strings.NewReader(websiteBody), headers,
	)
	require.Equal(t, http.StatusOK, createdWebsite.Status, createdWebsite.Body)
	websiteBinding, err := hub.FindFirstRecordByFilter(
		"asset_monitor_bindings", "asset = {:asset}", map[string]any{"asset": endpointAsset.Id},
	)
	require.NoError(t, err)
	require.Equal(t, "website", websiteBinding.GetString("provider"))

	duplicateWebsite := pulseTests.PerformTestAPIRequest(
		t, hub.TestApp, http.MethodPost, "/api/collections/website_monitors/records", strings.NewReader(websiteBody), headers,
	)
	require.Equal(t, http.StatusBadRequest, duplicateWebsite.Status, duplicateWebsite.Body)
	require.Contains(t, duplicateWebsite.Body, "已有监控接入")

	// 自定义 API 路由在 TestApp 中不注册，这里直接清理绑定和 provider 记录，
	// 再验证资产删除保护在绑定移除后放行。真实删除接口已在本地开发库实查。
	require.NoError(t, hub.Delete(agentBinding))
	systemRecord, err := hub.FindRecordById("systems", systemID)
	require.NoError(t, err)
	require.NoError(t, hub.Delete(systemRecord))

	deletedAsset := pulseTests.PerformTestAPIRequest(
		t, hub.TestApp, http.MethodDelete, "/api/collections/assets/records/"+hostAsset.Id, nil, headers,
	)
	require.True(t, deletedAsset.Status == http.StatusNoContent || deletedAsset.Status == http.StatusOK, deletedAsset.Body)

	_, err = hub.FindRecordById("assets", hostAsset.Id)
	require.Error(t, err, "删除监控目标后资产必须可以删除")
}
