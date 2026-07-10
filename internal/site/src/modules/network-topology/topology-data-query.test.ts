import assert from "node:assert/strict"
import test from "node:test"
import { loadTopologyData } from "./topology-data-query.ts"

test("loads topology records with only graph-required fields", async () => {
	const calls: Array<{ collection: string; options: Record<string, unknown> }> = []
	const collection = (name: string) => ({
		getFullList(options: Record<string, unknown>) {
			calls.push({ collection: name, options })
			return Promise.resolve([{ id: name }])
		},
	})

	const data = await loadTopologyData({
		collections: {
			assets: collection("assets"),
			interfaces: collection("asset_interfaces"),
			relations: collection("asset_relations"),
			layouts: collection("network_layouts"),
			details: collection("system_details"),
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
