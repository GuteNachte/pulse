import assert from "node:assert/strict"
import test from "node:test"
import { getTopologyEdgeAppearance, getTopologyVisualDirection, pickTopologyHandles } from "./topology-edge-style.ts"

test("wireless and reversed wired links are drawn upstream to downstream", () => {
	assert.deepEqual(getTopologyVisualDirection("phone", "router", "wifi", { type: "phone" }, { type: "router" }), {
		source: "router",
		target: "phone",
		swapped: true,
	})
	assert.deepEqual(getTopologyVisualDirection("router", "phone", "wifi", { type: "router" }, { type: "phone" }), {
		source: "router",
		target: "phone",
		swapped: false,
	})
	assert.deepEqual(getTopologyVisualDirection("host", "switch", "ethernet", { type: "mini_pc" }, { type: "switch" }), {
		source: "switch",
		target: "host",
		swapped: true,
	})
	assert.deepEqual(
		getTopologyVisualDirection("router", "internet", "internet", { type: "router" }, { type: "internet" }),
		{ source: "internet", target: "router", swapped: true }
	)
})

test("edge appearance matches the editor and display spec", () => {
	assert.equal(getTopologyEdgeAppearance("fiber", "1G").color, "#3b82f6")
	assert.equal(getTopologyEdgeAppearance("wifi", "", undefined, "5 GHz").color, "#8b5cf6")
	assert.equal(getTopologyEdgeAppearance("wifi", "", undefined, "2.4 GHz").color, "#06b6d4")
	assert.equal(getTopologyEdgeAppearance("wifi", "", undefined, "2.4 GHz").dashed, true)
	assert.equal(getTopologyEdgeAppearance("ethernet", "2.5G").color, "#059669")
	assert.equal(getTopologyEdgeAppearance("ethernet", "10G").color, "#0d9488")
	assert.equal(getTopologyEdgeAppearance("ethernet", "1G").color, "#10b981")
	assert.equal(getTopologyEdgeAppearance("ethernet", "2.5G").label, "网线 · 2.5G")
})

test("edge handles follow the nearest card sides", () => {
	assert.deepEqual(
		pickTopologyHandles({ x: 0, y: 0, width: 220, height: 90 }, { x: 400, y: 0, width: 220, height: 90 }),
		{ sourceHandle: "right", targetHandle: "left" }
	)
	assert.deepEqual(
		pickTopologyHandles({ x: 0, y: 0, width: 220, height: 90 }, { x: 0, y: 300, width: 220, height: 90 }),
		{ sourceHandle: "bottom", targetHandle: "top" }
	)
	assert.deepEqual(
		pickTopologyHandles({ x: 400, y: 0, width: 220, height: 90 }, { x: 0, y: 0, width: 220, height: 90 }),
		{ sourceHandle: "left", targetHandle: "right" }
	)
})
