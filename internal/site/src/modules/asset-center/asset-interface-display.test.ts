import assert from "node:assert/strict"
import {
	buildAssetInterfaceDisplay,
	groupAssetInterfacesByAsset,
} from "./asset-interface-display.ts"
import type { AssetInterfaceRecord, AssetRecord } from "@/types"

function asset(type: AssetRecord["type"], metadata: Record<string, unknown> = {}) {
	return { type, metadata } as AssetRecord
}

const interfaces = [
	{
		id: "lan",
		asset: "asset-1",
		name: "LAN 1",
		kind: "ethernet",
		speed_mbps: 2500,
		connected: true,
		primary: true,
	},
	{
		id: "wifi",
		asset: "asset-1",
		name: "Wi-Fi",
		kind: "wifi",
		speed_mbps: 1200,
		connected: true,
		primary: false,
	},
	{
		id: "spare",
		asset: "asset-1",
		name: "LAN 2",
		kind: "lan",
		speed_mbps: 1000,
		connected: false,
		primary: false,
	},
] as AssetInterfaceRecord[]

const grouped = groupAssetInterfacesByAsset(interfaces)
assert.equal(grouped.get("asset-1")?.length, 3)

const display = buildAssetInterfaceDisplay(asset("mini_pc"), grouped.get("asset-1") ?? [])
assert.equal(display.accessLabel, "有线 + Wi-Fi")
assert.deepEqual(display.speedItems, [
	{ id: "lan", label: "LAN 1", speedLabel: "2.5 Gbps", connected: true, primary: true },
	{ id: "wifi", label: "Wi-Fi", speedLabel: "1.2 Gbps", connected: true, primary: false },
	{ id: "spare", label: "LAN 2", speedLabel: "1 Gbps", connected: false, primary: false },
])

assert.equal(buildAssetInterfaceDisplay(asset("mini_pc"), []).accessLabel, "未设置")
assert.equal(buildAssetInterfaceDisplay(asset("mini_pc"), [], { loadFailed: true }).accessLabel, "接口读取失败")
assert.equal(buildAssetInterfaceDisplay(asset("web_endpoint"), []).speedMode, "not_applicable")
assert.equal(buildAssetInterfaceDisplay(asset("internet", { access_mode: "动态公网 IP" }), []).accessLabel, "动态公网 IP")

console.log("asset interface display contract passed")
