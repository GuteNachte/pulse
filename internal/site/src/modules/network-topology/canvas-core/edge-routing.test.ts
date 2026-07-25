import assert from "node:assert/strict"
import test from "node:test"
import {
	getTopologyConnectionNodePoints,
	getTopologyEdgePathPoints,
	getTopologyPathMidpoint,
	getTopologyPathPointAtRatio,
} from "./edge-routing.ts"

const source = { x: 120, y: 96 }
const target = { x: 480, y: 240 }

test("keeps wifi, wired and fiber links on orthogonal paths", () => {
	const expected = [source, { x: target.x, y: source.y }, target]
	assert.deepEqual(getTopologyEdgePathPoints([source, target], "wifi"), expected)
	assert.deepEqual(getTopologyEdgePathPoints([source, target], "wired"), expected)
	assert.deepEqual(getTopologyEdgePathPoints([source, target], "fiber"), expected)
})

test("places edge markers at the midpoint of the rendered path", () => {
	assert.deepEqual(
		getTopologyPathMidpoint([
			{ x: 0, y: 0 },
			{ x: 100, y: 0 },
			{ x: 100, y: 300 },
		]),
		{ x: 100, y: 100 }
	)
})

test("places connection nodes at even ratios along the rendered path", () => {
	const points = getTopologyEdgePathPoints(
		[
			{ x: 0, y: 0 },
			{ x: 600, y: 0 },
		],
		"wired"
	)

	assert.deepEqual(getTopologyConnectionNodePoints(points), [
		{ x: 200, y: 0 },
		{ x: 400, y: 0 },
	])
	assert.deepEqual(getTopologyPathPointAtRatio(points, 0.5), { x: 300, y: 0 })
})

test("keeps one connection node on every non-empty short line", () => {
	assert.deepEqual(
		getTopologyConnectionNodePoints([
			{ x: 0, y: 0 },
			{ x: 180, y: 0 },
		]),
		[{ x: 90, y: 0 }]
	)
	assert.deepEqual(getTopologyConnectionNodePoints([{ x: 0, y: 0 }]), [])
})

test("uses both horizontal and vertical segments when calculating line nodes", () => {
	const points = getTopologyEdgePathPoints(
		[
			{ x: 0, y: 0 },
			{ x: 240, y: 0 },
			{ x: 240, y: 720 },
		],
		"wired"
	)

	assert.deepEqual(getTopologyConnectionNodePoints(points), [
		{ x: 240, y: 0 },
		{ x: 240, y: 240 },
		{ x: 240, y: 480 },
	])
})
