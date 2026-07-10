import type { AssetRecord } from "@/types"

type EndpointAssetCollection = {
	getFullList: (options: { filter: string; sort: string; fields: string; requestKey: null }) => Promise<AssetRecord[]>
}

const endpointAssetFields = "id,name,type,notes,role,location,metadata"

export function loadWebsiteEndpointAssets(collection: EndpointAssetCollection, filter: string) {
	return collection.getFullList({
		filter,
		sort: "name",
		fields: endpointAssetFields,
		requestKey: null,
	})
}
