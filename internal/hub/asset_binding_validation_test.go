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

func TestSystemAssetBindingValidation(t *testing.T) {
	hub, err := pulseTests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := pulseTests.CreateUser(hub, "system-asset-binding@example.com", "password")
	require.NoError(t, err)
	otherUser, err := pulseTests.CreateUser(hub, "system-asset-binding-other@example.com", "password")
	require.NoError(t, err)
	token, err := user.NewAuthToken()
	require.NoError(t, err)
	headers := map[string]string{"Authorization": token}

	hostAsset, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user":   user.Id,
		"name":   "验收主机资产",
		"type":   "physical_host",
		"status": "active",
	})
	require.NoError(t, err)
	upsAsset, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user":   user.Id,
		"name":   "验收 UPS 资产",
		"type":   "ups",
		"status": "active",
	})
	require.NoError(t, err)
	otherHostAsset, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user":   otherUser.Id,
		"name":   "验收其他用户主机资产",
		"type":   "physical_host",
		"status": "active",
	})
	require.NoError(t, err)

	rejectedMissing := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/systems/records",
		strings.NewReader(fmt.Sprintf(`{"name":"验收无资产机器","users":["%s"]}`, user.Id)),
		headers,
	)
	require.Equal(t, http.StatusBadRequest, rejectedMissing.Status, rejectedMissing.Body)
	require.Contains(t, rejectedMissing.Body, "客户端监控必须先绑定资产中心")

	accepted := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/systems/records",
		strings.NewReader(fmt.Sprintf(`{"name":"验收主机","users":["%s"],"asset":"%s"}`, user.Id, hostAsset.Id)),
		headers,
	)
	require.Equal(t, http.StatusOK, accepted.Status, accepted.Body)
	systemID := decodeRecordID(t, accepted.Body)

	rejectedClearing := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPatch,
		fmt.Sprintf("/api/collections/systems/records/%s", systemID),
		strings.NewReader(`{"asset":""}`),
		headers,
	)
	require.Equal(t, http.StatusBadRequest, rejectedClearing.Status, rejectedClearing.Body)
	require.Contains(t, rejectedClearing.Body, "客户端监控必须先绑定资产中心")

	rejectedType := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/systems/records",
		strings.NewReader(fmt.Sprintf(`{"name":"验收错误资产类型","users":["%s"],"asset":"%s"}`, user.Id, upsAsset.Id)),
		headers,
	)
	require.Equal(t, http.StatusBadRequest, rejectedType.Status, rejectedType.Body)
	require.Contains(t, rejectedType.Body, "客户端监控只能绑定物理主机")

	rejectedUser := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/systems/records",
		strings.NewReader(fmt.Sprintf(`{"name":"验收跨用户资产","users":["%s"],"asset":"%s"}`, user.Id, otherHostAsset.Id)),
		headers,
	)
	require.Equal(t, http.StatusBadRequest, rejectedUser.Status, rejectedUser.Body)
	require.Contains(t, rejectedUser.Body, "关联资产不属于当前机器用户")
}

func TestWebsiteMonitorAssetBindingValidation(t *testing.T) {
	hub, err := pulseTests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := pulseTests.CreateUser(hub, "website-asset-binding@example.com", "password")
	require.NoError(t, err)
	otherUser, err := pulseTests.CreateUser(hub, "website-asset-binding-other@example.com", "password")
	require.NoError(t, err)
	token, err := user.NewAuthToken()
	require.NoError(t, err)
	headers := map[string]string{"Authorization": token}

	endpointAsset, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user":   user.Id,
		"name":   "验收网页端点",
		"type":   "web_endpoint",
		"status": "active",
	})
	require.NoError(t, err)
	hostAsset, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user":   user.Id,
		"name":   "验收主机",
		"type":   "physical_host",
		"status": "active",
	})
	require.NoError(t, err)
	otherEndpointAsset, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user":   otherUser.Id,
		"name":   "验收其他用户网页端点",
		"type":   "web_endpoint",
		"status": "active",
	})
	require.NoError(t, err)

	rejectedMissing := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/website_monitors/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","name":"验收无资产网站监控","url":"http://127.0.0.1:8090","interval_seconds":300,"timeout_seconds":10,"enabled":true}`, user.Id)),
		headers,
	)
	require.Equal(t, http.StatusBadRequest, rejectedMissing.Status, rejectedMissing.Body)
	require.Contains(t, rejectedMissing.Body, "网站监控必须先绑定资产中心")

	accepted := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/website_monitors/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","asset":"%s","name":"验收网页监控","url":"http://127.0.0.1:8090","interval_seconds":300,"timeout_seconds":10,"enabled":true}`, user.Id, endpointAsset.Id)),
		headers,
	)
	require.Equal(t, http.StatusOK, accepted.Status, accepted.Body)
	monitorID := decodeRecordID(t, accepted.Body)

	rejectedClearing := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPatch,
		fmt.Sprintf("/api/collections/website_monitors/records/%s", monitorID),
		strings.NewReader(`{"asset":""}`),
		headers,
	)
	require.Equal(t, http.StatusBadRequest, rejectedClearing.Status, rejectedClearing.Body)
	require.Contains(t, rejectedClearing.Body, "网站监控必须先绑定资产中心")

	rejectedType := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/website_monitors/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","asset":"%s","name":"验收错误网站资产","url":"http://127.0.0.1:8090","interval_seconds":300,"timeout_seconds":10,"enabled":true}`, user.Id, hostAsset.Id)),
		headers,
	)
	require.Equal(t, http.StatusBadRequest, rejectedType.Status, rejectedType.Body)
	require.Contains(t, rejectedType.Body, "网站监控只能绑定网页端点资产")

	rejectedUser := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/website_monitors/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","asset":"%s","name":"验收跨用户网页端点","url":"http://127.0.0.1:8090","interval_seconds":300,"timeout_seconds":10,"enabled":true}`, user.Id, otherEndpointAsset.Id)),
		headers,
	)
	require.Equal(t, http.StatusBadRequest, rejectedUser.Status, rejectedUser.Body)
	require.Contains(t, rejectedUser.Body, "关联资产不属于当前用户")
}
