import assert from "node:assert/strict"
import test from "node:test"
import type { NetworkLayoutRecord } from "../../types.ts"
import { createEmptyLayout } from "./layout-v2.ts"
import { getTopologyLayoutKey, saveTopologyLayout } from "./layout-persistence.ts"

function record(id: string, updated: string) {
	return { id, key: "network-home", updated } as NetworkLayoutRecord
}

test("maps each topology domain to a stable layout key", () => {
	assert.equal(getTopologyLayoutKey("home"), "network-home")
	assert.equal(getTopologyLayoutKey("technology"), "network-technology")
})

test("detects a remote update immediately before saving", async () => {
	const updateCalls: unknown[] = []
	const result = await saveTopologyLayout({
		record: record("layout-a", "2026-07-22 19:00:00.000Z"),
		loadedUpdated: "2026-07-22 19:00:00.000Z",
		layout: createEmptyLayout(),
		layoutKey: "network-home",
		userId: "user-a",
		collection: {
			getOne: () => Promise.resolve(record("layout-a", "2026-07-22 20:00:00.000Z")),
			update: (...args: unknown[]) => {
				updateCalls.push(args)
				return Promise.resolve(record("layout-a", "2026-07-22 20:01:00.000Z"))
			},
			create: () => Promise.resolve(record("layout-a", "2026-07-22 20:01:00.000Z")),
		},
	})

	assert.equal(result.status, "conflict")
	if (result.status === "conflict") {
		assert.equal(result.remote.updated, "2026-07-22 20:00:00.000Z")
	}
	assert.equal(updateCalls.length, 0)
})

test("serializes and saves an unchanged existing layout", async () => {
	const updateCalls: Array<{ id: string; payload: Record<string, unknown> }> = []
	const layout = createEmptyLayout()
	layout.nodes["asset:a"] = { x: 10, y: 20 }
	layout.edgeWaypoints["relation-a"] = [{ x: 30, y: 40 }]
	const result = await saveTopologyLayout({
		record: record("layout-a", "2026-07-22 19:00:00.000Z"),
		loadedUpdated: "2026-07-22 19:00:00.000Z",
		layout,
		layoutKey: "network-home",
		userId: "user-a",
		collection: {
			getOne: () => Promise.resolve(record("layout-a", "2026-07-22 19:00:00.000Z")),
			update: (id, payload) => {
				updateCalls.push({ id, payload })
				return Promise.resolve(record(id, "2026-07-22 19:01:00.000Z"))
			},
			create: () => Promise.resolve(record("layout-a", "2026-07-22 19:01:00.000Z")),
		},
	})

	assert.deepEqual(result, { status: "saved", updated: "2026-07-22 19:01:00.000Z" })
	assert.deepEqual(updateCalls, [
		{
			id: "layout-a",
			payload: {
				user: "user-a",
				key: "network-home",
				layout: {
					version: 2,
					nodes: { "asset:a": { x: 10, y: 20 } },
					edge_waypoints: { "relation-a": [{ x: 30, y: 40 }] },
					viewport: { x: 0, y: 0, zoom: 1 },
				},
			},
		},
	])
})

test("creates a missing layout and returns request failures without throwing", async () => {
	const createCalls: Record<string, unknown>[] = []
	const created = await saveTopologyLayout({
		layout: createEmptyLayout(),
		layoutKey: "network-technology",
		userId: "user-a",
		collection: {
			getOne: () => Promise.reject(new Error("not used")),
			update: () => Promise.reject(new Error("not used")),
			create: (payload) => {
				createCalls.push(payload)
				return Promise.resolve(record("layout-new", "2026-07-22 21:00:00.000Z"))
			},
		},
	})
	assert.equal(created.status, "saved")
	assert.equal(createCalls[0].key, "network-technology")

	const error = new Error("offline")
	const failed = await saveTopologyLayout({
		record: record("layout-a", "2026-07-22 19:00:00.000Z"),
		loadedUpdated: "2026-07-22 19:00:00.000Z",
		layout: createEmptyLayout(),
		layoutKey: "network-home",
		userId: "user-a",
		collection: {
			getOne: () => Promise.resolve(record("layout-a", "2026-07-22 19:00:00.000Z")),
			update: () => Promise.reject(error),
			create: () => Promise.reject(error),
		},
	})
	assert.deepEqual(failed, { status: "failed", error })
})
