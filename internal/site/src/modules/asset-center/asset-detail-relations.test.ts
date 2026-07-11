import assert from "node:assert/strict"

import {
	buildRelationMetadata,
	getRelationTargetOptions,
	getEmptyRelationFormForGuide,
} from "./asset-detail-relations.ts"

const assets = [
	{ id: "phone", name: "手机", type: "phone" },
	{ id: "router", name: "路由器", type: "router" },
	{ id: "host", name: "主机", type: "physical_host" },
]

assert.deepEqual(
	getRelationTargetOptions(assets as never, "phone", "network").map((item) => item.value),
	["router"]
)
assert.deepEqual(
	getRelationTargetOptions(assets as never, "phone", "host").map((item) => item.value),
	["host"]
)

assert.deepEqual(getEmptyRelationFormForGuide("wifi"), {
	kind: "connected_to",
	target_asset: "",
	current_interface: "",
	peer_interface: "",
	link_kind: "wifi",
	label: "",
	notes: "",
	guide: "wifi",
})

assert.deepEqual(
	buildRelationMetadata({
		relation: null,
		currentAssetId: "phone",
		sourceAsset: "phone",
		targetAsset: "router",
		currentInterface: "phone-wifi",
		peerInterface: "router-lan",
		linkKind: "wifi",
		notes: "家庭 Wi-Fi",
	}),
	{
		source_interface: "phone-wifi",
		target_interface: "router-lan",
		link_kind: "wifi",
		notes: "家庭 Wi-Fi",
	}
)

console.log("asset detail relation rules passed")
