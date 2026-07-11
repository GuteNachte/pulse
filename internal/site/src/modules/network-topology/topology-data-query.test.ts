import assert from "node:assert/strict"
import test from "node:test"
import type {
	AssetInterfaceRecord,
	AssetRecord,
	AssetRelationRecord,
	NetworkLayoutRecord,
	SystemDetailsRecord,
} from "../../types.ts"
import { loadTopologyData } from "./topology-data-query.ts"

test("loads topology records with only graph-required fields", async () => {
	const calls: Array<{ collection: string; options: Record<string, unknown> }> = []
	const collection = <T>(name: string) => ({
		getFullList(options: Record<string, unknown>) {
			calls.push({ collection: name, options })
			return Promise.resolve([{ id: name }]) as unknown as Promise<T[]>
		},
	})

	const data = await loadTopologyData({
		collections: {
			assets: collection<AssetRecord>("assets"),
			interfaces: collection<AssetInterfaceRecord>("asset_interfaces"),
			relations: collection<AssetRelationRecord>("asset_relations"),
			layouts: collection<NetworkLayoutRecord>("network_layouts"),
			details: collection<SystemDetailsRecord>("system_details"),
		},
		layoutFilter: 'key = "network-workspace"',
	})

	assert.deepEqual(data.layout, { id: "network_layouts" })
	assert.deepEqual(calls, [
		{
			collection: "assets",
			options: {
				sort: "created",
				fields: "id,name,type,vendor,model,management_ip,role,metadata",
				requestKey: null,
			},
		},
		{
			collection: "asset_interfaces",
			options: {
				sort: "created",
				fields: "id,user,asset,name,kind,ipv4,ipv6,mac,speed_mbps,created,updated",
				requestKey: null,
			},
		},
		{
			collection: "asset_relations",
			options: {
				sort: "created",
				fields: "id,source_asset,target_asset,kind,label,metadata",
				requestKey: null,
			},
		},
		{
			collection: "network_layouts",
			options: { filter: 'key = "network-workspace"', fields: "id,layout", requestKey: null },
		},
		{
			collection: "system_details",
			options: { fields: "id,network_interfaces", requestKey: null },
		},
	])
})
