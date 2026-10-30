import assert from "node:assert/strict"
import { getAssetNetworkRelationDirection } from "./asset-network-uplink.ts"
import type { AssetInterfaceRecord, AssetRelationRecord } from "@/types"

const interfaces = [
	{ id: "ont-pon", asset: "ont", name: "PON 上联", kind: "pon", metadata: { role: "uplink" } },
	{ id: "ont-lan", asset: "ont", name: "LAN 2", kind: "lan", metadata: { role: "downlink" } },
	{ id: "ont-wifi", asset: "ont", name: "5 GHz Wi-Fi", kind: "wifi", metadata: { role: "radio" } },
	{ id: "switch-uplink", asset: "switch", name: "电口 1", kind: "ethernet", metadata: { role: "uplink" } },
	{ id: "switch-mini", asset: "switch", name: "电口 6", kind: "ethernet", metadata: { role: "downlink" } },
	{ id: "mini-lan", asset: "mini", name: "以太网", kind: "ethernet" },
	{ id: "phone-wifi", asset: "phone", name: "Wi-Fi", kind: "wifi" },
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

const interfaceMap = new Map(interfaces.map((item) => [item.id, item]))

// 光猫 PON 口角色为 uplink：从光猫看互联网是上联
assert.equal(getAssetNetworkRelationDirection("ont", relations[0], interfaceMap), "uplink")
// 光猫 LAN 口角色为 downlink：从光猫看交换机是下联，从交换机看光猫是上联
assert.equal(getAssetNetworkRelationDirection("ont", relations[1], interfaceMap), "downlink")
assert.equal(getAssetNetworkRelationDirection("switch", relations[1], interfaceMap), "uplink")
// 对端接口 downlink 推导上联方向
assert.equal(getAssetNetworkRelationDirection("mini", relations[2], interfaceMap), "uplink")
// link_kind=wifi：源端为上联方向
assert.equal(getAssetNetworkRelationDirection("phone", relations[3], interfaceMap), "uplink")
assert.equal(getAssetNetworkRelationDirection("ont", relations[3], interfaceMap), "downlink")
// 无角色、无特殊 link_kind：方向不明
assert.equal(getAssetNetworkRelationDirection("unknown-a", relations[4], interfaceMap), "ambiguous")

console.log("asset network uplink contract passed")
