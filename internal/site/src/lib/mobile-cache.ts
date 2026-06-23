import type { AlertMap, SystemRecord } from "@/types"

const snapshotKey = "pulse.mobile.snapshot.v1"
const maxRecentSystems = 6
const compactRecentSystems = 3
const maxLabelLength = 64
const compactLabelLength = 32
const maxSnapshotBytes = 4096
const snapshotMaxAgeMs = 7 * 24 * 60 * 60 * 1000

export type MobileSnapshot = {
	createdAt: string
	systems: {
		total: number
		online: number
		down: number
		paused: number
		recent: { id: string; name: string; status: string; updated: string }[]
	}
	alerts: {
		triggered: number
	}
}

export function saveMobileSnapshot(systems: SystemRecord[], alerts: AlertMap) {
	if (!systems.length) {
		return
	}
	const snapshot: MobileSnapshot = {
		createdAt: new Date().toISOString(),
		systems: {
			total: systems.length,
			online: systems.filter((system) => system.status === "up").length,
			down: systems.filter((system) => system.status === "down").length,
			paused: systems.filter((system) => system.status === "paused").length,
			recent: systems
				.slice()
				.sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime())
				.slice(0, maxRecentSystems)
				.map((system) => ({
					id: system.id,
					name: truncateText(system.display_name || system.name || system.id, maxLabelLength),
					status: system.status,
					updated: system.updated,
				})),
		},
		alerts: {
			triggered: countTriggeredAlerts(alerts),
		},
	}
	writeMobileSnapshot(snapshot)
}

export function readMobileSnapshot(): MobileSnapshot | null {
	try {
		const raw = localStorage.getItem(snapshotKey)
		if (!raw || getByteLength(raw) > maxSnapshotBytes) {
			return null
		}
		const snapshot = JSON.parse(raw) as MobileSnapshot
		if (isSnapshotExpired(snapshot)) {
			localStorage.removeItem(snapshotKey)
			return null
		}
		return snapshot
	} catch {
		return null
	}
}

function writeMobileSnapshot(snapshot: MobileSnapshot) {
	const compactSnapshot = compactMobileSnapshot(snapshot)
	const serialized = JSON.stringify(compactSnapshot)
	if (getByteLength(serialized) > maxSnapshotBytes) {
		return
	}
	try {
		localStorage.setItem(snapshotKey, serialized)
	} catch {
		try {
			localStorage.removeItem(snapshotKey)
		} catch {
			// Ignore storage cleanup failures; the app can still run online.
		}
	}
}

function compactMobileSnapshot(snapshot: MobileSnapshot): MobileSnapshot {
	const recent = snapshot.systems.recent.map((system) => ({
		...system,
		name: truncateText(system.name, maxLabelLength),
	}))
	const fullSnapshot = {
		...snapshot,
		systems: {
			...snapshot.systems,
			recent: recent.slice(0, maxRecentSystems),
		},
	}
	const serialized = JSON.stringify(fullSnapshot)
	if (getByteLength(serialized) <= maxSnapshotBytes) {
		return fullSnapshot
	}
	return {
		...fullSnapshot,
		systems: {
			...fullSnapshot.systems,
			recent: recent.slice(0, compactRecentSystems).map((system) => ({
				...system,
				name: truncateText(system.name, compactLabelLength),
			})),
		},
	}
}

function isSnapshotExpired(snapshot: MobileSnapshot) {
	const created = new Date(snapshot.createdAt).getTime()
	return Number.isNaN(created) || Date.now() - created > snapshotMaxAgeMs
}

function truncateText(value: string, maxLength: number) {
	if (value.length <= maxLength) {
		return value
	}
	return `${value.slice(0, Math.max(0, maxLength - 3))}...`
}

function getByteLength(value: string) {
	return new TextEncoder().encode(value).length
}

function countTriggeredAlerts(alerts: AlertMap) {
	let count = 0
	for (const systemAlerts of Object.values(alerts)) {
		for (const alert of systemAlerts.values()) {
			if (alert.triggered) {
				count += 1
			}
		}
	}
	return count
}
