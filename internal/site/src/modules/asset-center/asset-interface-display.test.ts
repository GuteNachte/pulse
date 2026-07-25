import assert from "node:assert/strict"
import {
	buildAssetInterfaceDisplay,
	formatAssetInterfaceKind,
	groupAssetInterfacesByAsset,
} from "./asset-interface-display.ts"
import type { AssetInterfaceRecord, AssetRecord, AssetRelationRecord } from "@/types"

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
		metadata: { band: "5 GHz" },
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

const display = buildAssetInterfaceDisplay(asset("mini_pc", { wifi_standard: "WiFi 6" }), grouped.get("asset-1") ?? [])
assert.equal(display.accessLabel, "Wi-Fi 6 · 5 GHz + 网线 · 2.5 Gbps")
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
assert.equal(
	buildAssetInterfaceDisplay(asset("phone"), [], {
		relations: [
			{
				id: "phone-wifi",
				source_asset: "phone",
				target_asset: "router",
				kind: "connected_to",
				metadata: { link_kind: "wifi", wifi_band: "5 GHz" },
			},
		] as unknown as AssetRelationRecord[],
	}).accessLabel,
	"Wi-Fi · 制式待确认 · 5 GHz"
)
const switchDisplay = buildAssetInterfaceDisplay(asset("switch"), [
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
] as unknown as AssetInterfaceRecord[])
assert.equal(switchDisplay.accessLabel, "网线 · 2.5 Gbps")
assert.equal(switchDisplay.speedItems[0].speedLabel, "支持 2.5 Gbps")
assert.equal(switchDisplay.speedItems[0].negotiatedSpeedLabel, "协商 1 Gbps")
assert.equal(switchDisplay.speedItems[0].role, "uplink")
assert.equal(switchDisplay.speedItems[1].speedLabel, "支持 10 Gbps")
assert.equal(switchDisplay.speedItems[1].negotiatedSpeedLabel, "协商速率未确认")
assert.equal(buildAssetInterfaceDisplay(asset("mini_pc"), [], { loadFailed: true }).accessLabel, "接口读取失败")
assert.equal(buildAssetInterfaceDisplay(asset("web_endpoint"), []).accessLabel, "无")
assert.equal(
	buildAssetInterfaceDisplay(asset("mini_pc"), [], {
		relations: [
			{
				id: "wired-unknown",
				source_asset: "mini_pc",
				target_asset: "switch",
				kind: "connected_to",
				metadata: { link_kind: "ethernet" },
			},
		] as unknown as AssetRelationRecord[],
	}).accessLabel,
	"网线 · 速率待确认"
)
assert.equal(formatAssetInterfaceKind("optical"), "光纤")
assert.equal(
	buildAssetInterfaceDisplay(asset("ont", { wifi_standard: "Wi-Fi 7" }), [
		{
			id: "pon-uplink",
			asset: "ont",
			name: "PON 上联",
			kind: "pon",
			speed_mbps: 10000,
			connected: true,
			metadata: { role: "uplink" },
		},
		{
			id: "lan-downlink",
			asset: "ont",
			name: "LAN 1",
			kind: "lan",
			speed_mbps: 2500,
			connected: true,
			metadata: { role: "downlink" },
		},
		{
			id: "wifi-radio",
			asset: "ont",
			name: "5 GHz Wi-Fi",
			kind: "wifi",
			connected: true,
			metadata: { role: "radio", band: "5 GHz" },
		},
	] as unknown as AssetInterfaceRecord[]).accessLabel,
	"光纤 · 10 Gbps"
)
assert.equal(
	buildAssetInterfaceDisplay(asset("internet"), [
		{
			id: "technology-uplink",
			asset: "technology",
			name: "网络出口",
			kind: "ethernet",
			speed_mbps: 1000,
			connected: true,
		},
	] as AssetInterfaceRecord[]).accessLabel,
	"网线 · 1 Gbps"
)
assert.deepEqual(
	buildAssetInterfaceDisplay(
		asset("internet", { access_technology: "ftth", auth_mode: "pppoe", down_mbps: 1000, up_mbps: 300 }),
		[]
	),
	{
		accessLabel: "光纤",
		speedMode: "not_applicable",
		speedItems: [],
	}
)

console.log("asset interface display contract passed")
