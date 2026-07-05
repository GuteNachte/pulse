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

func TestAssetMasterValidationRejectsCrossUserAssetReferences(t *testing.T) {
	hub, err := pulseTests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := pulseTests.CreateUser(hub, "asset-master@example.com", "password")
	require.NoError(t, err)
	otherUser, err := pulseTests.CreateUser(hub, "asset-master-other@example.com", "password")
	require.NoError(t, err)
	token, err := user.NewAuthToken()
	require.NoError(t, err)
	headers := map[string]string{"Authorization": token}

	ownAsset, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user":   user.Id,
		"name":   "验收自有资产",
		"type":   "physical_host",
		"status": "active",
	})
	require.NoError(t, err)
	otherAsset, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user":   otherUser.Id,
		"name":   "验收其他用户资产",
		"type":   "router",
		"status": "active",
	})
	require.NoError(t, err)

	acceptedInterface := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/asset_interfaces/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","asset":"%s","name":"eth0","kind":"ethernet","source":"manual"}`, user.Id, ownAsset.Id)),
		headers,
	)
	require.Equal(t, http.StatusOK, acceptedInterface.Status, acceptedInterface.Body)

	rejectedInterface := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/asset_interfaces/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","asset":"%s","name":"eth1","kind":"ethernet","source":"manual"}`, user.Id, otherAsset.Id)),
		headers,
	)
	require.Equal(t, http.StatusBadRequest, rejectedInterface.Status, rejectedInterface.Body)
	require.Contains(t, rejectedInterface.Body, "关联资产不属于当前用户")

	rejectedParent := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/assets/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","name":"验收跨用户父级","type":"vm","parent_asset":"%s"}`, user.Id, otherAsset.Id)),
		headers,
	)
	require.Equal(t, http.StatusBadRequest, rejectedParent.Status, rejectedParent.Body)
	require.Contains(t, rejectedParent.Body, "父级资产不属于当前用户")
}

func TestAssetMasterValidationRejectsDuplicateAssets(t *testing.T) {
	hub, err := pulseTests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := pulseTests.CreateUser(hub, "asset-duplicate@example.com", "password")
	require.NoError(t, err)
	token, err := user.NewAuthToken()
	require.NoError(t, err)
	headers := map[string]string{"Authorization": token}

	existing, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user":          user.Id,
		"name":          "书房主机",
		"type":          "physical_host",
		"status":        "active",
		"serial_number": "SN-001",
		"management_ip": "192.168.1.10",
		"metadata": map[string]any{
			"fixed_ipv4": "192.168.1.11",
			"mac":        "AA:BB:CC:DD:EE:FF",
		},
	})
	require.NoError(t, err)

	duplicateName := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/assets/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","name":" 书房主机 ","type":"physical_host","status":"active"}`, user.Id)),
		headers,
	)
	require.Equal(t, http.StatusBadRequest, duplicateName.Status, duplicateName.Body)
	require.Contains(t, duplicateName.Body, "同类型同名资产已存在")

	duplicateSerial := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/assets/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","name":"备用主机","type":"physical_host","serial_number":"sn-001"}`, user.Id)),
		headers,
	)
	require.Equal(t, http.StatusBadRequest, duplicateSerial.Status, duplicateSerial.Body)
	require.Contains(t, duplicateSerial.Body, "资产序列号已存在")

	duplicateFixedIPAgainstManagementIP := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/assets/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","name":"备用 NAS","type":"nas","metadata":{"fixed_ipv4":"192.168.1.10"}}`, user.Id)),
		headers,
	)
	require.Equal(t, http.StatusBadRequest, duplicateFixedIPAgainstManagementIP.Status, duplicateFixedIPAgainstManagementIP.Body)
	require.Contains(t, duplicateFixedIPAgainstManagementIP.Body, "固定 IPv4 已被其他资产使用")

	duplicateMAC := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/assets/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","name":"备用交换机","type":"switch","metadata":{"mac":"aa-bb-cc-dd-ee-ff"}}`, user.Id)),
		headers,
	)
	require.Equal(t, http.StatusBadRequest, duplicateMAC.Status, duplicateMAC.Body)
	require.Contains(t, duplicateMAC.Body, "资产 MAC 已存在")

	selfUpdate := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPatch,
		fmt.Sprintf("/api/collections/assets/records/%s", existing.Id),
		strings.NewReader(`{"role":"主力设备"}`),
		headers,
	)
	require.Equal(t, http.StatusOK, selfUpdate.Status, selfUpdate.Body)

	another, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user":   user.Id,
		"name":   "另一台设备",
		"type":   "nas",
		"status": "active",
	})
	require.NoError(t, err)
	rejectedUpdate := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPatch,
		fmt.Sprintf("/api/collections/assets/records/%s", another.Id),
		strings.NewReader(`{"management_ip":"192.168.1.11"}`),
		headers,
	)
	require.Equal(t, http.StatusBadRequest, rejectedUpdate.Status, rejectedUpdate.Body)
	require.Contains(t, rejectedUpdate.Body, "管理 IP 已被其他资产使用")

	existingInterface, err := pulseTests.CreateRecord(hub, "asset_interfaces", map[string]any{
		"user":   user.Id,
		"asset":  existing.Id,
		"name":   "eth0",
		"kind":   "ethernet",
		"mac":    "11:22:33:44:55:66",
		"ipv4":   "192.168.1.12",
		"source": "manual",
	})
	require.NoError(t, err)

	rejectedAssetIPAgainstOtherInterface := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPatch,
		fmt.Sprintf("/api/collections/assets/records/%s", another.Id),
		strings.NewReader(`{"management_ip":"192.168.1.12"}`),
		headers,
	)
	require.Equal(t, http.StatusBadRequest, rejectedAssetIPAgainstOtherInterface.Status, rejectedAssetIPAgainstOtherInterface.Body)
	require.Contains(t, rejectedAssetIPAgainstOtherInterface.Body, "管理 IP 已被其他资产接口使用")
	require.Equal(t, "192.168.1.12", existingInterface.GetString("ipv4"))

	ownInterfaceIPAsManagementIP := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPatch,
		fmt.Sprintf("/api/collections/assets/records/%s", existing.Id),
		strings.NewReader(`{"management_ip":"192.168.1.12"}`),
		headers,
	)
	require.Equal(t, http.StatusOK, ownInterfaceIPAsManagementIP.Status, ownInterfaceIPAsManagementIP.Body)
}

func TestAssetInterfaceValidationKeepsSinglePrimaryInterface(t *testing.T) {
	hub, err := pulseTests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := pulseTests.CreateUser(hub, "asset-interface-primary@example.com", "password")
	require.NoError(t, err)
	token, err := user.NewAuthToken()
	require.NoError(t, err)
	headers := map[string]string{"Authorization": token}

	asset, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user":   user.Id,
		"name":   "验收主接口资产",
		"type":   "physical_host",
		"status": "active",
	})
	require.NoError(t, err)

	first := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/asset_interfaces/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","asset":"%s","name":"eth0","kind":"ethernet","source":"manual","primary":true}`, user.Id, asset.Id)),
		headers,
	)
	require.Equal(t, http.StatusOK, first.Status, first.Body)
	second := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/asset_interfaces/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","asset":"%s","name":"eth1","kind":"ethernet","source":"manual","primary":true}`, user.Id, asset.Id)),
		headers,
	)
	require.Equal(t, http.StatusOK, second.Status, second.Body)

	primaryInterfaces, err := hub.FindRecordsByFilter("asset_interfaces", "asset = {:asset} && primary = true", "name", -1, 0, map[string]any{
		"asset": asset.Id,
	})
	require.NoError(t, err)
	require.Len(t, primaryInterfaces, 1)
	require.Equal(t, "eth1", primaryInterfaces[0].GetString("name"))

	firstInterfaces, err := hub.FindRecordsByFilter("asset_interfaces", "asset = {:asset} && name = 'eth0'", "", 1, 0, map[string]any{
		"asset": asset.Id,
	})
	require.NoError(t, err)
	require.Len(t, firstInterfaces, 1)
	patched := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPatch,
		fmt.Sprintf("/api/collections/asset_interfaces/records/%s", firstInterfaces[0].Id),
		strings.NewReader(`{"primary":true}`),
		headers,
	)
	require.Equal(t, http.StatusOK, patched.Status, patched.Body)

	primaryInterfaces, err = hub.FindRecordsByFilter("asset_interfaces", "asset = {:asset} && primary = true", "name", -1, 0, map[string]any{
		"asset": asset.Id,
	})
	require.NoError(t, err)
	require.Len(t, primaryInterfaces, 1)
	require.Equal(t, "eth0", primaryInterfaces[0].GetString("name"))
}

func TestAssetInterfaceValidationRejectsDuplicateNetworkIdentifiers(t *testing.T) {
	hub, err := pulseTests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := pulseTests.CreateUser(hub, "asset-interface-duplicate@example.com", "password")
	require.NoError(t, err)
	token, err := user.NewAuthToken()
	require.NoError(t, err)
	headers := map[string]string{"Authorization": token}

	firstAsset, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user":          user.Id,
		"name":          "验收接口资产 A",
		"type":          "physical_host",
		"status":        "active",
		"management_ip": "192.168.1.20",
		"metadata": map[string]any{
			"mac": "AA:00:00:00:00:01",
		},
	})
	require.NoError(t, err)
	secondAsset, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user":   user.Id,
		"name":   "验收接口资产 B",
		"type":   "nas",
		"status": "active",
	})
	require.NoError(t, err)

	accepted := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/asset_interfaces/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","asset":"%s","name":"eth0","kind":"ethernet","source":"manual","mac":"22:33:44:55:66:77","ipv4":"192.168.1.21, 192.168.1.22","ipv6":"fe80::1"}`, user.Id, firstAsset.Id)),
		headers,
	)
	require.Equal(t, http.StatusOK, accepted.Status, accepted.Body)

	duplicateInterfaceIP := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/asset_interfaces/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","asset":"%s","name":"eth1","kind":"ethernet","source":"manual","ipv4":"192.168.1.22"}`, user.Id, secondAsset.Id)),
		headers,
	)
	require.Equal(t, http.StatusBadRequest, duplicateInterfaceIP.Status, duplicateInterfaceIP.Body)
	require.Contains(t, duplicateInterfaceIP.Body, "接口 IPv4 已被其他接口使用")

	duplicateInterfaceMAC := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/asset_interfaces/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","asset":"%s","name":"eth2","kind":"ethernet","source":"manual","mac":"22-33-44-55-66-77"}`, user.Id, secondAsset.Id)),
		headers,
	)
	require.Equal(t, http.StatusBadRequest, duplicateInterfaceMAC.Status, duplicateInterfaceMAC.Body)
	require.Contains(t, duplicateInterfaceMAC.Body, "接口 MAC 已被其他接口使用")

	duplicateInterfaceAgainstAssetIP := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/asset_interfaces/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","asset":"%s","name":"eth3","kind":"ethernet","source":"manual","ipv4":"192.168.1.20"}`, user.Id, secondAsset.Id)),
		headers,
	)
	require.Equal(t, http.StatusBadRequest, duplicateInterfaceAgainstAssetIP.Status, duplicateInterfaceAgainstAssetIP.Body)
	require.Contains(t, duplicateInterfaceAgainstAssetIP.Body, "接口 IPv4 已被其他资产使用")

	duplicateInterfaceAgainstAssetMAC := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/asset_interfaces/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","asset":"%s","name":"eth4","kind":"ethernet","source":"manual","mac":"aa-00-00-00-00-01"}`, user.Id, secondAsset.Id)),
		headers,
	)
	require.Equal(t, http.StatusBadRequest, duplicateInterfaceAgainstAssetMAC.Status, duplicateInterfaceAgainstAssetMAC.Body)
	require.Contains(t, duplicateInterfaceAgainstAssetMAC.Body, "接口 MAC 已被其他资产使用")

	acceptedOwnAssetIP := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/asset_interfaces/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","asset":"%s","name":"mgmt0","kind":"management","source":"manual","ipv4":"192.168.1.20"}`, user.Id, firstAsset.Id)),
		headers,
	)
	require.Equal(t, http.StatusOK, acceptedOwnAssetIP.Status, acceptedOwnAssetIP.Body)
}

func TestAssetRelationValidationRejectsInvalidEndpoints(t *testing.T) {
	hub, err := pulseTests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := pulseTests.CreateUser(hub, "asset-relation-master@example.com", "password")
	require.NoError(t, err)
	otherUser, err := pulseTests.CreateUser(hub, "asset-relation-master-other@example.com", "password")
	require.NoError(t, err)
	token, err := user.NewAuthToken()
	require.NoError(t, err)
	headers := map[string]string{"Authorization": token}

	router, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user": user.Id,
		"name": "验收路由器",
		"type": "router",
	})
	require.NoError(t, err)
	switchAsset, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user": user.Id,
		"name": "验收交换机",
		"type": "switch",
	})
	require.NoError(t, err)
	otherAsset, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user": otherUser.Id,
		"name": "验收其他用户交换机",
		"type": "switch",
	})
	require.NoError(t, err)

	accepted := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/asset_relations/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","source_asset":"%s","target_asset":"%s","kind":"connected_to","label":"LAN"}`, user.Id, router.Id, switchAsset.Id)),
		headers,
	)
	require.Equal(t, http.StatusOK, accepted.Status, accepted.Body)

	rejectedCrossUser := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/asset_relations/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","source_asset":"%s","target_asset":"%s","kind":"connected_to","label":"bad"}`, user.Id, router.Id, otherAsset.Id)),
		headers,
	)
	require.Equal(t, http.StatusBadRequest, rejectedCrossUser.Status, rejectedCrossUser.Body)
	require.Contains(t, rejectedCrossUser.Body, "资产关系两端必须属于当前用户")

	rejectedSelf := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/asset_relations/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","source_asset":"%s","target_asset":"%s","kind":"connected_to","label":"self"}`, user.Id, router.Id, router.Id)),
		headers,
	)
	require.Equal(t, http.StatusBadRequest, rejectedSelf.Status, rejectedSelf.Body)
	require.Contains(t, rejectedSelf.Body, "资产关系不能连接同一个资产")
}

func TestAssetRelationValidationRejectsDuplicateEndpoints(t *testing.T) {
	hub, err := pulseTests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := pulseTests.CreateUser(hub, "asset-relation-duplicate@example.com", "password")
	require.NoError(t, err)
	token, err := user.NewAuthToken()
	require.NoError(t, err)
	headers := map[string]string{"Authorization": token}

	router, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user": user.Id,
		"name": "验收重复路由器",
		"type": "router",
	})
	require.NoError(t, err)
	switchAsset, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user": user.Id,
		"name": "验收重复交换机",
		"type": "switch",
	})
	require.NoError(t, err)
	routerWan, err := pulseTests.CreateRecord(hub, "asset_interfaces", map[string]any{
		"user":   user.Id,
		"asset":  router.Id,
		"name":   "wan0",
		"kind":   "wan",
		"source": "manual",
	})
	require.NoError(t, err)
	switchLan, err := pulseTests.CreateRecord(hub, "asset_interfaces", map[string]any{
		"user":   user.Id,
		"asset":  switchAsset.Id,
		"name":   "lan1",
		"kind":   "lan",
		"source": "manual",
	})
	require.NoError(t, err)

	accepted := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/asset_relations/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","source_asset":"%s","target_asset":"%s","kind":"connected_to","label":"WAN -> LAN","metadata":{"source_interface":"%s","target_interface":"%s"}}`, user.Id, router.Id, switchAsset.Id, routerWan.Id, switchLan.Id)),
		headers,
	)
	require.Equal(t, http.StatusOK, accepted.Status, accepted.Body)

	records, err := hub.FindRecordsByFilter("asset_relations", "source_asset = {:source} && target_asset = {:target}", "", -1, 0, map[string]any{
		"source": router.Id,
		"target": switchAsset.Id,
	})
	require.NoError(t, err)
	require.Len(t, records, 1)

	acceptedUpdate := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPatch,
		fmt.Sprintf("/api/collections/asset_relations/records/%s", records[0].Id),
		strings.NewReader(`{"label":"WAN -> LAN 已确认"}`),
		headers,
	)
	require.Equal(t, http.StatusOK, acceptedUpdate.Status, acceptedUpdate.Body)

	rejectedDuplicate := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/asset_relations/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","source_asset":"%s","target_asset":"%s","kind":"connected_to","label":"重复链路","metadata":{"source_interface":"%s","target_interface":"%s"}}`, user.Id, router.Id, switchAsset.Id, routerWan.Id, switchLan.Id)),
		headers,
	)
	require.Equal(t, http.StatusBadRequest, rejectedDuplicate.Status, rejectedDuplicate.Body)
	require.Contains(t, rejectedDuplicate.Body, "资产关系已存在")

	rejectedReversedConnectedTo := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/asset_relations/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","source_asset":"%s","target_asset":"%s","kind":"connected_to","label":"反向重复链路","metadata":{"source_interface":"%s","target_interface":"%s"}}`, user.Id, switchAsset.Id, router.Id, switchLan.Id, routerWan.Id)),
		headers,
	)
	require.Equal(t, http.StatusBadRequest, rejectedReversedConnectedTo.Status, rejectedReversedConnectedTo.Body)
	require.Contains(t, rejectedReversedConnectedTo.Body, "资产关系已存在")

	acceptedDirectional := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/asset_relations/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","source_asset":"%s","target_asset":"%s","kind":"depends_on","label":"路由器依赖交换机","metadata":{"source_interface":"%s","target_interface":"%s"}}`, user.Id, router.Id, switchAsset.Id, routerWan.Id, switchLan.Id)),
		headers,
	)
	require.Equal(t, http.StatusOK, acceptedDirectional.Status, acceptedDirectional.Body)

	acceptedReversedDirectional := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/asset_relations/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","source_asset":"%s","target_asset":"%s","kind":"depends_on","label":"交换机依赖路由器","metadata":{"source_interface":"%s","target_interface":"%s"}}`, user.Id, switchAsset.Id, router.Id, switchLan.Id, routerWan.Id)),
		headers,
	)
	require.Equal(t, http.StatusOK, acceptedReversedDirectional.Status, acceptedReversedDirectional.Body)
}

func TestAssetRelationValidationRejectsInterfaceEndpointMismatch(t *testing.T) {
	hub, err := pulseTests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := pulseTests.CreateUser(hub, "asset-relation-interface@example.com", "password")
	require.NoError(t, err)
	otherUser, err := pulseTests.CreateUser(hub, "asset-relation-interface-other@example.com", "password")
	require.NoError(t, err)
	token, err := user.NewAuthToken()
	require.NoError(t, err)
	headers := map[string]string{"Authorization": token}

	router, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user": user.Id,
		"name": "验收端点路由器",
		"type": "router",
	})
	require.NoError(t, err)
	switchAsset, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user": user.Id,
		"name": "验收端点交换机",
		"type": "switch",
	})
	require.NoError(t, err)
	otherAsset, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user": otherUser.Id,
		"name": "验收端点其他资产",
		"type": "switch",
	})
	require.NoError(t, err)
	routerWan, err := pulseTests.CreateRecord(hub, "asset_interfaces", map[string]any{
		"user":   user.Id,
		"asset":  router.Id,
		"name":   "wan0",
		"kind":   "wan",
		"source": "manual",
	})
	require.NoError(t, err)
	switchLan, err := pulseTests.CreateRecord(hub, "asset_interfaces", map[string]any{
		"user":   user.Id,
		"asset":  switchAsset.Id,
		"name":   "lan1",
		"kind":   "lan",
		"source": "manual",
	})
	require.NoError(t, err)
	otherInterface, err := pulseTests.CreateRecord(hub, "asset_interfaces", map[string]any{
		"user":   otherUser.Id,
		"asset":  otherAsset.Id,
		"name":   "lan9",
		"kind":   "lan",
		"source": "manual",
	})
	require.NoError(t, err)

	rejectedMissing := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/asset_relations/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","source_asset":"%s","target_asset":"%s","kind":"connected_to","metadata":{"source_interface":"missingendpoint1","target_interface":"%s"}}`, user.Id, router.Id, switchAsset.Id, switchLan.Id)),
		headers,
	)
	require.Equal(t, http.StatusBadRequest, rejectedMissing.Status, rejectedMissing.Body)
	require.Contains(t, rejectedMissing.Body, "来源接口不存在")

	rejectedMismatch := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/asset_relations/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","source_asset":"%s","target_asset":"%s","kind":"connected_to","metadata":{"source_interface":"%s","target_interface":"%s"}}`, user.Id, router.Id, switchAsset.Id, switchLan.Id, routerWan.Id)),
		headers,
	)
	require.Equal(t, http.StatusBadRequest, rejectedMismatch.Status, rejectedMismatch.Body)
	require.Contains(t, rejectedMismatch.Body, "来源接口和关系资产不匹配")

	rejectedCrossUser := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/asset_relations/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","source_asset":"%s","target_asset":"%s","kind":"connected_to","metadata":{"source_interface":"%s","target_interface":"%s"}}`, user.Id, router.Id, switchAsset.Id, routerWan.Id, otherInterface.Id)),
		headers,
	)
	require.Equal(t, http.StatusBadRequest, rejectedCrossUser.Status, rejectedCrossUser.Body)
	require.Contains(t, rejectedCrossUser.Body, "目标接口不属于当前用户")

	accepted := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/asset_relations/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","source_asset":"%s","target_asset":"%s","kind":"connected_to","metadata":{"source_interface":"%s","target_interface":"%s"}}`, user.Id, router.Id, switchAsset.Id, routerWan.Id, switchLan.Id)),
		headers,
	)
	require.Equal(t, http.StatusOK, accepted.Status, accepted.Body)
}

func TestAssetLocationValidationRejectsCrossUserParentAndCycles(t *testing.T) {
	hub, err := pulseTests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := pulseTests.CreateUser(hub, "asset-location-master@example.com", "password")
	require.NoError(t, err)
	otherUser, err := pulseTests.CreateUser(hub, "asset-location-master-other@example.com", "password")
	require.NoError(t, err)
	token, err := user.NewAuthToken()
	require.NoError(t, err)
	headers := map[string]string{"Authorization": token}

	room, err := pulseTests.CreateRecord(hub, "asset_locations", map[string]any{
		"user": user.Id,
		"name": "验收书房",
		"kind": "room",
	})
	require.NoError(t, err)
	desk, err := pulseTests.CreateRecord(hub, "asset_locations", map[string]any{
		"user":            user.Id,
		"name":            "验收桌面",
		"kind":            "desk",
		"parent_location": room.Id,
	})
	require.NoError(t, err)
	otherRoom, err := pulseTests.CreateRecord(hub, "asset_locations", map[string]any{
		"user": otherUser.Id,
		"name": "验收其他用户房间",
		"kind": "room",
	})
	require.NoError(t, err)

	rejectedCrossUser := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/asset_locations/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","name":"验收跨用户父级位置","kind":"desk","parent_location":"%s"}`, user.Id, otherRoom.Id)),
		headers,
	)
	require.Equal(t, http.StatusBadRequest, rejectedCrossUser.Status, rejectedCrossUser.Body)
	require.Contains(t, rejectedCrossUser.Body, "父级位置不属于当前用户")

	rejectedCycle := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPatch,
		fmt.Sprintf("/api/collections/asset_locations/records/%s", room.Id),
		strings.NewReader(fmt.Sprintf(`{"parent_location":"%s"}`, desk.Id)),
		headers,
	)
	require.Equal(t, http.StatusBadRequest, rejectedCycle.Status, rejectedCycle.Body)
	require.Contains(t, rejectedCycle.Body, "父级位置不能形成循环关系")
}
