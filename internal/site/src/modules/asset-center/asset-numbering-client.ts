import { getCurrentUserSettingsFilter, pb } from "@/lib/api"
import {
	assetNumberingStorageKey,
	defaultAssetNumberingSettings,
	loadAssetNumberingSettings,
	resolveAssetNumberingSettings,
	type AssetNumberingSettings,
} from "./asset-numbering"

type UserSettingsRecord = {
	id: string
	settings?: Record<string, unknown>
}

const serverKey = "asset_numbering"

export async function loadDurableAssetNumberingSettings() {
	const record = await getUserSettingsRecord()
	const server = readServerAssetNumberingSettings(record.settings)
	if (server) return resolveAssetNumberingSettings(server, null)
	const hasLegacy = typeof window !== "undefined" && window.localStorage.getItem(assetNumberingStorageKey) !== null
	const legacy = hasLegacy ? loadAssetNumberingSettings() : defaultAssetNumberingSettings
	if (hasLegacy) {
		await updateUserSettingsRecord(record, legacy)
		window.localStorage.removeItem(assetNumberingStorageKey)
	}
	return resolveAssetNumberingSettings(null, legacy)
}

export async function saveDurableAssetNumberingSettings(settings: AssetNumberingSettings) {
	const record = await getUserSettingsRecord()
	await updateUserSettingsRecord(record, settings)
}

function getUserSettingsRecord() {
	const filter = getCurrentUserSettingsFilter()
	if (!filter) throw new Error("missing current user")
	return pb.collection<UserSettingsRecord>("user_settings").getFirstListItem(filter, {
		fields: "id,settings",
		requestKey: null,
	})
}

async function updateUserSettingsRecord(record: UserSettingsRecord, settings: AssetNumberingSettings) {
	await pb.collection("user_settings").update(record.id, {
		settings: { ...(record.settings ?? {}), [serverKey]: settings },
	})
}

function readServerAssetNumberingSettings(settings: Record<string, unknown> | undefined) {
	const value = settings?.[serverKey]
	if (!value || typeof value !== "object" || Array.isArray(value)) return null
	return value as Partial<AssetNumberingSettings>
}
