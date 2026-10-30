/** biome-ignore-all lint/suspicious/noAssignInExpressions: it's fine :) */
import type { PreinitializedMapStore } from "nanostores"
import { isPocketBaseAutoCancel, pb } from "@/lib/api"
import {
	$allSystemsById,
	$allSystemsByName,
	$downSystems,
	$longestSystemNameLen,
	$pausedSystems,
	$systemsLoadFailed,
	$systemsLoaded,
	$upSystems,
} from "@/lib/stores"
import { getVisualStringWidth, updateFavicon } from "@/lib/utils"
import type { SystemRecord } from "@/types"
import { SystemStatus } from "./enums"
import { getSystemDisplayName } from "./system-roles"

const COLLECTION = pb.collection<SystemRecord>("systems")
const REALTIME_FIELDS = "id,status,pairing_confirmed,is_local,updated"
const SUMMARY_REFRESH_DEBOUNCE_MS = 750
const SUMMARY_REFRESH_MIN_INTERVAL_MS = 5_000

/** Maximum system name length for display purposes */
const MAX_SYSTEM_NAME_LENGTH = 22

let initialized = false
// biome-ignore lint/suspicious/noConfusingVoidType: typescript rocks
let unsub: (() => void) | undefined | void
let refreshTimer: ReturnType<typeof setTimeout> | undefined
let refreshInFlight: Promise<void> | undefined
let lastRefreshAt = 0

type SystemsSummaryResponse = {
	items?: SystemRecord[]
}

/** Initialize the systems manager and set up listeners */
export function init() {
	if (initialized) {
		return
	}
	initialized = true

	// sync system stores on change
	$allSystemsById.listen((newSystems, oldSystems, changedKey) => {
		const oldSystem = oldSystems[changedKey]
		const newSystem = newSystems[changedKey]

		// if system is undefined (deleted), remove it from the stores
		if (oldSystem && !newSystem?.id) {
			removeFromStore(oldSystem, $upSystems)
			removeFromStore(oldSystem, $downSystems)
			removeFromStore(oldSystem, $pausedSystems)
			removeFromStore(oldSystem, $allSystemsById)
		}

		if (!newSystem) {
			onSystemsChanged(newSystems, undefined)
			return
		}

		const newStatus = newSystem.status
		if (newStatus === SystemStatus.Up) {
			$upSystems.setKey(newSystem.id, newSystem)
			removeFromStore(newSystem, $downSystems)
			removeFromStore(newSystem, $pausedSystems)
		} else if (newStatus === SystemStatus.Down) {
			$downSystems.setKey(newSystem.id, newSystem)
			removeFromStore(newSystem, $upSystems)
			removeFromStore(newSystem, $pausedSystems)
		} else if (newStatus === SystemStatus.Paused) {
			$pausedSystems.setKey(newSystem.id, newSystem)
			removeFromStore(newSystem, $upSystems)
			removeFromStore(newSystem, $downSystems)
		} else if (newStatus === SystemStatus.Pending) {
			removeFromStore(newSystem, $upSystems)
			removeFromStore(newSystem, $downSystems)
			removeFromStore(newSystem, $pausedSystems)
		}

		// run things that need to be done when systems change
		onSystemsChanged(newSystems, newSystem)
	})
}

/** Update the longest system name length and favicon based on system status */
function onSystemsChanged(_: Record<string, SystemRecord>, changedSystem: SystemRecord | undefined) {
	const downSystemsStore = $downSystems.get()
	const downSystems = Object.values(downSystemsStore)

	// Update longest system name length
	const longestName = $longestSystemNameLen.get()
	const nameLen = Math.min(MAX_SYSTEM_NAME_LENGTH, getVisualStringWidth(getSystemDisplayName(changedSystem, "")))
	if (nameLen > longestName) {
		$longestSystemNameLen.set(nameLen)
	}

	updateFavicon(downSystems.length)
}

/** Fetch systems from collection */
async function fetchSystems(): Promise<SystemRecord[] | undefined> {
	try {
		const response = await pb.send<SystemsSummaryResponse>("/api/pulse/systems/summary", {
			method: "GET",
			requestKey: null,
		})
		return response.items ?? []
	} catch (error) {
		if (!isPocketBaseAutoCancel(error)) {
			console.error("Failed to fetch system summaries:", error)
		}
	}
}

/** Normalizes partially populated system records so route-level loading does not blank the page. */
function normalizeSystem(system: SystemRecord): SystemRecord {
	system.info = {
		...(system.info ?? {}),
		h: system.info?.h ?? "",
		v: system.info?.v ?? "",
	}
	return system
}

function isSystemInventoryVisible(system: SystemRecord): boolean {
	return system.pairing_confirmed !== false
}

/** Add system to both name and ID stores */
export function add(system: SystemRecord) {
	const normalizedSystem = normalizeSystem(system)
	if (!isSystemInventoryVisible(normalizedSystem)) {
		remove(normalizedSystem)
		return
	}
	$allSystemsByName.setKey(normalizedSystem.name, normalizedSystem)
	$allSystemsById.setKey(normalizedSystem.id, normalizedSystem)
}

/** Update system in stores */
export function update(system: SystemRecord) {
	const normalizedSystem = normalizeSystem(system)
	if (!isSystemInventoryVisible(normalizedSystem)) {
		const oldSystem = $allSystemsById.get()[normalizedSystem.id]
		remove(oldSystem ?? normalizedSystem)
		return
	}
	// if name changed, make sure old name is removed from the name store
	const oldName = $allSystemsById.get()[normalizedSystem.id]?.name
	if (oldName && oldName !== normalizedSystem.name) {
		$allSystemsByName.setKey(oldName, undefined as unknown as SystemRecord)
	}
	add(normalizedSystem)
}

/** Remove system from stores */
export function remove(system: SystemRecord) {
	removeFromStore(system, $allSystemsByName)
	removeFromStore(system, $allSystemsById)
	removeFromStore(system, $upSystems)
	removeFromStore(system, $downSystems)
	removeFromStore(system, $pausedSystems)
}

/** Remove system from specific store */
function removeFromStore(system: SystemRecord, store: PreinitializedMapStore<Record<string, SystemRecord>>) {
	const key = store === $allSystemsByName ? system.name : system.id
	store.setKey(key, undefined as unknown as SystemRecord)
}

function replaceStores(records: SystemRecord[]) {
	const byId: Record<string, SystemRecord> = {}
	const byName: Record<string, SystemRecord> = {}
	const up: Record<string, SystemRecord> = {}
	const down: Record<string, SystemRecord> = {}
	const paused: Record<string, SystemRecord> = {}
	let longestNameLen = 8

	for (const record of records) {
		const system = normalizeSystem(record)
		if (!isSystemInventoryVisible(system)) {
			continue
		}
		byId[system.id] = system
		byName[system.name] = system
		if (system.status === SystemStatus.Up) {
			up[system.id] = system
		} else if (system.status === SystemStatus.Down) {
			down[system.id] = system
		} else if (system.status === SystemStatus.Paused) {
			paused[system.id] = system
		}
		longestNameLen = Math.max(
			longestNameLen,
			Math.min(MAX_SYSTEM_NAME_LENGTH, getVisualStringWidth(getSystemDisplayName(system, "")))
		)
	}

	$allSystemsByName.set(byName)
	$allSystemsById.set(byId)
	$upSystems.set(up)
	$downSystems.set(down)
	$pausedSystems.set(paused)
	$longestSystemNameLen.set(longestNameLen)
	updateFavicon(Object.keys(down).length)
}

function scheduleRefresh(delay = SUMMARY_REFRESH_DEBOUNCE_MS) {
	if (refreshTimer) {
		clearTimeout(refreshTimer)
	}
	const elapsed = Date.now() - lastRefreshAt
	const wait = Math.max(delay, SUMMARY_REFRESH_MIN_INTERVAL_MS - elapsed)
	refreshTimer = setTimeout(() => {
		refreshTimer = undefined
		refresh().catch((error) => console.error("Failed to refresh system summaries:", error))
	}, wait)
}

/** Action functions for subscription */
const actionFns: Record<string, (system: SystemRecord) => void> = {
	create: () => scheduleRefresh(),
	update: () => scheduleRefresh(),
	delete: (system) => {
		const existing = $allSystemsById.get()[system.id]
		if (existing) {
			remove(existing)
		}
		scheduleRefresh(250)
	},
}

/** Subscribe to real-time system updates from the collection */
export async function subscribe() {
	try {
		unsub = await COLLECTION.subscribe("*", ({ action, record }) => actionFns[action]?.(record), {
			fields: REALTIME_FIELDS,
		})
	} catch (error) {
		console.error("Failed to subscribe to systems collection:", error)
	}
}

/** Refresh all systems with latest data from the hub */
export function refresh() {
	if (refreshInFlight) {
		return refreshInFlight
	}
	refreshInFlight = refreshInner().finally(() => {
		refreshInFlight = undefined
		lastRefreshAt = Date.now()
	})
	return refreshInFlight
}

async function refreshInner() {
	try {
		const records = await fetchSystems()
		if (!records) {
			$systemsLoadFailed.set(true)
			$systemsLoaded.set(true)
			return
		}
		replaceStores(records)
		$systemsLoadFailed.set(false)
		$systemsLoaded.set(true)
	} catch (error) {
		$systemsLoadFailed.set(true)
		$systemsLoaded.set(true)
		console.error("Failed to refresh systems:", error)
	}
}

/** Unsubscribe from real-time system updates */
export const unsubscribe = () => {
	if (refreshTimer) {
		clearTimeout(refreshTimer)
		refreshTimer = undefined
	}
	unsub = unsub?.()
}
