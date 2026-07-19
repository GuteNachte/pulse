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

func TestAssetMasterValidation(t *testing.T) {
	hub, err := pulseTests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	t.Run("RejectsCrossUserAssetReferences", func(t *testing.T) {
		testAssetMasterValidationRejectsCrossUserAssetReferences(t, hub)
	})
	t.Run("RejectsDuplicateAssets", func(t *testing.T) {
		testAssetMasterValidationRejectsDuplicateAssets(t, hub)
	})
	t.Run("RequiresPhoneVariantSpecs", func(t *testing.T) {
		testAssetMasterValidationRequiresPhoneVariantSpecs(t, hub)
	})
	t.Run("RequiresStrictInternetProfile", func(t *testing.T) {
		testAssetMasterValidationRequiresStrictInternetProfile(t, hub)
	})
	t.Run("RequiresStrictONTProfile", func(t *testing.T) {
		testAssetMasterValidationRequiresStrictONTProfile(t, hub)
	})
	t.Run("ValidatesONTInterfaceState", func(t *testing.T) {
		testAssetInterfaceValidationValidatesONTState(t, hub)
	})
	t.Run("KeepsSinglePrimaryInterface", func(t *testing.T) {
		testAssetInterfaceValidationKeepsSinglePrimaryInterface(t, hub)
	})
	t.Run("RejectsDuplicateNetworkIdentifiers", func(t *testing.T) {
		testAssetInterfaceValidationRejectsDuplicateNetworkIdentifiers(t, hub)
	})
	t.Run("RejectsInvalidRelationEndpoints", func(t *testing.T) {
		testAssetRelationValidationRejectsInvalidEndpoints(t, hub)
	})
	t.Run("RejectsDuplicateRelationEndpoints", func(t *testing.T) {
		testAssetRelationValidationRejectsDuplicateEndpoints(t, hub)
	})
	t.Run("RejectsRelationInterfaceEndpointMismatch", func(t *testing.T) {
		testAssetRelationValidationRejectsInterfaceEndpointMismatch(t, hub)
	})
	t.Run("EnforcesInternetRelationBoundary", func(t *testing.T) {
		testAssetRelationValidationEnforcesInternetBoundary(t, hub)
	})
	t.Run("EnforcesWiFiRelationBoundary", func(t *testing.T) {
		testAssetRelationValidationEnforcesWiFiBoundary(t, hub)
	})
	t.Run("RejectsCrossUserLocationParentAndCycles", func(t *testing.T) {
		testAssetLocationValidationRejectsCrossUserParentAndCycles(t, hub)
	})
}

func testAssetRelationValidationEnforcesWiFiBoundary(t *testing.T, hub *pulseTests.TestHub) {
	user, err := pulseTests.CreateUser(hub, "asset-wifi-relation@example.com", "password")
	require.NoError(t, err)
	token, err := user.NewAuthToken()
	require.NoError(t, err)
	headers := map[string]string{"Authorization": token}

	ont, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user": user.Id, "name": "验收无线主网关", "type": "ont", "status": "active",
	})
	require.NoError(t, err)
	phones := make([]string, 5)
	for index := range phones {
		phone, createErr := pulseTests.CreateRecord(hub, "assets", map[string]any{
			"user": user.Id, "name": fmt.Sprintf("验收手机 %d", index+1), "type": "phone", "status": "active",
		})
		require.NoError(t, createErr)
		phones[index] = phone.Id
	}
	wifi5, err := pulseTests.CreateRecord(hub, "asset_interfaces", map[string]any{
		"user": user.Id, "asset": ont.Id, "name": "5 GHz Wi-Fi", "kind": "wifi", "source": "manual",
		"metadata": map[string]any{"enabled": true, "role": "radio", "band": "5 GHz"},
	})
	require.NoError(t, err)
	wifi24, err := pulseTests.CreateRecord(hub, "asset_interfaces", map[string]any{
		"user": user.Id, "asset": ont.Id, "name": "2.4 GHz Wi-Fi", "kind": "wifi", "source": "manual",
		"metadata": map[string]any{"enabled": false, "role": "radio", "band": "2.4 GHz"},
	})
	require.NoError(t, err)
	lan1, err := pulseTests.CreateRecord(hub, "asset_interfaces", map[string]any{
		"user": user.Id, "asset": ont.Id, "name": "LAN 1", "kind": "lan", "source": "manual",
		"metadata": map[string]any{"enabled": true, "role": "lan"},
	})
	require.NoError(t, err)

	createWiFiRelation := func(sourceAsset string, targetAsset string, kind string, targetInterface string) pulseTests.TestAPIResponse {
		body := fmt.Sprintf(`{"user":"%s","source_asset":"%s","target_asset":"%s","kind":"%s","metadata":{"link_kind":"wifi","target_interface":"%s"}}`, user.Id, sourceAsset, targetAsset, kind, targetInterface)
		return pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/collections/asset_relations/records", strings.NewReader(body), headers)
	}

	accepted := createWiFiRelation(phones[0], ont.Id, "connected_to", wifi5.Id)
	require.Equal(t, http.StatusOK, accepted.Status, accepted.Body)

	disabled := createWiFiRelation(phones[1], ont.Id, "connected_to", wifi24.Id)
	require.Equal(t, http.StatusBadRequest, disabled.Status, disabled.Body)
	require.Contains(t, disabled.Body, "不能连接未启用的 Wi-Fi 接口")

	wrongInterface := createWiFiRelation(phones[2], ont.Id, "connected_to", lan1.Id)
	require.Equal(t, http.StatusBadRequest, wrongInterface.Status, wrongInterface.Body)
	require.Contains(t, wrongInterface.Body, "必须选择 Wi-Fi 接口")

	wrongDirectionBody := fmt.Sprintf(`{"user":"%s","source_asset":"%s","target_asset":"%s","kind":"connected_to","metadata":{"link_kind":"wifi","source_interface":"%s"}}`, user.Id, ont.Id, phones[3], wifi5.Id)
	wrongDirection := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/collections/asset_relations/records", strings.NewReader(wrongDirectionBody), headers)
	require.Equal(t, http.StatusBadRequest, wrongDirection.Status, wrongDirection.Body)
	require.Contains(t, wrongDirection.Body, "必须由终端指向")

	wrongKind := createWiFiRelation(phones[4], ont.Id, "depends_on", wifi5.Id)
	require.Equal(t, http.StatusBadRequest, wrongKind.Status, wrongKind.Body)
	require.Contains(t, wrongKind.Body, "必须使用网络连接关系")
}

func testAssetInterfaceValidationValidatesONTState(t *testing.T, hub *pulseTests.TestHub) {
	user, err := pulseTests.CreateUser(hub, "asset-ont-interface-state@example.com", "password")
	require.NoError(t, err)
	token, err := user.NewAuthToken()
	require.NoError(t, err)
	headers := map[string]string{"Authorization": token}

	ont, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user": user.Id, "name": "接口验收 ONT", "type": "ont", "status": "active",
	})
	require.NoError(t, err)
	tests := []struct {
		name    string
		body    string
		message string
	}{
		{name: "missing enabled", body: `{"name":"LAN 1","kind":"lan","speed_mbps":2500,"metadata":{"role":"lan"}}`, message: "必须明确填写启用状态"},
		{name: "string enabled", body: `{"name":"LAN 1","kind":"lan","speed_mbps":2500,"metadata":{"enabled":"yes","role":"lan"}}`, message: "启用状态必须是布尔值"},
		{name: "invalid role", body: `{"name":"USB","kind":"custom","metadata":{"enabled":true,"role":"usb"}}`, message: "接口角色只能选择"},
		{name: "invalid band", body: `{"name":"6 GHz Wi-Fi","kind":"wifi","metadata":{"enabled":true,"role":"radio","band":"6 GHz"}}`, message: "无线频段只能选择"},
		{name: "disabled connected", body: `{"name":"2.4 GHz Wi-Fi","kind":"wifi","connected":true,"metadata":{"enabled":false,"role":"radio","band":"2.4 GHz"}}`, message: "未启用接口不能标记为当前接入"},
		{name: "invalid speed", body: `{"name":"LAN 1","kind":"lan","speed_mbps":-1,"metadata":{"enabled":true,"role":"lan"}}`, message: "接口速率不能小于 0"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			body := strings.TrimSuffix(tc.body, "}") + fmt.Sprintf(`,"user":"%s","asset":"%s","source":"manual"}`, user.Id, ont.Id)
			response := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/collections/asset_interfaces/records", strings.NewReader(body), headers)
			require.Equal(t, http.StatusBadRequest, response.Status, response.Body)
			require.Contains(t, response.Body, tc.message)
		})
	}

	validBody := fmt.Sprintf(`{"user":"%s","asset":"%s","name":"LAN 1","kind":"lan","speed_mbps":2500,"source":"manual","metadata":{"enabled":true,"role":"lan"}}`, user.Id, ont.Id)
	valid := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/collections/asset_interfaces/records", strings.NewReader(validBody), headers)
	require.Equal(t, http.StatusOK, valid.Status, valid.Body)
}

func testAssetMasterValidationRequiresStrictONTProfile(t *testing.T, hub *pulseTests.TestHub) {
	user, err := pulseTests.CreateUser(hub, "asset-ont-profile@example.com", "password")
	require.NoError(t, err)
	token, err := user.NewAuthToken()
	require.NoError(t, err)
	headers := map[string]string{"Authorization": token}

	validBody := fmt.Sprintf(`{
		"user":"%s",
		"name":"家庭主网关",
		"type":"ont",
		"status":"active",
		"vendor":"华为",
		"model":"V271-20",
		"management_ip":"192.168.1.1",
		"location":"家 / 弱电箱",
		"metadata":{
			"carrier":"中国联通",
			"operating_role":"ifttr_main_gateway",
			"fixed_ipv4":"192.168.1.1",
			"pon_standard":"10G-EPON",
			"wifi_24_supported":"supported",
			"wifi_24_enabled":"disabled",
			"wifi_5_supported":"supported",
			"wifi_5_enabled":"enabled",
			"lan_port_count":4,
			"lan_2500_count":1,
			"lan_1000_count":3
		}
	}`, user.Id)
	valid := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/collections/assets/records", strings.NewReader(validBody), headers)
	require.Equal(t, http.StatusOK, valid.Status, valid.Body)
	require.Contains(t, valid.Body, `"role":"iFTTR 主网关"`)

	tests := []struct {
		name     string
		metadata string
		message  string
	}{
		{name: "carrier", metadata: `"carrier":"其他","operating_role":"ifttr_main_gateway","fixed_ipv4":"192.168.1.2"`, message: "运营商只能选择"},
		{name: "role", metadata: `"carrier":"中国联通","operating_role":"custom","fixed_ipv4":"192.168.1.3"`, message: "工作角色只能选择"},
		{name: "wifi state", metadata: `"carrier":"中国联通","operating_role":"ifttr_main_gateway","fixed_ipv4":"192.168.1.4","wifi_5_enabled":"auto"`, message: "启用状态只能选择"},
		{name: "negative count", metadata: `"carrier":"中国联通","operating_role":"ifttr_main_gateway","fixed_ipv4":"192.168.1.5","lan_port_count":-1`, message: "端口数量必须是非负整数"},
		{name: "ipv4", metadata: `"carrier":"中国联通","operating_role":"ifttr_main_gateway","fixed_ipv4":"999.1.1.1"`, message: "管理 IPv4 格式不正确"},
		{name: "mac", metadata: `"carrier":"中国联通","operating_role":"ifttr_main_gateway","fixed_ipv4":"192.168.1.6","mac":"invalid"`, message: "MAC 格式不正确"},
		{name: "ssid", metadata: `"carrier":"中国联通","operating_role":"ifttr_main_gateway","fixed_ipv4":"192.168.1.7","ssid":"redacted"`, message: "不允许保存 Wi-Fi 名称、密码或认证凭据"},
		{name: "password", metadata: `"carrier":"中国联通","operating_role":"ifttr_main_gateway","fixed_ipv4":"192.168.1.8","wifi_password":"redacted"`, message: "不允许保存 Wi-Fi 名称、密码或认证凭据"},
		{name: "outside template", metadata: `"carrier":"中国联通","operating_role":"ifttr_main_gateway","fixed_ipv4":"192.168.1.9","cpu_model":"not-allowed"`, message: "不属于光猫 / ONT 严格模板"},
	}
	for index, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			body := fmt.Sprintf(`{"user":"%s","name":"无效 ONT %d","type":"ont","status":"active","vendor":"华为","model":"V271-20","location":"家 / 弱电箱","metadata":{%s}}`, user.Id, index, tc.metadata)
			response := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/collections/assets/records", strings.NewReader(body), headers)
			require.Equal(t, http.StatusBadRequest, response.Status, response.Body)
			require.Contains(t, response.Body, tc.message)
		})
	}

	legacy, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user": user.Id, "name": "历史 ONT", "type": "ont", "status": "active", "vendor": "华为", "model": "Legacy",
		"location": "家 / 弱电箱", "metadata": map[string]any{
			"carrier": "中国联通", "operating_role": "bridge_ont", "fixed_ipv4": "192.168.1.10", "legacy_field": "keep",
		},
	})
	require.NoError(t, err)
	kept := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPatch, "/api/collections/assets/records/"+legacy.Id,
		strings.NewReader(`{"metadata":{"carrier":"中国联通","operating_role":"bridge_ont","fixed_ipv4":"192.168.1.10","legacy_field":"keep"}}`), headers)
	require.Equal(t, http.StatusOK, kept.Status, kept.Body)
	changed := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPatch, "/api/collections/assets/records/"+legacy.Id,
		strings.NewReader(`{"metadata":{"carrier":"中国联通","operating_role":"bridge_ont","fixed_ipv4":"192.168.1.10","legacy_field":"changed"}}`), headers)
	require.Equal(t, http.StatusBadRequest, changed.Status, changed.Body)
	require.Contains(t, changed.Body, "不属于光猫 / ONT 严格模板")
}

func testAssetMasterValidationRequiresStrictInternetProfile(t *testing.T, hub *pulseTests.TestHub) {
	user, err := pulseTests.CreateUser(hub, "asset-internet-profile@example.com", "password")
	require.NoError(t, err)
	token, err := user.NewAuthToken()
	require.NoError(t, err)
	headers := map[string]string{"Authorization": token}

	valid := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/collections/assets/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","name":"严格宽带","type":"internet","status":"active","vendor":"中国联通","metadata":{"access_technology":"ftth","auth_mode":"pppoe","down_mbps":1000,"up_mbps":300}}`, user.Id)), headers)
	require.Equal(t, http.StatusOK, valid.Status, valid.Body)

	invalidProvider := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/collections/assets/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","name":"无效运营商宽带","type":"internet","status":"active","vendor":"广电","metadata":{"access_technology":"ftth","auth_mode":"pppoe","down_mbps":1000,"up_mbps":300}}`, user.Id)), headers)
	require.Equal(t, http.StatusBadRequest, invalidProvider.Status, invalidProvider.Body)
	require.Contains(t, invalidProvider.Body, "中国电信、中国联通或中国移动")

	invalidStatus := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/collections/assets/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","name":"规划宽带","type":"internet","status":"planned","vendor":"中国联通","metadata":{"access_technology":"ftth","auth_mode":"pppoe","down_mbps":1000,"up_mbps":300}}`, user.Id)), headers)
	require.Equal(t, http.StatusBadRequest, invalidStatus.Status, invalidStatus.Body)
	require.Contains(t, invalidStatus.Body, "使用中、暂停服务或已注销")

	invalidFields := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/collections/assets/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","name":"字段错误宽带","type":"internet","status":"active","vendor":"中国联通","metadata":{"access_technology":"unknown","auth_mode":"other","down_mbps":0,"up_mbps":-1,"cpu_model":"不允许"}}`, user.Id)), headers)
	require.Equal(t, http.StatusBadRequest, invalidFields.Status, invalidFields.Body)

	invalidExtraField := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/collections/assets/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","name":"越界字段宽带","type":"internet","status":"active","vendor":"中国联通","metadata":{"access_technology":"ftth","auth_mode":"pppoe","down_mbps":1000,"up_mbps":300,"cpu_model":"不允许"}}`, user.Id)), headers)
	require.Equal(t, http.StatusBadRequest, invalidExtraField.Status, invalidExtraField.Body)
	require.Contains(t, invalidExtraField.Body, "不属于互联网接入严格模板")

	invalidRefreshInterval := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/collections/assets/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","name":"间隔错误宽带","type":"internet","status":"active","vendor":"中国联通","metadata":{"access_technology":"ftth","auth_mode":"pppoe","down_mbps":1000,"up_mbps":300,"public_ip_auto_refresh":"yes","public_ip_refresh_interval_minutes":37}}`, user.Id)), headers)
	require.Equal(t, http.StatusBadRequest, invalidRefreshInterval.Status, invalidRefreshInterval.Body)
	require.Contains(t, invalidRefreshInterval.Body, "更新时间只能选择")
}

func testAssetRelationValidationEnforcesInternetBoundary(t *testing.T, hub *pulseTests.TestHub) {
	user, err := pulseTests.CreateUser(hub, "asset-internet-relation@example.com", "password")
	require.NoError(t, err)
	token, err := user.NewAuthToken()
	require.NoError(t, err)
	headers := map[string]string{"Authorization": token}

	internet, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user": user.Id, "name": "验收宽带", "type": "internet", "status": "active",
	})
	require.NoError(t, err)
	ont, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user": user.Id, "name": "验收光猫", "type": "ont", "status": "active",
	})
	require.NoError(t, err)
	router, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user": user.Id, "name": "验收路由器", "type": "router", "status": "active",
	})
	require.NoError(t, err)
	switchAsset, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user": user.Id, "name": "验收交换机", "type": "switch", "status": "active",
	})
	require.NoError(t, err)

	ontPon, err := pulseTests.CreateRecord(hub, "asset_interfaces", map[string]any{
		"user": user.Id, "asset": ont.Id, "name": "PON", "kind": "pon", "source": "manual",
		"metadata": map[string]any{"enabled": true, "role": "uplink"},
	})
	require.NoError(t, err)
	ontOptical, err := pulseTests.CreateRecord(hub, "asset_interfaces", map[string]any{
		"user": user.Id, "asset": ont.Id, "name": "下联光口", "kind": "optical", "source": "manual",
		"metadata": map[string]any{"enabled": true, "role": "downlink"},
	})
	require.NoError(t, err)
	ontDownlinkPON, err := pulseTests.CreateRecord(hub, "asset_interfaces", map[string]any{
		"user": user.Id, "asset": ont.Id, "name": "错误下联 PON", "kind": "pon", "source": "manual",
		"metadata": map[string]any{"enabled": true, "role": "downlink"},
	})
	require.NoError(t, err)
	ontLan, err := pulseTests.CreateRecord(hub, "asset_interfaces", map[string]any{
		"user": user.Id, "asset": ont.Id, "name": "LAN 1", "kind": "lan", "source": "manual",
		"metadata": map[string]any{"enabled": true, "role": "lan"},
	})
	require.NoError(t, err)
	routerWan, err := pulseTests.CreateRecord(hub, "asset_interfaces", map[string]any{
		"user": user.Id, "asset": router.Id, "name": "WAN", "kind": "wan", "source": "manual",
	})
	require.NoError(t, err)
	switchWan, err := pulseTests.CreateRecord(hub, "asset_interfaces", map[string]any{
		"user": user.Id, "asset": switchAsset.Id, "name": "WAN", "kind": "wan", "source": "manual",
	})
	require.NoError(t, err)

	accepted := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/collections/asset_relations/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","source_asset":"%s","target_asset":"%s","kind":"connected_to","metadata":{"link_kind":"internet","target_interface":"%s"}}`, user.Id, internet.Id, ont.Id, ontPon.Id)), headers)
	require.Equal(t, http.StatusOK, accepted.Status, accepted.Body)

	rejectedSecond := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/collections/asset_relations/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","source_asset":"%s","target_asset":"%s","kind":"connected_to","metadata":{"link_kind":"internet","target_interface":"%s"}}`, user.Id, internet.Id, router.Id, routerWan.Id)), headers)
	require.Equal(t, http.StatusBadRequest, rejectedSecond.Status, rejectedSecond.Body)
	require.Contains(t, rejectedSecond.Body, "只能关联一个当前接入设备")

	otherInternet, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user": user.Id, "name": "验收第二宽带", "type": "internet", "status": "active",
	})
	require.NoError(t, err)
	opticalInternet, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user": user.Id, "name": "验收第三宽带", "type": "internet", "status": "active",
	})
	require.NoError(t, err)
	rejectedOptical := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/collections/asset_relations/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","source_asset":"%s","target_asset":"%s","kind":"connected_to","metadata":{"link_kind":"internet","target_interface":"%s"}}`, user.Id, opticalInternet.Id, ont.Id, ontOptical.Id)), headers)
	require.Equal(t, http.StatusBadRequest, rejectedOptical.Status, rejectedOptical.Body)
	require.Contains(t, rejectedOptical.Body, "PON 或 WAN")

	lanInternet, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user": user.Id, "name": "验收第四宽带", "type": "internet", "status": "active",
	})
	require.NoError(t, err)
	rejectedLan := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/collections/asset_relations/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","source_asset":"%s","target_asset":"%s","kind":"connected_to","metadata":{"link_kind":"internet","target_interface":"%s"}}`, user.Id, lanInternet.Id, ont.Id, ontLan.Id)), headers)
	require.Equal(t, http.StatusBadRequest, rejectedLan.Status, rejectedLan.Body)
	require.Contains(t, rejectedLan.Body, "PON 或 WAN")

	downlinkPONInternet, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user": user.Id, "name": "验收第五宽带", "type": "internet", "status": "active",
	})
	require.NoError(t, err)
	rejectedDownlinkPON := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/collections/asset_relations/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","source_asset":"%s","target_asset":"%s","kind":"connected_to","metadata":{"link_kind":"internet","target_interface":"%s"}}`, user.Id, downlinkPONInternet.Id, ont.Id, ontDownlinkPON.Id)), headers)
	require.Equal(t, http.StatusBadRequest, rejectedDownlinkPON.Status, rejectedDownlinkPON.Body)
	require.Contains(t, rejectedDownlinkPON.Body, "PON 或 WAN 上联接口")

	rejectedTarget := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/collections/asset_relations/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","source_asset":"%s","target_asset":"%s","kind":"connected_to","metadata":{"link_kind":"internet","target_interface":"%s"}}`, user.Id, otherInternet.Id, switchAsset.Id, switchWan.Id)), headers)
	require.Equal(t, http.StatusBadRequest, rejectedTarget.Status, rejectedTarget.Body)
	require.Contains(t, rejectedTarget.Body, "光猫、路由器或网关")

	rejectedMissingInterface := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/collections/asset_relations/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","source_asset":"%s","target_asset":"%s","kind":"connected_to","metadata":{"link_kind":"internet"}}`, user.Id, otherInternet.Id, router.Id)), headers)
	require.Equal(t, http.StatusBadRequest, rejectedMissingInterface.Status, rejectedMissingInterface.Body)
	require.Contains(t, rejectedMissingInterface.Body, "PON 或 WAN")
}

func testAssetMasterValidationRejectsCrossUserAssetReferences(t *testing.T, hub *pulseTests.TestHub) {
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

func testAssetMasterValidationRejectsDuplicateAssets(t *testing.T, hub *pulseTests.TestHub) {
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

func testAssetMasterValidationRequiresPhoneVariantSpecs(t *testing.T, hub *pulseTests.TestHub) {
	user, err := pulseTests.CreateUser(hub, "asset-phone-variant@example.com", "password")
	require.NoError(t, err)
	token, err := user.NewAuthToken()
	require.NoError(t, err)
	headers := map[string]string{"Authorization": token}

	missingMemory := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/assets/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","name":"Redmi K50","type":"phone","metadata":{"storage_gb":256}}`, user.Id)),
		headers,
	)
	require.Equal(t, http.StatusBadRequest, missingMemory.Status, missingMemory.Body)
	require.Contains(t, missingMemory.Body, "手机资产必须填写运行内存")

	missingStorage := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/assets/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","name":"Redmi K50","type":"phone","metadata":{"memory_gb":12}}`, user.Id)),
		headers,
	)
	require.Equal(t, http.StatusBadRequest, missingStorage.Status, missingStorage.Body)
	require.Contains(t, missingStorage.Body, "手机资产必须填写存储容量")

	completePhone := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/assets/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","name":"Redmi K50","type":"phone","metadata":{"memory_gb":12,"storage_gb":256}}`, user.Id)),
		headers,
	)
	require.Equal(t, http.StatusOK, completePhone.Status, completePhone.Body)
}

func testAssetInterfaceValidationKeepsSinglePrimaryInterface(t *testing.T, hub *pulseTests.TestHub) {
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

func testAssetInterfaceValidationRejectsDuplicateNetworkIdentifiers(t *testing.T, hub *pulseTests.TestHub) {
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

func testAssetRelationValidationRejectsInvalidEndpoints(t *testing.T, hub *pulseTests.TestHub) {
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

func testAssetRelationValidationRejectsDuplicateEndpoints(t *testing.T, hub *pulseTests.TestHub) {
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

func testAssetRelationValidationRejectsInterfaceEndpointMismatch(t *testing.T, hub *pulseTests.TestHub) {
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

func testAssetLocationValidationRejectsCrossUserParentAndCycles(t *testing.T, hub *pulseTests.TestHub) {
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
