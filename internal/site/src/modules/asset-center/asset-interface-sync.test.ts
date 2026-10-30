import assert from "node:assert/strict"
import { buildPrimaryInterfacePayload } from "./asset-interface-payload.ts"
import type { AssetFormState } from "./asset-import.ts"

const form = {
	name: "测试主机",
	type: "mini_pc",
	status: "active",
	parent_asset: "",
	vendor: "",
	model: "",
	serial_number: "",
	management_ip: "",
	location: "",
	role: "",
	notes: "",
	metadata: { fixed_ipv4: "192.168.1.10", fixed_ipv6: "2001:db8::10" },
} as AssetFormState

assert.equal(buildPrimaryInterfacePayload("user-1", "asset-1", form)?.ipv6, "")
assert.equal(buildPrimaryInterfacePayload("user-1", "internet-1", { ...form, type: "internet" }), null)
assert.equal(buildPrimaryInterfacePayload("user-1", "ont-1", { ...form, type: "ont" }), null)

console.log("asset interface sync contract passed")
