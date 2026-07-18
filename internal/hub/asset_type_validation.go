package hub

import (
	"reflect"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

var internetAssetAllowedMetadataFields = map[string]bool{
	"asset_tag": true,
	"access_mode": true,
	"access_technology": true,
	"auth_mode": true,
	"down_mbps": true,
	"up_mbps": true,
	"public_ipv4": true,
	"public_ipv6": true,
	"public_ip_checked_at": true,
	"public_ipv4_error": true,
	"public_ipv6_error": true,
	"public_ipv4_source": true,
	"public_ipv6_source": true,
	"public_ipv4_candidate": true,
	"public_ipv6_candidate": true,
	"public_ipv4_candidate_checked_at": true,
	"public_ipv6_candidate_checked_at": true,
	"package_name": true,
	"recurring_price_cny": true,
	"billing_cycle": true,
	"renewal_date": true,
	"auto_renew": true,
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
