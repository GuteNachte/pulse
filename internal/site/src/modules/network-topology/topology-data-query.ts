import type {
	AssetInterfaceRecord,
	AssetRecord,
	AssetRelationRecord,
	NetworkLayoutRecord,
	SystemDetailsRecord,
} from "@/types"

type TopologyCollection<T> = {
	getFullList: (options: { sort?: string; fields?: string; filter?: string; requestKey: null }) => Promise<T[]>
}

const assetFields = "id,name,type,vendor,model,management_ip,role,metadata"
const interfaceFields =
	"id,user,asset,name,kind,ipv4,ipv6,mac,speed_mbps,connected,primary,source,metadata,created,updated"
const relationFields = "id,source_asset,target_asset,kind,label,metadata"
const layoutFields = "id,key,layout,updated"
const systemDetailsFields = "id,network_interfaces"

export type TopologyQueryLayoutKey = "network-home" | "network-technology" | "home" | "network-workspace"

const layoutFilters: Record<TopologyQueryLayoutKey, string> = {
	"network-home": 'key = "network-home"',
	"network-technology": 'key = "network-technology"',
	home: 'key = "home"',
	"network-workspace": 'key = "network-workspace"',
}

export async function loadTopologyData({
	collections,
	layoutKey,
}: {
	collections: {
		assets: TopologyCollection<AssetRecord>
		interfaces: TopologyCollection<AssetInterfaceRecord>
		relations: TopologyCollection<AssetRelationRecord>
		layouts: TopologyCollection<NetworkLayoutRecord>
		details: TopologyCollection<SystemDetailsRecord>
	}
	layoutKey: TopologyQueryLayoutKey
}) {
	const [assets, interfaces, relations, layouts, details] = await Promise.all([
		collections.assets.getFullList({ sort: "created", fields: assetFields, requestKey: null }),
		collections.interfaces.getFullList({ sort: "created", fields: interfaceFields, requestKey: null }),
		collections.relations.getFullList({ sort: "created", fields: relationFields, requestKey: null }),
		collections.layouts.getFullList({
			filter: layoutFilters[layoutKey],
			fields: layoutFields,
			requestKey: null,
		}),
		collections.details.getFullList({ fields: systemDetailsFields, requestKey: null }),
	])

	return { assets, interfaces, relations, layout: layouts[0], details }
}
