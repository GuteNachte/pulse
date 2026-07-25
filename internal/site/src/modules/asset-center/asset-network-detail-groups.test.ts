import assert from "node:assert/strict"
import { groupNetworkDeviceDetailRows } from "./asset-network-detail-groups.ts"

const row = (fieldKey: string) => ({ fieldKey, row: fieldKey })
const summarize = (type: Parameters<typeof groupNetworkDeviceDetailRows<string>>[0], fieldKeys: string[]) =>
	groupNetworkDeviceDetailRows(type, fieldKeys.map(row)).map((group) => ({
		title: group.title,
		rows: group.rows,
	}))

assert.deepEqual(
	summarize("router", [
		"wifi_standard",
		"wifi_band",
		"wifi_streams",
		"port_count",
		"default_port_speed_mbps",
		"wan_port_count",
		"ssid_note",
		"vlan_note",
		"antenna_type",
	]),
	[
		{ title: "有线网络", rows: ["port_count", "default_port_speed_mbps", "wan_port_count"] },
		{ title: "无线网络", rows: ["wifi_standard", "wifi_band", "wifi_streams", "antenna_type"] },
		{ title: "网络规划", rows: ["ssid_note", "vlan_note"] },
	]
)

assert.deepEqual(summarize("gateway", ["port_count", "default_port_speed_mbps", "wan_port_count", "vlan_note"]), [
	{ title: "接口与转发", rows: ["port_count", "default_port_speed_mbps", "wan_port_count"] },
	{ title: "网络规划", rows: ["vlan_note"] },
])

assert.deepEqual(
	summarize("ap", [
		"wifi_standard",
		"wifi_band",
		"wifi_streams",
		"port_count",
		"default_port_speed_mbps",
		"ssid_note",
		"vlan_note",
		"antenna_type",
		"poe_standard",
	]),
	[
		{ title: "有线接入", rows: ["port_count", "default_port_speed_mbps", "poe_standard"] },
		{
			title: "无线网络",
			rows: ["wifi_standard", "wifi_band", "wifi_streams", "ssid_note", "antenna_type"],
		},
		{ title: "网络规划", rows: ["vlan_note"] },
	]
)

assert.deepEqual(
	summarize("firewall", [
		"port_count",
		"default_port_speed_mbps",
		"vlan_note",
		"security_throughput_gbps",
		"vpn_throughput_gbps",
		"session_capacity",
	]),
	[
		{ title: "接口与转发", rows: ["port_count", "default_port_speed_mbps"] },
		{
			title: "安全性能",
			rows: ["security_throughput_gbps", "vpn_throughput_gbps", "session_capacity"],
		},
		{ title: "网络规划", rows: ["vlan_note"] },
	]
)

assert.deepEqual(summarize("ont", ["indicator_control", "unknown_network_field"]), [
	{ title: "设备控制", rows: ["indicator_control"] },
	{ title: "网络", rows: ["unknown_network_field"] },
])
assert.deepEqual(summarize("router", []), [])

console.log("network device detail grouping contract passed")
