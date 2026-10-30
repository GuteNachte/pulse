import { atom, computed, map } from "nanostores"
import { toast } from "@/components/ui/use-toast"
import { isAdmin, isPocketBaseAutoCancel, pb } from "@/lib/api"
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
	if (!pb.authStore.record?.id) {
		$moduleSettings.set(buildDefaultState())
		$moduleSettingsLoaded.set(false)
		return
	}
	$moduleSettingsLoading.set(true)
	try {
		const records = await pb.collection<ModuleSettingRecord>("module_settings").getFullList({
			fields: "id,user,module_id,enabled,updated",
			requestKey: null,
		})
		$moduleSettings.set(buildState(records, pb.authStore.record?.id))
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
	if (!manifest || !pb.authStore.record?.id) {
		return
	}
	if (!isAdmin()) {
		toast({
			title: "只有管理员可以修改模块",
			description: "模块开关由管理员统一控制，修改后对所有账号同时生效。",
			variant: "destructive",
		})
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
		user: "",
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

function buildState(records: ModuleSettingRecord[], userId?: string) {
	const recordsByModule = new Map(
		pulseModules.map((manifest) => {
			const globalRecord = records.find((record) => record.module_id === manifest.id && !record.user)
			const userRecord = userId
				? records.find((record) => record.module_id === manifest.id && record.user === userId)
				: undefined
			return [manifest.id, { effectiveRecord: globalRecord ?? userRecord, globalRecord, userRecord }] as const
		})
	)
	const state = {} as ModuleSettingsState
	for (const manifest of pulseModules) {
		const recordsForModule = recordsByModule.get(manifest.id)
		const record = recordsForModule?.effectiveRecord
		const enabled = manifest.required ? true : (record?.enabled ?? manifest.defaultEnabled)
		state[manifest.id] = {
			id: manifest.id,
			enabled,
			effectiveEnabled: enabled,
			status: manifest.required ? "required" : enabled ? "enabled" : "disabled",
			blockedBy: [],
			recordId: recordsForModule?.globalRecord?.id,
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
