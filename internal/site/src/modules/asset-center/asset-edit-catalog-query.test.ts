import { loadAssetEditCatalog } from "./asset-edit-catalog-query.ts"
import type { AssetInterfaceRecord, AssetLocationRecord, AssetRecord } from "../../types"

function assertDeepEqual(actual: unknown, expected: unknown) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
	}
}

const calls: Array<{ collection: string; options: Record<string, unknown> }> = []

function createCollection<T>(collection: string, item: T) {
	return {
		getFullList(options: Record<string, unknown>) {
			calls.push({ collection, options })
			return Promise.resolve([item])
		},
	}
}

const catalog = await loadAssetEditCatalog({
	assets: createCollection("assets", { id: "asset-1", name: "RedmiK50", type: "phone" } as unknown as AssetRecord),
	interfaces: createCollection("asset_interfaces", {
		id: "interface-1",
		asset: "asset-1",
		name: "WLAN",
		kind: "wifi",
		metadata: { enabled: false },
	} as unknown as AssetInterfaceRecord),
	locations: createCollection("asset_locations", {
		id: "location-1",
		name: "卧室",
		kind: "room",
	} as unknown as AssetLocationRecord),
})

assertDeepEqual(
	catalog.assets.map((asset) => asset.id),
	["asset-1"]
)
assertDeepEqual(
	catalog.interfaces.map((item) => [item.id, item.metadata?.enabled]),
	[["interface-1", false]]
)
assertDeepEqual(
	catalog.locations.map((item) => item.id),
	["location-1"]
)
assertDeepEqual(
	calls.map((call) => ({ collection: call.collection, sort: call.options.sort, fields: call.options.fields })),
	[
		{
			collection: "assets",
			sort: "type,name",
			fields: "id,name,type,location,metadata",
		},
		{
			collection: "asset_interfaces",
			sort: "asset,-primary,kind,name",
			fields: "id,asset,name,kind,ipv4,mac,speed_mbps,primary,metadata",
		},
		{
			collection: "asset_locations",
			sort: "sort_order,name",
			fields: "id,name,parent_location,sort_order",
		},
	]
)
