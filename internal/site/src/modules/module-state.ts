import { atom, computed, map } from "nanostores"
import { toast } from "@/components/ui/use-toast"
import { isPocketBaseAutoCancel, pb } from "@/lib/api"
import type { ModuleSettingRecord } from "@/types"
import { pulseModuleMap, pulseModules } from "./registry"
import type { PulseModuleId, PulseModuleRuntimeState } from "./types"

type ModuleSettingsState = Record<PulseModuleId, PulseModuleRuntimeState>

export const $moduleSettingsLoaded = atom(false)
export const $moduleSettingsLoading = atom(false)
export const $moduleSettings = map<ModuleSettingsState>(buildDefaultState())

export const $moduleSummary = computed($moduleSettings, (state) => {
	const modules = Object.values(state)
	return {
		total: modules.length,
		required: modules.filter((module) => module.status === "required").length,
		enabled: modules.filter((module) => module.effectiveEnabled).length,
		disabled: modules.filter((module) => module.status === "disabled").length,
		blocked: modules.filter((module) => module.status === "blocked").length,
	}
})

let refreshInFlight: Promise<void> | undefined

export function getModuleState(id: PulseModuleId) {
	return $moduleSettings.get()[id] ?? buildDefaultState()[id]
}

export function isModuleEnabled(id: PulseModuleId) {
	return getModuleState(id).effectiveEnabled
}

export function refreshModuleSettings() {
	if (refreshInFlight) {
		return refreshInFlight
	}
	refreshInFlight = refreshModuleSettingsInner().finally(() => {
		refreshInFlight = undefined
	})
	return refreshInFlight
}

async function refreshModuleSettingsInner() {
	const userId = pb.authStore.record?.id
	if (!userId) {
		$moduleSettings.set(buildDefaultState())
		$moduleSettingsLoaded.set(false)
		return
	}
	$moduleSettingsLoading.set(true)
	try {
		const records = await pb.collection<ModuleSettingRecord>("module_settings").getFullList({
			filter: `user = "${userId}"`,
			fields: "id,module_id,enabled,updated",
			requestKey: null,
		})
		$moduleSettings.set(buildState(records))
		$moduleSettingsLoaded.set(true)
	} catch (error) {
		if (!isPocketBaseAutoCancel(error)) {
			console.error("load module settings", error)
		}
		$moduleSettings.set(buildDefaultState())
	} finally {
		$moduleSettingsLoading.set(false)
	}
}

export async function setModuleEnabled(id: PulseModuleId, enabled: boolean) {
	const manifest = pulseModuleMap.get(id)
	const userId = pb.authStore.record?.id
	if (!manifest || !userId) {
		return
	}
	if (manifest.required) {
		toast({
			title: "基础模块不能关闭",
			description: "这个模块属于 Pulse 底座或核心维护入口。",
		})
		return
	}
	const current = getModuleState(id)
	const payload = {
		user: userId,
		module_id: id,
		enabled,
	}
	try {
		if (current.recordId) {
			await pb.collection("module_settings").update(current.recordId, payload)
		} else {
			await pb.collection("module_settings").create(payload)
		}
		await refreshModuleSettings()
		toast({
			title: enabled ? "模块已开启" : "模块已关闭",
			description: `${manifest.name} 的入口和路由状态已更新。`,
		})
	} catch (error) {
		console.error("save module setting", error)
		toast({
			title: "模块状态保存失败",
			description: "请检查登录权限和 Hub 日志。",
			variant: "destructive",
		})
	}
}

function buildDefaultState() {
	return buildState([])
}

function buildState(records: ModuleSettingRecord[]) {
	const recordsByModule = new Map(records.map((record) => [record.module_id, record]))
	const state = {} as ModuleSettingsState
	for (const manifest of pulseModules) {
		const record = recordsByModule.get(manifest.id)
		const enabled = manifest.required ? true : (record?.enabled ?? manifest.defaultEnabled)
		state[manifest.id] = {
			id: manifest.id,
			enabled,
			effectiveEnabled: enabled,
			status: manifest.required ? "required" : enabled ? "enabled" : "disabled",
			blockedBy: [],
			recordId: record?.id,
			updated: record?.updated,
		}
	}
	for (const manifest of pulseModules) {
		const item = state[manifest.id]
		if (!item.enabled || manifest.required) {
			continue
		}
		const blockedBy = manifest.dependencies.filter((dependency) => !state[dependency]?.effectiveEnabled)
		if (blockedBy.length > 0) {
			item.effectiveEnabled = false
			item.status = "blocked"
			item.blockedBy = blockedBy
		}
	}
	return state
}
