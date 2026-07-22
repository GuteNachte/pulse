import { createCanvasHistory, type CanvasHistory } from "./canvas-core/history.ts"
import { canvasSnapshotFromLayout, layoutFromCanvasSnapshot } from "./canvas-core/serialization.ts"
import type { CanvasSnapshot } from "./canvas-core/types.ts"
import {
	parseTopologyLayout,
	serializeTopologyLayout,
	type TopologyLayoutV2,
	type TopologyPoint,
	type TopologyViewport,
} from "./layout-v2.ts"
import type { TopologyDomain } from "./topology-domain.ts"

export type WorkspaceSaveStatus = "idle" | "saving" | "saved" | "failed" | "conflict"

export type TopologyWorkspaceState = {
	domain: TopologyDomain
	layout: TopologyLayoutV2
	history: CanvasHistory
	savedLayout: TopologyLayoutV2
	loadedUpdated?: string
	dirty: boolean
	canUndo: boolean
	canRedo: boolean
	saveStatus: WorkspaceSaveStatus
	saveMessage?: string
}

export type TopologyWorkspaceAction =
	| { type: "move-node"; id: string; position: TopologyPoint }
	| { type: "set-edge-waypoints"; id: string; waypoints: TopologyPoint[] }
	| { type: "set-viewport"; viewport: TopologyViewport }
	| { type: "undo" }
	| { type: "redo" }
	| { type: "save-started" }
	| { type: "save-succeeded"; updated: string }
	| { type: "save-failed"; message: string }
	| { type: "save-conflict"; message: string }
	| {
			type: "switch-domain"
			domain: TopologyDomain
			layout: TopologyLayoutV2
			loadedUpdated?: string
	  }

export function createWorkspaceState(
	domain: TopologyDomain,
	layout: TopologyLayoutV2,
	loadedUpdated?: string
): TopologyWorkspaceState {
	const detachedLayout = cloneLayout(layout)
	const history = createCanvasHistory(canvasSnapshotFromLayout(detachedLayout))
	return finalizeState({
		domain,
		layout: detachedLayout,
		history,
		savedLayout: cloneLayout(detachedLayout),
		loadedUpdated,
		dirty: false,
		canUndo: false,
		canRedo: false,
		saveStatus: "idle",
	})
}

export function reduceWorkspace(
	state: TopologyWorkspaceState,
	action: TopologyWorkspaceAction
): TopologyWorkspaceState {
	switch (action.type) {
		case "move-node":
			return pushSnapshot(state, {
				...state.history.present,
				nodes: {
					...state.history.present.nodes,
					[action.id]: { ...action.position },
				},
			})
		case "set-edge-waypoints":
			return pushSnapshot(state, {
				...state.history.present,
				edgeWaypoints: {
					...state.history.present.edgeWaypoints,
					[action.id]: action.waypoints.map((point) => ({ ...point })),
				},
			})
		case "set-viewport":
			return finalizeState({
				...state,
				layout: { ...state.layout, viewport: { ...action.viewport } },
				saveStatus: "idle",
				saveMessage: undefined,
			})
		case "undo":
			return applyHistory(state, state.history.undo())
		case "redo":
			return applyHistory(state, state.history.redo())
		case "save-started":
			return { ...state, saveStatus: "saving", saveMessage: undefined }
		case "save-succeeded":
			return finalizeState({
				...state,
				savedLayout: cloneLayout(state.layout),
				loadedUpdated: action.updated,
				saveStatus: "saved",
				saveMessage: undefined,
			})
		case "save-failed":
			return { ...state, saveStatus: "failed", saveMessage: action.message }
		case "save-conflict":
			return { ...state, saveStatus: "conflict", saveMessage: action.message }
		case "switch-domain":
			return createWorkspaceState(action.domain, action.layout, action.loadedUpdated)
	}
}

function pushSnapshot(state: TopologyWorkspaceState, snapshot: CanvasSnapshot) {
	return applyHistory(state, state.history.push(snapshot))
}

function applyHistory(state: TopologyWorkspaceState, history: CanvasHistory) {
	return finalizeState({
		...state,
		history,
		layout: layoutFromCanvasSnapshot(history.present, state.layout.viewport),
		saveStatus: "idle",
		saveMessage: undefined,
	})
}

function finalizeState(state: TopologyWorkspaceState): TopologyWorkspaceState {
	return {
		...state,
		dirty: !sameLayout(state.layout, state.savedLayout),
		canUndo: state.history.past.length > 0,
		canRedo: state.history.future.length > 0,
	}
}

function sameLayout(a: TopologyLayoutV2, b: TopologyLayoutV2) {
	return JSON.stringify(serializeTopologyLayout(a)) === JSON.stringify(serializeTopologyLayout(b))
}

function cloneLayout(layout: TopologyLayoutV2) {
	return parseTopologyLayout(serializeTopologyLayout(layout))
}
