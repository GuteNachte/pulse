import type { CanvasSnapshot } from "./types.ts"

export type { CanvasSnapshot } from "./types.ts"

export type CanvasHistory = {
	past: CanvasSnapshot[]
	present: CanvasSnapshot
	future: CanvasSnapshot[]
	push(next: CanvasSnapshot): CanvasHistory
	undo(): CanvasHistory
	redo(): CanvasHistory
}

export function createCanvasHistory(initial: CanvasSnapshot, limit = 50): CanvasHistory {
	return createHistory([], cloneSnapshot(initial), [], Math.max(1, limit))
}

function createHistory(
	past: CanvasSnapshot[],
	present: CanvasSnapshot,
	future: CanvasSnapshot[],
	limit: number
): CanvasHistory {
	return {
		past,
		present,
		future,
		push(next) {
			const cloned = cloneSnapshot(next)
			if (sameSnapshot(present, cloned)) return this
			return createHistory([...past, cloneSnapshot(present)].slice(-limit), cloned, [], limit)
		},
		undo() {
			const previous = past.at(-1)
			if (!previous) return this
			return createHistory(past.slice(0, -1), cloneSnapshot(previous), [cloneSnapshot(present), ...future], limit)
		},
		redo() {
			const next = future[0]
			if (!next) return this
			return createHistory([...past, cloneSnapshot(present)].slice(-limit), cloneSnapshot(next), future.slice(1), limit)
		},
	}
}

export function cloneSnapshot(snapshot: CanvasSnapshot): CanvasSnapshot {
	return {
		nodes: Object.fromEntries(Object.entries(snapshot.nodes).map(([id, point]) => [id, { ...point }])),
		edgeWaypoints: Object.fromEntries(
			Object.entries(snapshot.edgeWaypoints).map(([id, points]) => [
				id,
				points.map((point) => ({ ...point })),
			])
		),
	}
}

function sameSnapshot(a: CanvasSnapshot, b: CanvasSnapshot) {
	return JSON.stringify(a) === JSON.stringify(b)
}
