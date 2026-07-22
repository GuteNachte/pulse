import assert from "node:assert/strict"
import test from "node:test"
import { getRelationDomain, getRelationMedium, withTopologyMetadata } from "./topology-domain.ts"

test("reads explicit topology domains", () => {
	assert.equal(getRelationDomain({ network_domain: "technology" }), "technology")
	assert.equal(getRelationDomain({ network_domain: "home" }), "home")
	assert.equal(getRelationDomain({ network_domain: "unknown" }), undefined)
})

test("normalizes current and legacy link kinds", () => {
	assert.equal(getRelationMedium({ link_kind: "ethernet" }), "wired")
	assert.equal(getRelationMedium({ link_kind: "wifi" }), "wifi")
	assert.equal(getRelationMedium({ link_kind: "fiber" }), "fiber")
	assert.equal(getRelationMedium({ link_kind: "internet" }), "fiber")
	assert.equal(getRelationMedium({ link_kind: "custom" }), undefined)
})

test("writes canonical topology metadata without dropping existing values", () => {
	assert.deepEqual(
		withTopologyMetadata(
			{ source_interface: "if-a", target_interface: "if-b", notes: "keep" },
			{ domain: "home", medium: "wifi" }
		),
		{
			source_interface: "if-a",
			target_interface: "if-b",
			notes: "keep",
			network_domain: "home",
			link_kind: "wifi",
		}
	)
})
