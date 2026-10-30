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
	const server = readServerAssetNumberingSettings(record?.settings)
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

async function getUserSettingsRecord() {
	const filter = getCurrentUserSettingsFilter()
	if (!filter) throw new Error("missing current user")
	try {
		return await pb.collection<UserSettingsRecord>("user_settings").getFirstListItem(filter, {
			fields: "id,settings",
			requestKey: null,
		})
	} catch (error) {
		if (isPocketBaseNotFound(error)) return null
		throw error
	}
}

async function updateUserSettingsRecord(record: UserSettingsRecord | null, settings: AssetNumberingSettings) {
	const current = record ?? (await createUserSettingsRecord())
	await pb.collection("user_settings").update(current.id, {
		settings: { ...(current.settings ?? {}), [serverKey]: settings },
	})
}

async function createUserSettingsRecord() {
	const user = pb.authStore.record?.id
	if (!user) throw new Error("missing current user")
	return await pb.collection<UserSettingsRecord>("user_settings").create({ user })
}

function isPocketBaseNotFound(error: unknown) {
	return (
		typeof error === "object" && error !== null && "status" in error && (error as { status?: unknown }).status === 404
	)
}

function readServerAssetNumberingSettings(settings: Record<string, unknown> | undefined) {
	const value = settings?.[serverKey]
	if (!value || typeof value !== "object" || Array.isArray(value)) return null
	return value as Partial<AssetNumberingSettings>
}
