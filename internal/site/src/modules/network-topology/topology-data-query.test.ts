import assert from "node:assert/strict"
import test from "node:test"
import type { AssetInterfaceRecord, AssetPresenceRecord, AssetRecord, AssetRelationRecord } from "../../types.ts"
import { loadTopologyData } from "./topology-data-query.ts"

test("loads only the records required by the fixed topology", async () => {
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
			presence: collection<AssetPresenceRecord>("asset_presence"),
		},
	})

	assert.deepEqual(data.assets, [{ id: "assets" }])
	assert.deepEqual(calls, [
		{
			collection: "assets",
			options: {
				sort: "created",
				fields: "id,name,type,status,location,vendor,model,management_ip,role,metadata",
				requestKey: null,
			},
		},
		{
			collection: "asset_interfaces",
			options: {
				sort: "created",
				fields: "id,user,asset,name,kind,ipv4,ipv6,mac,speed_mbps,connected,primary,source,metadata,created,updated",
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
			collection: "asset_presence",
			options: {
				sort: "created",
				fields: "id,asset,status,method,last_seen,last_checked,latency_ms",
				requestKey: null,
			},
		},
	])
})
