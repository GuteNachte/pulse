import assert from "node:assert/strict"
import test from "node:test"
import {
	buildTopologyAssetOptions,
	formatTopologyInternetBandwidth,
	formatTopologyPortSpeed,
	getUnlinkedTopologySystems,
	mapTopologyPortTypeToAssetInterfaceKind,
} from "./workspace-data.ts"
import type { AssetRecord, NetworkPortRecord, SystemRecord } from "@/types"

const system = (overrides: Partial<SystemRecord> = {}) =>
	({
		id: "system-1",
		name: "UM690",
		status: "up",
		created: "",
		updated: "",
		collectionId: "",
		collectionName: "systems",
		...overrides,
	}) as SystemRecord

const asset = (overrides: Partial<AssetRecord> = {}) =>
	({
		id: "asset-1",
		user: "user-1",
		name: "核心路由器",
		type: "router",
		created: "",
		updated: "",
		collectionId: "",
		collectionName: "assets",
		...overrides,
	}) as AssetRecord

test("topology workspace reuses non-web assets and linked system fallbacks", () => {
	const result = buildTopologyAssetOptions(
		[asset(), asset({ id: "site-1", type: "web_endpoint", name: "家庭门户" })],
		[system({ id: "system-2", asset: "system-asset", name: "Hub 主机" })]
	)

	assert.deepEqual(
		result.map((item) => [item.id, item.name, item.type]),
		[
			["asset-1", "核心路由器", "router"],
			["system-asset", "Hub 主机", "physical_host"],
		]
	)
})

test("topology workspace filters assets already represented by an interface", () => {
	const systems = [system({ id: "linked", asset: "asset-1" }), system({ id: "available" })]
	const ports = [{ id: "port-1", system: "linked" }] as NetworkPortRecord[]

	assert.deepEqual(
		getUnlinkedTopologySystems(systems, ports).map((item) => item.id),
		["available"]
	)
})

test("topology workspace maps and formats connection metadata", () => {
	assert.equal(mapTopologyPortTypeToAssetInterfaceKind("wifi"), "wifi")
	assert.equal(mapTopologyPortTypeToAssetInterfaceKind("uplink"), "ethernet")
	assert.equal(mapTopologyPortTypeToAssetInterfaceKind("custom"), "custom")
	assert.equal(formatTopologyPortSpeed(2500), "2.5 Gbps")
	assert.equal(formatTopologyPortSpeed(100), "100 Mbps")
	assert.equal(
		formatTopologyInternetBandwidth(asset({ metadata: { down_mbps: "1000", up_mbps: 100 } })),
		"↓ 1G / ↑ 100M"
	)
})
