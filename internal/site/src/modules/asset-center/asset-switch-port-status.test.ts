import assert from "node:assert/strict"
import type { AssetInterfaceRecord, AssetRecord, AssetRelationRecord } from "@/types"
import type { AssetParameterRow } from "./components/asset-parameter-columns"

const moduleUrl = new URL("./asset-switch-port-status.ts", import.meta.url)
const statusModule = await import(moduleUrl.href).catch(() => undefined)

assert.equal(
	typeof statusModule?.buildSwitchPortStatusRows,
	"function",
	"switch port status builder must be implemented"
)

const switchAsset = { id: "switch-1", type: "switch", name: "测试交换机" } as AssetRecord
const router = { id: "router-1", type: "ont", name: "华为主网关" } as AssetRecord
const nas = { id: "nas-1", type: "nas", name: "UNRAID NAS" } as AssetRecord
const interfaces = [
	{
		id: "port-9",
		asset: switchAsset.id,
		name: "10G SFP+ 光口",
		kind: "optical",
		speed_mbps: 10000,
		connected: false,
		metadata: { enabled: false, role: "general", connection_note: "未接模块" },
	},
	{
		id: "port-4",
		asset: switchAsset.id,
		name: "电口 4",
		kind: "ethernet",
		speed_mbps: 2500,
		connected: true,
		metadata: { enabled: true, role: "downlink", negotiated_speed_mbps: 2500 },
	},
	{
		id: "port-2",
		asset: switchAsset.id,
		name: "电口 2",
		kind: "ethernet",
		speed_mbps: 2500,
		connected: false,
		metadata: { enabled: true, role: "general" },
	},
	{
		id: "port-3",
		asset: switchAsset.id,
		name: "电口 3",
		kind: "ethernet",
		speed_mbps: 2500,
		connected: true,
		metadata: { enabled: true, role: "general" },
	},
	{
		id: "port-1",
		asset: switchAsset.id,
		name: "电口 1",
		kind: "ethernet",
		speed_mbps: 2500,
		connected: true,
		metadata: { enabled: true, role: "uplink", negotiated_speed_mbps: 1000 },
	},
] as unknown as AssetInterfaceRecord[]
const relations = [
	{
		id: "relation-router",
		source_asset: switchAsset.id,
		target_asset: router.id,
		kind: "connected_to",
		metadata: { source_interface: "port-1", target_interface: "router-lan", link_kind: "ethernet" },
		expand: { target_asset: router },
	},
	{
		id: "relation-nas",
		source_asset: switchAsset.id,
		target_asset: nas.id,
		kind: "connected_to",
		metadata: { source_interface: "port-4", target_interface: "nas-lan", link_kind: "ethernet" },
	},
] as unknown as AssetRelationRecord[]

const rows = statusModule?.buildSwitchPortStatusRows(
	switchAsset,
	interfaces,
	[switchAsset, nas],
	relations
) as AssetParameterRow[]
assert.deepEqual(
	rows.map((row) => ({ label: row.label, value: row.value, section: row.section })),
	[
		{ label: "电口 1", value: "有线 · 启用 · 已接线 · 上联 · 协商 1 Gbps · 华为主网关", section: "网口状态" },
		{ label: "电口 2", value: "有线 · 启用 · 未接线 · 通用 · 支持 2.5 Gbps", section: "网口状态" },
		{ label: "电口 3", value: "有线 · 启用 · 已接线 · 通用 · 支持 2.5 Gbps · 对端未关联", section: "网口状态" },
		{ label: "电口 4", value: "有线 · 启用 · 已接线 · 下联 · 协商 2.5 Gbps · UNRAID NAS", section: "网口状态" },
		{ label: "10G SFP+ 光口", value: "光纤 · 未启用 · 未接线 · 通用 · 支持 10 Gbps · 未接模块", section: "网口状态" },
	]
)
assert.deepEqual(
	statusModule?.buildSwitchPortStatusRows({ ...switchAsset, type: "router" } as AssetRecord, interfaces, [], relations),
	[]
)
assert.deepEqual(statusModule?.buildSwitchPortStatusRows(switchAsset, [], [], []), [])

console.log("switch port status contract passed")
