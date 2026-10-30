import assert from "node:assert/strict"
import type { AssetInterfaceRecord, AssetRecord, AssetRelationRecord } from "@/types"
import { buildNetworkDeviceDetailModel } from "./asset-network-detail-model.ts"

const baseAsset = {
	id: "ont",
	user: "user",
	name: "华为 iFTTR 主网关",
	type: "ont",
	status: "active",
	created: "2026-07-22 00:00:00.000Z",
	updated: "2026-07-22 00:00:00.000Z",
} as unknown as AssetRecord

assert.equal(
	buildNetworkDeviceDetailModel({ ...baseAsset, type: "phone" } as AssetRecord, [], [], []),
	undefined,
	"non-network assets must keep the standard parameter layout"
)

const ont = {
	...baseAsset,
	metadata: {
		carrier: "中国联通",
		operating_role: "ifttr_main_gateway",
		pon_standard: "10G-EPON",
		router_status: "enabled",
		gateway_status: "enabled",
		dhcp_status: "enabled",
		lan_subnet: "192.168.1.0/24",
		wifi_standard: "Wi-Fi 7",
		wifi_24_supported: "supported",
		wifi_24_enabled: "disabled",
		wifi_5_supported: "supported",
		wifi_5_enabled: "enabled",
		lan_port_count: 4,
		indicator_control: "supported",
	},
} as unknown as AssetRecord

const ontInterfaces = [
	{
		id: "ont-pon",
		asset: "ont",
		name: "PON 上联",
		kind: "pon",
		connected: true,
		metadata: { enabled: true, role: "uplink" },
	},
	{
		id: "ont-wifi-24",
		asset: "ont",
		name: "2.4 GHz Wi-Fi",
		kind: "wifi",
		connected: false,
		metadata: { enabled: false, role: "downlink", band: "2.4 GHz" },
	},
	{
		id: "ont-wifi-5",
		asset: "ont",
		name: "5 GHz Wi-Fi",
		kind: "wifi",
		connected: true,
		metadata: { enabled: true, role: "downlink", band: "5 GHz" },
	},
	{
		id: "ont-lan-1",
		asset: "ont",
		name: "LAN 1",
		kind: "lan",
		speed_mbps: 2500,
	},
] as unknown as AssetInterfaceRecord[]

const ontAssets = [
	ont,
	{ ...baseAsset, id: "internet", name: "中国联通宽带", type: "internet" },
	{ ...baseAsset, id: "phone", name: "Redmi K50", type: "phone" },
] as unknown as AssetRecord[]

const ontRelations = [
	{
		id: "internet-ont",
		source_asset: "internet",
		target_asset: "ont",
		kind: "connected_to",
		metadata: { link_kind: "internet", target_interface: "ont-pon" },
	},
	{
		id: "phone-ont",
		source_asset: "phone",
		target_asset: "ont",
		kind: "connected_to",
		metadata: { link_kind: "wifi", target_interface: "ont-wifi-5" },
	},
] as unknown as AssetRelationRecord[]

const ontModel = buildNetworkDeviceDetailModel(ont, ontAssets, ontInterfaces, ontRelations)
assert.ok(ontModel)
assert.deepEqual(
	ontModel.capabilitySections.map((section) => section.title),
	["接入角色", "光纤接入", "路由与管理", "无线网络", "有线网络"],
	"device controls must remain outside the network capability table"
)
assert.deepEqual(
	ontModel.interfaces.map((row) => [row.name, row.medium, row.enabledState, row.connectionState, row.role, row.speed]),
	[
		["LAN 1", "LAN", "unrecorded", "unrecorded", "角色未确认", "支持 2.5 Gbps"],
		["PON 上联", "PON", "enabled", "connected", "上联", "未记录"],
		["2.4 GHz Wi-Fi", "Wi-Fi", "disabled", "disconnected", "下联", "2.4 GHz"],
		["5 GHz Wi-Fi", "Wi-Fi", "enabled", "connected", "下联", "5 GHz"],
	]
)
assert.deepEqual(
	ontModel.relations.map((row) => [
		row.directionLabel,
		row.peerAsset,
		row.currentInterface,
		row.peerInterface,
		row.linkKind,
		row.status,
	]),
	[
		["上联", "中国联通宽带", "PON 上联", "接口待确认", "外网链路", "接口待确认"],
		["下联", "Redmi K50", "5 GHz Wi-Fi", "接口待确认", "无线链路", "接口待确认"],
	]
)

const networkSwitch = {
	...baseAsset,
	id: "switch",
	name: "绿联 CM754",
	type: "switch",
	metadata: {
		vlan_status: "disabled",
		switching_capacity_gbps: 60,
		ethernet_port_count: 8,
		ethernet_supported_speeds: "10/100/1000/2500 Mbps",
		optical_port_count: 1,
	},
} as unknown as AssetRecord

const switchInterfaces = [
	{
		id: "switch-port-10",
		asset: "switch",
		name: "10G SFP+",
		kind: "optical",
		speed_mbps: 10000,
		connected: false,
		metadata: { enabled: false, role: "general" },
	},
	{
		id: "switch-port-4",
		asset: "switch",
		name: "电口 4",
		kind: "ethernet",
		speed_mbps: 2500,
		connected: false,
		metadata: { enabled: true, role: "downlink" },
	},
	{
		id: "switch-port-3",
		asset: "switch",
		name: "电口 3",
		kind: "ethernet",
		speed_mbps: 2500,
	},
	{
		id: "switch-port-1",
		asset: "switch",
		name: "电口 1",
		kind: "ethernet",
		speed_mbps: 2500,
		connected: true,
		metadata: { enabled: true, role: "uplink", negotiated_speed_mbps: 1000 },
	},
] as unknown as AssetInterfaceRecord[]

const switchRelations = [
	{
		id: "ont-switch",
		source_asset: "ont",
		target_asset: "switch",
		kind: "connected_to",
		metadata: {
			link_kind: "ethernet",
			source_interface: "ont-lan-1",
			target_interface: "switch-port-1",
		},
	},
	{
		id: "switch-unraid",
		source_asset: "switch",
		target_asset: "unraid",
		kind: "connected_to",
		metadata: { link_kind: "ethernet", source_interface: "switch-port-4" },
	},
] as unknown as AssetRelationRecord[]

const switchModel = buildNetworkDeviceDetailModel(
	networkSwitch,
	[networkSwitch, ont],
	[...switchInterfaces, ...ontInterfaces],
	switchRelations
)
assert.ok(switchModel)
assert.deepEqual(
	switchModel.capabilitySections.map((section) => section.title),
	["网络功能", "接口能力"]
)
assert.deepEqual(
	switchModel.interfaces.map((row) => [row.name, row.enabledState, row.connectionState, row.speed, row.peer]),
	[
		["电口 1", "enabled", "connected", "协商 1 Gbps", "华为 iFTTR 主网关"],
		["电口 3", "unrecorded", "unrecorded", "支持 2.5 Gbps", "未记录"],
		["电口 4", "enabled", "disconnected", "支持 2.5 Gbps", "待建档"],
		["10G SFP+", "disabled", "disconnected", "支持 10 Gbps", "未使用"],
	]
)
assert.deepEqual(
	switchModel.relations.map((row) => [row.directionLabel, row.peerAsset, row.status]),
	[
		["上联", "华为 iFTTR 主网关", "已确认"],
		["下联", "待建档", "待建档"],
	]
)

console.log("network device detail model contract passed")
