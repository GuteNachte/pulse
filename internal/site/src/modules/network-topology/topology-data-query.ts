import type { AssetInterfaceRecord, AssetPresenceRecord, AssetRecord, AssetRelationRecord } from "@/types"

type TopologyCollection<T> = {
	getFullList: (options: { sort?: string; fields?: string; filter?: string; requestKey: null }) => Promise<T[]>
}

const assetFields = "id,name,type,status,location,vendor,model,management_ip,role,metadata"
const interfaceFields =
	"id,user,asset,name,kind,ipv4,ipv6,mac,speed_mbps,connected,primary,source,metadata,created,updated"
const relationFields = "id,source_asset,target_asset,kind,label,metadata"
const presenceFields = "id,asset,status,method,last_seen,last_checked,latency_ms"

export async function loadTopologyData({
	collections,
}: {
	collections: {
		assets: TopologyCollection<AssetRecord>
		interfaces: TopologyCollection<AssetInterfaceRecord>
		relations: TopologyCollection<AssetRelationRecord>
		presence: TopologyCollection<AssetPresenceRecord>
	}
}) {
	const [assets, interfaces, relations, presence] = await Promise.all([
		collections.assets.getFullList({ sort: "created", fields: assetFields, requestKey: null }),
		collections.interfaces.getFullList({ sort: "created", fields: interfaceFields, requestKey: null }),
		collections.relations.getFullList({ sort: "created", fields: relationFields, requestKey: null }),
		collections.presence.getFullList({ sort: "created", fields: presenceFields, requestKey: null }),
	])

	return { assets, interfaces, relations, presence }
}
