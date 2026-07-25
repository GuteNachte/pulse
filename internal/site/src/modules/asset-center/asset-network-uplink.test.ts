import assert from "node:assert/strict"
import { buildAssetNetworkUplinks, resolveAssetNetworkRelationEndpoints } from "./asset-network-uplink.ts"
import type { AssetInterfaceRecord, AssetRecord, AssetRelationRecord } from "@/types"

const assets = [
	{ id: "internet", name: "宽带", type: "internet" },
	{ id: "ont", name: "华为 iFTTR 主网关", type: "ont" },
	{ id: "switch", name: "绿联 CM754 交换机", type: "switch" },
	{ id: "mini", name: "UM690", type: "mini_pc" },
	{ id: "phone", name: "RedmiK50", type: "phone" },
	{ id: "nas", name: "UNRAID NAS", type: "nas" },
	{ id: "unknown-a", name: "设备 A", type: "custom" },
	{ id: "unknown-b", name: "设备 B", type: "custom" },
	{ id: "orphan", name: "未接入设备", type: "custom" },
	{ id: "website", name: "网站", type: "web_endpoint" },
] as AssetRecord[]

const interfaces = [
	{ id: "ont-pon", asset: "ont", name: "PON 上联", kind: "pon", metadata: { role: "uplink" } },
	{ id: "ont-lan", asset: "ont", name: "LAN 2", kind: "lan", metadata: { role: "downlink" } },
	{ id: "ont-wifi", asset: "ont", name: "5 GHz Wi-Fi", kind: "wifi", metadata: { role: "radio" } },
	{ id: "switch-uplink", asset: "switch", name: "电口 1", kind: "ethernet", metadata: { role: "uplink" } },
	{ id: "switch-mini", asset: "switch", name: "电口 6", kind: "ethernet", metadata: { role: "downlink" } },
	{ id: "switch-nas", asset: "switch", name: "电口 4", kind: "ethernet", metadata: { role: "downlink" } },
	{ id: "mini-lan", asset: "mini", name: "以太网", kind: "ethernet" },
	{ id: "phone-wifi", asset: "phone", name: "Wi-Fi", kind: "wifi" },
	{ id: "nas-lan", asset: "nas", name: "以太网", kind: "ethernet" },
] as AssetInterfaceRecord[]

const relations = [
	{
		id: "internet-ont",
		source_asset: "internet",
		target_asset: "ont",
		kind: "connected_to",
		metadata: { link_kind: "internet", target_interface: "ont-pon" },
	},
	{
		id: "ont-switch",
		source_asset: "ont",
		target_asset: "switch",
		kind: "connected_to",
		metadata: { link_kind: "ethernet", source_interface: "ont-lan", target_interface: "switch-uplink" },
	},
	{
		id: "switch-mini",
		source_asset: "switch",
		target_asset: "mini",
		kind: "connected_to",
		metadata: { link_kind: "ethernet", source_interface: "switch-mini", target_interface: "mini-lan" },
	},
	{
		id: "switch-nas",
		source_asset: "switch",
		target_asset: "nas",
		kind: "connected_to",
		metadata: { link_kind: "ethernet", source_interface: "switch-nas", target_interface: "nas-lan" },
	},
	{
		id: "phone-wifi",
		source_asset: "phone",
		target_asset: "ont",
		kind: "connected_to",
		metadata: { link_kind: "wifi", source_interface: "phone-wifi", target_interface: "ont-wifi" },
	},
	{
		id: "ambiguous",
		source_asset: "unknown-a",
		target_asset: "unknown-b",
		kind: "connected_to",
		metadata: { link_kind: "ethernet" },
	},
] as unknown as AssetRelationRecord[]

const uplinks = buildAssetNetworkUplinks(assets, interfaces, relations)

assert.deepEqual(uplinks.get("internet"), { mode: "root", label: "互联网", peerAssetIds: [] })
assert.deepEqual(uplinks.get("ont"), { mode: "linked", label: "宽带", peerAssetIds: ["internet"] })
assert.deepEqual(uplinks.get("switch"), { mode: "linked", label: "华为 iFTTR 主网关", peerAssetIds: ["ont"] })
assert.deepEqual(uplinks.get("mini"), { mode: "linked", label: "绿联 CM754 交换机", peerAssetIds: ["switch"] })
assert.deepEqual(uplinks.get("nas"), { mode: "linked", label: "绿联 CM754 交换机", peerAssetIds: ["switch"] })
assert.deepEqual(uplinks.get("phone"), { mode: "linked", label: "华为 iFTTR 主网关", peerAssetIds: ["ont"] })
assert.deepEqual(uplinks.get("unknown-a"), { mode: "ambiguous", label: "上联未明确", peerAssetIds: [] })
assert.deepEqual(uplinks.get("orphan"), { mode: "unlinked", label: "未关联", peerAssetIds: [] })
assert.deepEqual(uplinks.get("website"), { mode: "not_applicable", label: "无", peerAssetIds: [] })

const interfaceMap = new Map(interfaces.map((item) => [item.id, item]))
assert.deepEqual(resolveAssetNetworkRelationEndpoints(relations[0], interfaceMap), {
	upstreamAssetId: "internet",
	downstreamAssetId: "ont",
	upstreamInterface: undefined,
	downstreamInterface: interfaces[0],
})
assert.deepEqual(resolveAssetNetworkRelationEndpoints(relations[4], interfaceMap), {
	upstreamAssetId: "ont",
	downstreamAssetId: "phone",
	upstreamInterface: interfaces[2],
	downstreamInterface: interfaces[7],
})
assert.deepEqual(resolveAssetNetworkRelationEndpoints(relations[2], interfaceMap), {
	upstreamAssetId: "switch",
	downstreamAssetId: "mini",
	upstreamInterface: interfaces[4],
	downstreamInterface: interfaces[6],
})

console.log("asset network uplink contract passed")
