export type AssetMediaStoreStatus = {
	root: string
	writable: boolean
	configured: boolean
	objects: number
	bytes: number
}

export function normalizeAssetMediaStoreStatus(value: Partial<AssetMediaStoreStatus>): AssetMediaStoreStatus {
	return {
		root: value.root?.trim() ?? "",
		writable: value.writable === true,
		configured: value.configured === true,
		objects: Number.isFinite(value.objects) ? Math.max(0, value.objects ?? 0) : 0,
		bytes: Number.isFinite(value.bytes) ? Math.max(0, value.bytes ?? 0) : 0,
	}
}
