import type { AssetInterfaceRecord, AssetLocationRecord, AssetRecord } from "../../types"

type CatalogCollection<T> = {
	getFullList: (options: { sort: string; fields: string; requestKey: null }) => Promise<T[]>
}

const assetCatalogFields = "id,name,type,location,metadata"
const assetInterfaceCatalogFields = "id,asset,name,kind,ipv4,mac,speed_mbps,primary"
const assetLocationCatalogFields = "id,name,parent_location,sort_order"

export async function loadAssetEditCatalog(collections: {
	assets: CatalogCollection<AssetRecord>
	interfaces: CatalogCollection<AssetInterfaceRecord>
	locations: CatalogCollection<AssetLocationRecord>
}) {
	const [assets, interfaces, locations] = await Promise.all([
		collections.assets.getFullList({
			sort: "type,name",
			fields: assetCatalogFields,
			requestKey: null,
		}),
		collections.interfaces.getFullList({
			sort: "asset,-primary,kind,name",
			fields: assetInterfaceCatalogFields,
			requestKey: null,
		}),
		collections.locations.getFullList({
			sort: "sort_order,name",
			fields: assetLocationCatalogFields,
			requestKey: null,
		}),
	])
	return { assets, interfaces, locations }
}
