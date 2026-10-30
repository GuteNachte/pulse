import { pb } from "../../lib/api.ts"
import { isInternetResourceAssetType } from "./asset-schema.ts"
import type { AssetFormState } from "./asset-import.ts"
import type { AssetInterfaceRecord } from "../../types"
import { buildPrimaryInterfacePayload } from "./asset-interface-payload.ts"

export { buildPrimaryInterfacePayload } from "./asset-interface-payload.ts"

export async function syncPrimaryInterface(userId: string, assetId: string, form: AssetFormState) {
	if (isInternetResourceAssetType(form.type)) return
	const interfacePayload = buildPrimaryInterfacePayload(userId, assetId, form)
	if (!interfacePayload) {
		return
	}
	const existing = await pb.collection<AssetInterfaceRecord>("asset_interfaces").getFullList({
		filter: `asset="${assetId}" && source="manual" && primary=true`,
		requestKey: null,
	})
	if (existing[0]) {
		await pb.collection("asset_interfaces").update(existing[0].id, interfacePayload)
		return
	}
	await pb.collection("asset_interfaces").create(interfacePayload)
}
