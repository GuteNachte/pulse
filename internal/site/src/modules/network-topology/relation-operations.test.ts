import assert from "node:assert/strict"
import test from "node:test"
import type { AssetInterfaceRecord, AssetRelationRecord } from "../../types.ts"
import {
	buildNetworkRelationPayload,
	deleteNetworkRelation,
	saveNetworkRelation,
	validateInterfaceOwnership,
} from "./relation-operations.ts"

const interfaceRecord = (id: string, asset: string) =>
	({ id, asset, name: id, kind: "ethernet" }) as AssetInterfaceRecord

const interfaces = [interfaceRecord("if-a", "asset-a"), interfaceRecord("if-b", "asset-b")]

test("builds a canonical network relation payload without dropping metadata", () => {
	const payload = buildNetworkRelationPayload({
		user: "user-a",
		sourceAsset: "asset-a",
		targetAsset: "asset-b",
		sourceInterface: "if-a",
		targetInterface: "if-b",
		sourceHandle: "bottom",
		targetHandle: "top",
		domain: "technology",
		medium: "wired",
		metadata: { keep: true },
		interfaces,
	})

	assert.equal(payload.ok, true)
	if (payload.ok) {
		assert.equal(payload.payload.kind, "connected_to")
		assert.deepEqual(payload.payload.metadata, {
			keep: true,
			source_interface: "if-a",
			target_interface: "if-b",
			source_handle: "bottom",
			target_handle: "top",
			network_domain: "technology",
			link_kind: "ethernet",
		})
	}
})

test("rejects missing, foreign and same-asset interfaces", () => {
	assert.deepEqual(
		buildNetworkRelationPayload({
			user: "user-a",
			sourceAsset: "asset-a",
			targetAsset: "asset-b",
			sourceInterface: "",
			targetInterface: "if-b",
			domain: "home",
			medium: "wifi",
			interfaces,
		}),
		{ ok: false, reason: "missing-interface" }
	)
	assert.deepEqual(
		validateInterfaceOwnership({
			sourceAsset: "asset-a",
			targetAsset: "asset-b",
			sourceInterface: "if-b",
			targetInterface: "if-a",
			interfaces,
		}),
		{ ok: false, reason: "interface-ownership" }
	)
	assert.deepEqual(
		validateInterfaceOwnership({
			sourceAsset: "asset-a",
			targetAsset: "asset-a",
			sourceInterface: "if-a",
			targetInterface: "if-a",
			interfaces,
		}),
		{ ok: false, reason: "same-asset" }
	)
})

test("creates and reconnects one real relation at a time", async () => {
	const createCalls: unknown[] = []
	const updateCalls: unknown[] = []
	const collection = {
		create: (payload: Record<string, unknown>) => {
			createCalls.push(payload)
			return Promise.resolve({ id: "relation-new", ...payload } as unknown as AssetRelationRecord)
		},
		update: (id: string, payload: Record<string, unknown>) => {
			updateCalls.push([id, payload])
			return Promise.resolve({ id, ...payload } as unknown as AssetRelationRecord)
		},
		delete: () => Promise.resolve(true),
	}
	const input = {
		user: "user-a",
		sourceAsset: "asset-a",
		targetAsset: "asset-b",
		sourceInterface: "if-a",
		targetInterface: "if-b",
		domain: "home" as const,
		medium: "wired" as const,
		interfaces,
	}

	const created = await saveNetworkRelation({ readOnly: false, input, collection })
	const updated = await saveNetworkRelation({ readOnly: false, relationId: "relation-existing", input, collection })

	assert.equal(created.status, "saved")
	assert.equal(updated.status, "saved")
	assert.equal(createCalls.length, 1)
	assert.equal(updateCalls.length, 1)
	assert.equal((updateCalls[0] as [string])[0], "relation-existing")
})

test("prevents all mutations for read-only users and deletes only after confirmation", async () => {
	let mutationCalls = 0
	const collection = {
		create: () => {
			mutationCalls += 1
			return Promise.resolve({} as AssetRelationRecord)
		},
		update: () => {
			mutationCalls += 1
			return Promise.resolve({} as AssetRelationRecord)
		},
		delete: () => {
			mutationCalls += 1
			return Promise.resolve(true)
		},
	}
	const input = {
		user: "user-a",
		sourceAsset: "asset-a",
		targetAsset: "asset-b",
		sourceInterface: "if-a",
		targetInterface: "if-b",
		domain: "home" as const,
		medium: "wired" as const,
		interfaces,
	}

	assert.deepEqual(await saveNetworkRelation({ readOnly: true, input, collection }), { status: "forbidden" })
	assert.deepEqual(await deleteNetworkRelation({ readOnly: true, relationId: "relation-a", collection }), {
		status: "forbidden",
	})
	assert.equal(mutationCalls, 0)

	assert.deepEqual(await deleteNetworkRelation({ readOnly: false, relationId: "relation-a", collection }), {
		status: "deleted",
	})
	assert.equal(mutationCalls, 1)
})
