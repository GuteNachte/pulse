import type { AssetType } from "@/types"

export type NetworkDetailRow<T> = {
	fieldKey: string
	row: T
}

export type NetworkDetailGroup<T> = {
	id: string
	title: string
	rows: T[]
}

type NetworkDetailGroupDefinition = {
	id: string
	title: string
	fieldKeys: readonly string[]
}

const groupDefinitions: Partial<Record<AssetType, readonly NetworkDetailGroupDefinition[]>> = {
	router: [
		definition("router-wired", "有线网络", ["port_count", "default_port_speed_mbps", "wan_port_count"]),
		definition("router-wireless", "无线网络", [
			"wifi_standard",
			"wifi_band",
			"wifi_streams",
			"antenna_type",
		]),
		definition("router-planning", "网络规划", ["ssid_note", "vlan_note"]),
	],
	gateway: [
		definition("gateway-forwarding", "接口与转发", [
			"port_count",
			"default_port_speed_mbps",
			"wan_port_count",
		]),
		definition("gateway-planning", "网络规划", ["vlan_note"]),
	],
	ont: [
		definition("ont-access-role", "接入角色", ["carrier", "operating_role", "radio_approval_code"]),
		definition("ont-fiber-access", "光纤接入", [
			"pon_standard",
			"pon_uplink_capacity",
			"pon_sn",
			"onu_type",
			"optical_connector",
			"downstream_optical_port_count",
			"downstream_optical_status",
		]),
		definition("ont-routing-management", "路由与管理", [
			"router_status",
			"gateway_status",
			"dhcp_status",
			"lan_subnet",
		]),
		definition("ont-wireless", "无线网络", [
			"wifi_standard",
			"wifi_24_supported",
			"wifi_24_enabled",
			"wifi_5_supported",
			"wifi_5_enabled",
			"wps_supported",
			"wireless_control",
		]),
		definition("ont-wired", "有线网络", ["lan_port_count", "lan_2500_count", "lan_1000_count"]),
		definition("ont-device-controls", "设备控制", [
			"indicator_control",
			"reset_supported",
			"power_switch_supported",
		]),
	],
	ap: [
		definition("ap-wired", "有线接入", ["port_count", "default_port_speed_mbps", "poe_standard"]),
		definition("ap-wireless", "无线网络", [
			"wifi_standard",
			"wifi_band",
			"wifi_streams",
			"antenna_type",
			"ssid_note",
		]),
		definition("ap-planning", "网络规划", ["vlan_note"]),
	],
	firewall: [
		definition("firewall-forwarding", "接口与转发", ["port_count", "default_port_speed_mbps"]),
		definition("firewall-security", "安全性能", [
			"security_throughput_gbps",
			"vpn_throughput_gbps",
			"session_capacity",
		]),
		definition("firewall-planning", "网络规划", ["vlan_note"]),
	],
	switch: [
		definition("switch-network-functions", "网络功能", [
			"vlan_status",
			"management_level",
			"management_access",
			"port_isolation_status",
			"link_aggregation_status",
			"switching_capacity_gbps",
			"mac_table_entries",
			"forwarding_method",
		]),
	],
}

export function groupNetworkDeviceDetailRows<T>(
	type: AssetType,
	items: readonly NetworkDetailRow<T>[]
): NetworkDetailGroup<T>[] {
	if (items.length === 0) return []
	const definitions = groupDefinitions[type]
	if (!definitions) return [{ id: "network", title: "网络", rows: items.map((item) => item.row) }]

	const groupByFieldKey = new Map<string, NetworkDetailGroupDefinition>()
	for (const definition of definitions) {
		for (const fieldKey of definition.fieldKeys) groupByFieldKey.set(fieldKey, definition)
	}
	const rowsByGroupId = new Map<string, T[]>()
	const fallbackRows: T[] = []
	for (const item of items) {
		const definition = groupByFieldKey.get(item.fieldKey)
		if (!definition) {
			fallbackRows.push(item.row)
			continue
		}
		const rows = rowsByGroupId.get(definition.id) ?? []
		rows.push(item.row)
		rowsByGroupId.set(definition.id, rows)
	}

	const groups = definitions.flatMap((definition) => {
		const rows = rowsByGroupId.get(definition.id) ?? []
		return rows.length > 0 ? [{ id: definition.id, title: definition.title, rows }] : []
	})
	if (fallbackRows.length > 0) groups.push({ id: "network-fallback", title: "网络", rows: fallbackRows })
	return groups
}

function definition(id: string, title: string, fieldKeys: readonly string[]): NetworkDetailGroupDefinition {
	return { id, title, fieldKeys }
}
