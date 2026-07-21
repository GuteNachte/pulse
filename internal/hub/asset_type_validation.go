package hub

import (
	"net"
	"reflect"
	"regexp"
	"strconv"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	"gutenacht.site/pulse/internal/assetcatalog"
)

var ontAssetAllowedMetadataFields = assetcatalog.MustParameterRegistry().AllowedMetadataKeys("ont")

var ontIdentityValuePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9.\-:/]{3,63}$`)

var internetAssetAllowedMetadataFields = withLegacyAssetMetadataKeys(
	assetcatalog.MustParameterRegistry().AllowedMetadataKeys("internet"),
	"access_mode",
)

var switchAssetAllowedMetadataFields = withLegacyAssetMetadataKeys(
	assetcatalog.MustParameterRegistry().AllowedMetadataKeys("switch"),
	"color",
	"device_color",
	"colors_available",
	"official_colors",
	"official_image_url",
)

func withLegacyAssetMetadataKeys(allowed map[string]bool, keys ...string) map[string]bool {
	for _, key := range keys {
		allowed[key] = true
	}
	return allowed
}

func (h *Hub) validateSwitchAssetRecord(e *core.RecordRequestEvent) error {
	if e == nil || e.Record == nil || strings.TrimSpace(e.Record.GetString("type")) != "switch" {
		return nil
	}
	metadata := recordJSONMap(e.Record, "metadata")
	if value := metadataString(metadata, "management_level"); value != "" && !stringInSet(value, "unmanaged", "smart", "managed") {
		return e.BadRequestError("管理级别只能选择非网管、轻管理或全管理。", nil)
	}
	if value := metadataString(metadata, "management_access"); value != "" && !stringInSet(value, "none", "web", "app", "desktop", "cli") {
		return e.BadRequestError("主要管理入口只能选择无、Web、App、桌面客户端或命令行。", nil)
	}
	for _, key := range []string{"vlan_status", "port_isolation_status", "link_aggregation_status"} {
		if value := metadataString(metadata, key); value != "" && !stringInSet(value, "unsupported", "disabled", "enabled") {
			return e.BadRequestError(""+map[string]string{"vlan_status": "VLAN", "port_isolation_status": "端口隔离", "link_aggregation_status": "链路聚合"}[key]+"状态只能选择不支持、未启用或已启用。", nil)
		}
	}
	if value := metadataString(metadata, "power_mode"); value != "" && !stringInSet(value, "external", "internal", "other", "unknown") {
		return e.BadRequestError("供电方式只能选择外置电源、内置电源、其他或未确认。", nil)
	}
	if value := metadataString(metadata, "forwarding_method"); value != "" && !stringInSet(value, "store_and_forward", "cut_through") {
		return e.BadRequestError("转发方式只能选择存储转发或直通转发。", nil)
	}
	for _, key := range []string{"ethernet_port_count", "optical_port_count", "other_port_count"} {
		if value, exists := metadata[key]; exists && value != nil && !isBlankMetadataValue(value) && !isNonNegativeInteger(value) {
			return e.BadRequestError("端口数量必须是非负整数。", nil)
		}
	}
	for _, key := range []string{"default_ethernet_speed_mbps", "default_optical_speed_mbps", "switching_capacity_gbps"} {
		if value, exists := metadata[key]; exists && value != nil && !isBlankMetadataValue(value) && !isNonNegativeNumber(value) {
			return e.BadRequestError("端口速率、交换容量和 PoE 预算不能小于 0。", nil)
		}
	}
	for _, key := range []string{"net_weight_g", "lightning_protection_kv", "warranty_months"} {
		if value, exists := metadata[key]; exists && value != nil && !isBlankMetadataValue(value) && !isNonNegativeNumber(value) {
			return e.BadRequestError("重量、防雷等级和保修期不能小于 0。", nil)
		}
	}
	if value, exists := metadata["mac_table_entries"]; exists && value != nil && !isBlankMetadataValue(value) && !isNonNegativeInteger(value) {
		return e.BadRequestError("MAC 地址表容量必须是非负整数。", nil)
	}
	originalMetadata := map[string]any{}
	if original := e.Record.Original(); original != nil {
		originalMetadata = recordJSONMap(original, "metadata")
	}
	for key, value := range metadata {
		if isSensitiveONTMetadataKey(key) {
			return e.BadRequestError("不允许保存密码、认证凭据或 Wi-Fi 名称。", nil)
		}
		if switchAssetAllowedMetadataFields[key] {
			continue
		}
		if originalValue, existed := originalMetadata[key]; !existed || !reflect.DeepEqual(originalValue, value) {
			return e.BadRequestError("字段 "+key+" 不属于交换机严格模板。", nil)
		}
	}
	return nil
}

func (h *Hub) validateInternetAssetRecord(e *core.RecordRequestEvent) error {
	if e == nil || e.Record == nil || strings.TrimSpace(e.Record.GetString("type")) != "internet" {
		return nil
	}
	if strings.TrimSpace(e.Record.GetString("name")) == "" {
		return e.BadRequestError("互联网接入资源必须填写资源名称。", nil)
	}
	provider := normalizeInternetProviderValue(e.Record.GetString("vendor"))
	switch provider {
	case "中国电信", "中国联通", "中国移动":
		e.Record.Set("vendor", provider)
	default:
		return e.BadRequestError("运营商只能选择中国电信、中国联通或中国移动。", nil)
	}
	switch strings.TrimSpace(e.Record.GetString("status")) {
	case "active", "inactive", "retired":
	default:
		return e.BadRequestError("互联网接入状态只能选择使用中、暂停服务或已注销。", nil)
	}
	metadata := recordJSONMap(e.Record, "metadata")
	if !stringInSet(metadataString(metadata, "access_technology"), "ftth", "dedicated_line", "mobile") {
		return e.BadRequestError("线路接入技术必须选择家庭光纤宽带、专线或移动网络。", nil)
	}
	if !stringInSet(metadataString(metadata, "auth_mode"), "pppoe", "dhcp", "static") {
		return e.BadRequestError("联网认证方式必须选择 PPPoE、DHCP/IPoE 或静态 IP。", nil)
	}
	if !recordMetadataPositiveNumber(e.Record, "down_mbps") {
		return e.BadRequestError("下行带宽必须是大于 0 的 Mbps 数值。", nil)
	}
	if !recordMetadataPositiveNumber(e.Record, "up_mbps") {
		return e.BadRequestError("上行带宽必须是大于 0 的 Mbps 数值。", nil)
	}
	if value := metadataString(metadata, "billing_cycle"); value != "" && !stringInSet(value, "monthly", "quarterly", "semiannual", "yearly") {
		return e.BadRequestError("计费周期必须选择月付、季付、半年付或年付。", nil)
	}
	if value := metadataString(metadata, "auto_renew"); value != "" && !stringInSet(value, "yes", "no") {
		return e.BadRequestError("自动续费必须选择是或否。", nil)
	}
	if value := metadataString(metadata, "public_ip_auto_refresh"); value != "" && !stringInSet(value, "yes", "no") {
		return e.BadRequestError("公网地址自动更新只能选择开启或关闭。", nil)
	}
	if value, exists := metadata["public_ip_refresh_interval_minutes"]; exists && value != nil {
		minutes, parsed := parseInternetAddressRefreshIntervalMinutes(value)
		if !parsed || !isAllowedInternetAddressRefreshInterval(minutes) {
			return e.BadRequestError("公网地址更新时间只能选择 15 分钟、30 分钟、1 小时、6 小时、12 小时或 24 小时。", nil)
		}
	}
	originalMetadata := map[string]any{}
	if original := e.Record.Original(); original != nil {
		originalMetadata = recordJSONMap(original, "metadata")
	}
	for key, value := range metadata {
		if internetAssetAllowedMetadataFields[key] {
			continue
		}
		originalValue, existed := originalMetadata[key]
		if !existed || !reflect.DeepEqual(originalValue, value) {
			return e.BadRequestError("字段 "+key+" 不属于互联网接入严格模板。", nil)
		}
	}
	return nil
}

func (h *Hub) validateONTAssetRecord(e *core.RecordRequestEvent) error {
	if e == nil || e.Record == nil || strings.TrimSpace(e.Record.GetString("type")) != "ont" {
		return nil
	}
	if strings.TrimSpace(e.Record.GetString("name")) == "" {
		return e.BadRequestError("光猫 / ONT 必须填写资产名称。", nil)
	}
	if strings.TrimSpace(e.Record.GetString("vendor")) == "" {
		return e.BadRequestError("光猫 / ONT 必须填写厂商 / 品牌。", nil)
	}
	if strings.TrimSpace(e.Record.GetString("model")) == "" {
		return e.BadRequestError("光猫 / ONT 必须填写型号 / 规格。", nil)
	}
	if strings.TrimSpace(e.Record.GetString("location")) == "" {
		return e.BadRequestError("光猫 / ONT 必须填写位置。", nil)
	}
	if !stringInSet(strings.TrimSpace(e.Record.GetString("status")), "active", "inactive", "retired") {
		return e.BadRequestError("光猫 / ONT 状态只能选择使用中、未启用或已停用。", nil)
	}

	metadata := recordJSONMap(e.Record, "metadata")
	if !stringInSet(metadataString(metadata, "carrier"), "中国电信", "中国联通", "中国移动") {
		return e.BadRequestError("运营商只能选择中国电信、中国联通或中国移动。", nil)
	}
	switch role := metadataString(metadata, "operating_role"); role {
	case "bridge_ont":
		e.Record.Set("role", "桥接光猫")
	case "router_ont":
		e.Record.Set("role", "光猫路由一体机")
	case "ifttr_main_gateway":
		e.Record.Set("role", "iFTTR 主网关")
	default:
		return e.BadRequestError("工作角色只能选择桥接光猫、光猫路由一体机或 iFTTR 主网关。", nil)
	}

	for _, key := range []string{
		"downstream_optical_status", "router_status", "gateway_status", "dhcp_status", "wifi_24_enabled", "wifi_5_enabled",
	} {
		if value := metadataString(metadata, key); value != "" && !stringInSet(value, "enabled", "disabled") {
			return e.BadRequestError("启用状态只能选择启用或未启用。", nil)
		}
	}
	for _, key := range []string{
		"wifi_24_supported", "wifi_5_supported", "wps_supported", "indicator_control", "wireless_control", "reset_supported", "power_switch_supported",
	} {
		if value := metadataString(metadata, key); value != "" && !stringInSet(value, "supported", "unsupported") {
			return e.BadRequestError("支持状态只能选择支持或不支持。", nil)
		}
	}
	for _, key := range []string{
		"downstream_optical_port_count", "lan_port_count", "lan_2500_count", "lan_1000_count", "usb_port_count", "voice_port_count",
	} {
		if value, exists := metadata[key]; exists && value != nil && !isNonNegativeInteger(value) {
			return e.BadRequestError("端口数量必须是非负整数。", nil)
		}
	}
	for _, value := range []string{metadataString(metadata, "fixed_ipv4"), strings.TrimSpace(e.Record.GetString("management_ip"))} {
		if value != "" {
			ip := net.ParseIP(value)
			if ip == nil || ip.To4() == nil {
				return e.BadRequestError("管理 IPv4 格式不正确。", nil)
			}
		}
	}
	if subnet := metadataString(metadata, "lan_subnet"); subnet != "" {
		ip, _, err := net.ParseCIDR(subnet)
		if err != nil || ip.To4() == nil {
			return e.BadRequestError("LAN 网段必须使用 IPv4 CIDR 格式，例如 192.168.1.0/24。", nil)
		}
	}
	if mac := metadataString(metadata, "mac"); mac != "" {
		if _, err := net.ParseMAC(mac); err != nil {
			return e.BadRequestError("MAC 格式不正确。", err)
		}
	}
	for _, value := range []string{
		metadataString(metadata, "product_number"), metadataString(metadata, "pon_sn"), strings.TrimSpace(e.Record.GetString("serial_number")),
	} {
		if value != "" && !ontIdentityValuePattern.MatchString(value) {
			return e.BadRequestError("设备身份标识格式不正确。", nil)
		}
	}

	originalMetadata := map[string]any{}
	if original := e.Record.Original(); original != nil {
		originalMetadata = recordJSONMap(original, "metadata")
	}
	for key, value := range metadata {
		if isSensitiveONTMetadataKey(key) {
			return e.BadRequestError("不允许保存 Wi-Fi 名称、密码或认证凭据。", nil)
		}
		if ontAssetAllowedMetadataFields[key] {
			continue
		}
		originalValue, existed := originalMetadata[key]
		if !existed || !reflect.DeepEqual(originalValue, value) {
			return e.BadRequestError("字段 "+key+" 不属于光猫 / ONT 严格模板。", nil)
		}
	}
	return nil
}

func normalizeSensitiveMetadataKey(value string) string {
	replacer := strings.NewReplacer("_", "", "-", "", " ", "")
	return replacer.Replace(strings.ToLower(strings.TrimSpace(value)))
}

func isSensitiveONTMetadataKey(key string) bool {
	normalized := normalizeSensitiveMetadataKey(key)
	for _, fragment := range []string{"password", "passwd", "secret", "token", "credential", "ssid", "wifiname", "qrcode", "broadbandaccount"} {
		if strings.Contains(normalized, fragment) {
			return true
		}
	}
	return false
}

func isNonNegativeInteger(value any) bool {
	text := strings.TrimSpace(strings.TrimSuffix(strings.TrimSuffix(strings.TrimSpace(toString(value)), ".0"), ".00"))
	if text == "" {
		return false
	}
	number, err := strconv.ParseInt(text, 10, 64)
	return err == nil && number >= 0
}

func isBlankMetadataValue(value any) bool {
	text, ok := value.(string)
	return ok && strings.TrimSpace(text) == ""
}

func isNonNegativeNumber(value any) bool {
	text := strings.TrimSpace(toString(value))
	if text == "" {
		return false
	}
	number, err := strconv.ParseFloat(text, 64)
	return err == nil && number >= 0
}

func toString(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case int:
		return strconv.Itoa(typed)
	case int64:
		return strconv.FormatInt(typed, 10)
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	default:
		return ""
	}
}

func normalizeInternetProviderValue(value string) string {
	switch strings.TrimSpace(value) {
	case "电信":
		return "中国电信"
	case "联通":
		return "中国联通"
	case "移动":
		return "中国移动"
	default:
		return strings.TrimSpace(value)
	}
}

func stringInSet(value string, allowed ...string) bool {
	for _, item := range allowed {
		if value == item {
			return true
		}
	}
	return false
}
