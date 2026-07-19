import assert from "node:assert/strict"
import {
	buildAssetInterfaceDisplay,
	formatAssetInterfaceKind,
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
	{
		id: "wifi-24",
		asset: "asset-1",
		name: "2.4 GHz Wi-Fi",
		kind: "wifi",
		connected: false,
		primary: false,
		metadata: { enabled: false, role: "radio", band: "2.4 GHz" },
	},
] as AssetInterfaceRecord[]

const grouped = groupAssetInterfacesByAsset(interfaces)
assert.equal(grouped.get("asset-1")?.length, 4)

const display = buildAssetInterfaceDisplay(asset("mini_pc"), grouped.get("asset-1") ?? [])
assert.equal(display.accessLabel, "有线 + Wi-Fi")
assert.deepEqual(display.speedItems, [
	{ id: "lan", label: "LAN 1", speedLabel: "2.5 Gbps", connected: true, primary: true, enabled: true },
	{ id: "wifi", label: "Wi-Fi", speedLabel: "1.2 Gbps", connected: true, primary: false, enabled: true },
	{ id: "spare", label: "LAN 2", speedLabel: "1 Gbps", connected: false, primary: false, enabled: true },
	{
		id: "wifi-24",
		label: "2.4 GHz Wi-Fi",
		speedLabel: "速率未填",
		connected: false,
		primary: false,
		enabled: false,
	},
])

assert.equal(buildAssetInterfaceDisplay(asset("mini_pc"), []).accessLabel, "未设置")
const switchDisplay = buildAssetInterfaceDisplay(
	asset("switch"),
	[
		{
			id: "switch-port-1",
			asset: "switch-1",
			name: "端口 1",
			kind: "ethernet",
			speed_mbps: 2500,
			connected: true,
			primary: false,
			metadata: { enabled: true, role: "uplink", negotiated_speed_mbps: 1000 },
		},
		{
			id: "switch-port-2",
			asset: "switch-1",
			name: "端口 2",
			kind: "optical",
			speed_mbps: 10000,
			connected: false,
			primary: false,
			metadata: { enabled: true, role: "general" },
		},
	] as unknown as AssetInterfaceRecord[]
)
assert.equal(switchDisplay.speedItems[0].speedLabel, "支持 2.5 Gbps")
assert.equal(switchDisplay.speedItems[0].negotiatedSpeedLabel, "协商 1 Gbps")
assert.equal(switchDisplay.speedItems[0].role, "uplink")
assert.equal(switchDisplay.speedItems[1].speedLabel, "支持 10 Gbps")
assert.equal(switchDisplay.speedItems[1].negotiatedSpeedLabel, "协商速率未确认")
assert.equal(buildAssetInterfaceDisplay(asset("mini_pc"), [], { loadFailed: true }).accessLabel, "接口读取失败")
assert.equal(buildAssetInterfaceDisplay(asset("web_endpoint"), []).speedMode, "not_applicable")
assert.equal(formatAssetInterfaceKind("optical"), "光纤")
assert.deepEqual(
	buildAssetInterfaceDisplay(
		asset("internet", { access_technology: "ftth", auth_mode: "pppoe", down_mbps: 1000, up_mbps: 300 }),
		[]
	),
	{
		accessLabel: "家庭光纤宽带（FTTH）",
		secondaryLabel: "PPPoE 拨号 · 下行 1 Gbps / 上行 300 Mbps",
		speedMode: "not_applicable",
		speedItems: [],
	}
)

console.log("asset interface display contract passed")
