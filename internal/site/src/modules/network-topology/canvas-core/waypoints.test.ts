import assert from "node:assert/strict"
import test from "node:test"
import { buildWaypointPath, snapWaypoint45, translateWaypoints } from "./waypoints.ts"

test("translates all manual waypoints with a moved node", () => {
	assert.deepEqual(
		translateWaypoints(
			[
				{ x: 10, y: 20 },
				{ x: 30, y: 40 },
			],
			{ x: 5, y: -2 }
		),
		[
			{ x: 15, y: 18 },
			{ x: 35, y: 38 },
		]
	)
})

test("snaps nearby waypoint movement to 45 degree increments", () => {
	assert.deepEqual(snapWaypoint45({ x: 0, y: 0 }, { x: 20, y: 17 }), { x: 20, y: 20 })
	assert.deepEqual(snapWaypoint45({ x: 0, y: 0 }, { x: 20, y: 7 }), { x: 20, y: 7 })
})

test("builds orthogonal and smooth paths through all points", () => {
	const points = [
		{ x: 0, y: 0 },
		{ x: 100, y: 0 },
		{ x: 100, y: 50 },
	]
	assert.equal(buildWaypointPath(points, "orthogonal"), "M 0 0 L 100 0 L 100 50")
	assert.equal(buildWaypointPath(points, "smooth"), "M 0 0 Q 100 0 100 50")
})
