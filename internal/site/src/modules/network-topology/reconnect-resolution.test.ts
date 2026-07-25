import assert from "node:assert/strict"
import test from "node:test"
import type { AssetRelationRecord } from "../../types.ts"
import { resolveTopologyReconnect } from "./reconnect-resolution.ts"

const relation = (id: string, sourceAsset: string, targetAsset: string, metadata: Record<string, unknown> = {}) =>
	({
		id,
		source_asset: sourceAsset,
		target_asset: targetAsset,
		kind: "connected_to",
		metadata,
	}) as AssetRelationRecord

const endpoints = [
	{ id: "node-a", kind: "asset" as const, assetId: "asset-a" },
	{ id: "node-b", kind: "asset" as const, assetId: "asset-b" },
	{ id: "node-c", kind: "asset" as const, assetId: "asset-c" },
]

test("reconnects an existing edge to a card handle and clears only the moved endpoint interface", () => {
	const current = relation("relation-a", "asset-a", "asset-b", {
		source_interface: "if-a",
		target_interface: "if-b",
		source_handle: "right",
		target_handle: "left",
		branch_from_relation: "old-parent",
		branch_ratio: 0.5,
		keep: true,
	})

	assert.deepEqual(
		resolveTopologyReconnect({
			edge: {
				id: current.id,
				source: "node-a",
				target: "node-b",
				sourceHandle: "right",
				targetHandle: "left",
				relation: current,
			},
			connection: { source: "node-a", target: "node-c", sourceHandle: "right", targetHandle: "top" },
			endpoints,
			edges: [],
		}),
		{
			ok: true,
			draft: {
				sourceAssetId: "asset-a",
				targetAssetId: "asset-c",
				sourceHandle: "right",
				targetHandle: "top",
				sourceInterface: "if-a",
				targetInterface: "",
				metadata: {
					source_interface: "if-a",
					target_interface: "",
					source_handle: "right",
					target_handle: "top",
					keep: true,
				},
			},
		}
	)
})

test("reconnects an endpoint to a parent line node and records the branch position", () => {
	const current = relation("relation-a", "asset-a", "asset-b", {
		source_interface: "if-a",
		target_interface: "if-b",
	})
	const parent = relation("relation-parent", "asset-c", "asset-d")

	assert.deepEqual(
		resolveTopologyReconnect({
			edge: {
				id: current.id,
				source: "node-a",
				target: "node-b",
				sourceHandle: "right",
				targetHandle: "left",
				relation: current,
			},
			connection: { source: "node-a", target: "line-parent-2", sourceHandle: "right", targetHandle: "left" },
			endpoints: [
				...endpoints,
				{
					id: "line-parent-2",
					kind: "line" as const,
					relationId: parent.id,
					ratio: 0.75,
				},
			],
			edges: [
				{
					id: parent.id,
					source: "node-c",
					target: "node-d",
					sourceHandle: "right",
					targetHandle: "left",
					relation: parent,
				},
			],
		}),
		{
			ok: true,
			draft: {
				sourceAssetId: "asset-a",
				targetAssetId: "asset-d",
				sourceHandle: "right",
				targetHandle: "left",
				sourceInterface: "if-a",
				targetInterface: "",
				metadata: {
					source_interface: "if-a",
					target_interface: "",
					source_handle: "right",
					target_handle: "left",
					branch_from_relation: "relation-parent",
					branch_ratio: 0.75,
					branch_endpoint: "target",
				},
			},
		}
	)
})

test("keeps the real interface when only moving an endpoint to another side of the same card", () => {
	const current = relation("relation-a", "asset-a", "asset-b", {
		source_interface: "if-a",
		target_interface: "if-b",
		source_handle: "right",
		target_handle: "left",
	})

	const result = resolveTopologyReconnect({
		edge: {
			id: current.id,
			source: "node-a",
			target: "node-b",
			sourceHandle: "right",
			targetHandle: "left",
			relation: current,
		},
		connection: { source: "node-a", target: "node-b", sourceHandle: "right", targetHandle: "top" },
		endpoints,
		edges: [],
	})

	assert.equal(result.ok, true)
	if (result.ok) {
		assert.equal(result.draft.targetInterface, "if-b")
		assert.equal(result.draft.metadata.target_interface, "if-b")
		assert.equal(result.draft.targetHandle, "top")
	}
})

test("rejects line-to-line, self-referencing and cyclic branch reconnects", () => {
	const current = relation("relation-a", "asset-a", "asset-b")
	const parent = relation("relation-parent", "asset-c", "asset-d", { branch_from_relation: current.id })
	const base = {
		edge: {
			id: current.id,
			source: "node-a",
			target: "node-b",
			sourceHandle: "right",
			targetHandle: "left",
			relation: current,
		},
		edges: [
			{
				id: parent.id,
				source: "node-c",
				target: "node-d",
				sourceHandle: "right",
				targetHandle: "left",
				relation: parent,
			},
		],
	}
	const lineEndpoints = [
		{ id: "line-source", kind: "line" as const, relationId: current.id, ratio: 0.25 },
		{ id: "line-target", kind: "line" as const, relationId: parent.id, ratio: 0.75 },
	]

	assert.deepEqual(
		resolveTopologyReconnect({
			...base,
			connection: { source: "line-source", target: "node-b", sourceHandle: "right", targetHandle: "left" },
			endpoints: [...endpoints, ...lineEndpoints],
		}),
		{ ok: false, reason: "self-branch" }
	)
	assert.deepEqual(
		resolveTopologyReconnect({
			...base,
			connection: { source: "node-a", target: "line-target", sourceHandle: "right", targetHandle: "left" },
			endpoints: [...endpoints, ...lineEndpoints],
		}),
		{ ok: false, reason: "branch-cycle" }
	)
	assert.deepEqual(
		resolveTopologyReconnect({
			...base,
			connection: {
				source: "line-source",
				target: "line-target",
				sourceHandle: "right",
				targetHandle: "left",
			},
			endpoints: [...endpoints, ...lineEndpoints],
		}),
		{ ok: false, reason: "line-to-line" }
	)
})
