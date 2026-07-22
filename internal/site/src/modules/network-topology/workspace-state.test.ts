import assert from "node:assert/strict"
import test from "node:test"
import { createEmptyLayout } from "./layout-v2.ts"
import { createWorkspaceState, reduceWorkspace } from "./workspace-state.ts"

test("keeps a failed save dirty and marks a successful save clean", () => {
	const layout = createEmptyLayout()
	let state = createWorkspaceState("home", layout, "2026-07-22 19:00:00.000Z")
	state = reduceWorkspace(state, { type: "move-node", id: "asset:a", position: { x: 8, y: 12 } })
	assert.equal(state.dirty, true)
	assert.equal(state.canUndo, true)

	state = reduceWorkspace(state, { type: "save-started" })
	assert.equal(state.saveStatus, "saving")
	state = reduceWorkspace(state, { type: "save-failed", message: "offline" })
	assert.equal(state.dirty, true)
	assert.equal(state.saveStatus, "failed")
	assert.equal(state.saveMessage, "offline")

	state = reduceWorkspace(state, { type: "save-started" })
	state = reduceWorkspace(state, {
		type: "save-succeeded",
		updated: "2026-07-22 19:01:00.000Z",
	})
	assert.equal(state.dirty, false)
	assert.equal(state.saveStatus, "saved")
	assert.equal(state.loadedUpdated, "2026-07-22 19:01:00.000Z")
})

test("undoes and redoes node and waypoint edits without mutating the initial layout", () => {
	const layout = createEmptyLayout()
	let state = createWorkspaceState("home", layout)
	state = reduceWorkspace(state, { type: "move-node", id: "asset:a", position: { x: 8, y: 12 } })
	state = reduceWorkspace(state, {
		type: "set-edge-waypoints",
		id: "relation-a",
		waypoints: [{ x: 20, y: 30 }],
	})
	assert.deepEqual(state.layout.edgeWaypoints["relation-a"], [{ x: 20, y: 30 }])

	state = reduceWorkspace(state, { type: "undo" })
	assert.equal(state.layout.edgeWaypoints["relation-a"], undefined)
	assert.equal(state.canRedo, true)
	state = reduceWorkspace(state, { type: "redo" })
	assert.deepEqual(state.layout.edgeWaypoints["relation-a"], [{ x: 20, y: 30 }])
	assert.deepEqual(layout, createEmptyLayout())
})

test("tracks viewport changes, conflicts and clean domain switches", () => {
	let state = createWorkspaceState("home", createEmptyLayout())
	state = reduceWorkspace(state, {
		type: "set-viewport",
		viewport: { x: 20, y: 30, zoom: 0.8 },
	})
	assert.equal(state.dirty, true)
	state = reduceWorkspace(state, { type: "save-conflict", message: "远端布局已更新" })
	assert.equal(state.saveStatus, "conflict")
	assert.equal(state.dirty, true)

	const technologyLayout = createEmptyLayout()
	technologyLayout.nodes["asset:router"] = { x: 100, y: 120 }
	state = reduceWorkspace(state, {
		type: "switch-domain",
		domain: "technology",
		layout: technologyLayout,
		loadedUpdated: "2026-07-22 20:00:00.000Z",
	})
	assert.equal(state.domain, "technology")
	assert.deepEqual(state.layout.nodes, technologyLayout.nodes)
	assert.equal(state.dirty, false)
	assert.equal(state.canUndo, false)
	assert.equal(state.saveStatus, "idle")
})

test("applies auto-layout as one undoable canvas snapshot", () => {
	let state = createWorkspaceState("home", createEmptyLayout())
	state = reduceWorkspace(state, {
		type: "apply-snapshot",
		snapshot: {
			nodes: {
				"asset:a": { x: 80, y: 72 },
				"asset:b": { x: 416, y: 72 },
			},
			edgeWaypoints: { "relation-a": [] },
		},
	})
	assert.deepEqual(state.layout.nodes["asset:b"], { x: 416, y: 72 })
	assert.equal(state.history.past.length, 1)

	state = reduceWorkspace(state, { type: "undo" })
	assert.deepEqual(state.layout.nodes, {})
})
