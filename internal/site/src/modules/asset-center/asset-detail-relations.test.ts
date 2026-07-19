import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
	buildRelationMetadata,
	getAssetDetailRelationRows,
	getRelationTargetOptions,
	getEmptyRelationFormForGuide,
	getPeerInterfaceOptions,
} from "./asset-detail-relations.ts"

const detailPageSource = readFileSync(new URL("./asset-detail-page.tsx", import.meta.url), "utf8")
const saveRelationStart = detailPageSource.indexOf("async function saveRelation")
const saveRelationEnd = detailPageSource.indexOf("async function saveMaintenance", saveRelationStart)
const saveRelationSource = detailPageSource.slice(saveRelationStart, saveRelationEnd)
assert.equal(
	saveRelationSource.indexOf("const form = new FormData(event.currentTarget)") <
		saveRelationSource.indexOf("await ensureAssetEditCatalogLoaded()"),
	true,
	"relationship submission must capture the form before crossing an async boundary"
)

const assets = [
	{ id: "phone", name: "手机", type: "phone" },
	{ id: "router", name: "路由器", type: "router" },
	{ id: "host", name: "主机", type: "physical_host" },
	{ id: "ont", name: "光猫", type: "ont" },
	{ id: "switch", name: "交换机", type: "switch" },
]

assert.deepEqual(
	getAssetDetailRelationRows(
		"ont",
		[{ id: "ont", name: "光猫", type: "ont" }] as never,
		[
			{ id: "ont-pon", asset: "ont", name: "PON 上联", kind: "pon" },
			{ id: "ont-wifi-5", asset: "ont", name: "5 GHz Wi-Fi", kind: "wifi" },
		] as never,
		[
			{
				id: "internet-relation",
				source_asset: "internet",
				target_asset: "ont",
				kind: "connected_to",
				metadata: { link_kind: "internet", target_interface: "ont-pon" },
				expand: { source_asset: { id: "internet", name: "宽带", type: "internet" } },
			},
			{
				id: "wifi-relation",
				source_asset: "phone",
				target_asset: "ont",
				kind: "connected_to",
				metadata: { link_kind: "wifi", target_interface: "ont-wifi-5" },
				expand: { source_asset: { id: "phone", name: "手机", type: "phone" } },
			},
		] as never
	),
	[
		{ label: "互联网接入", value: "宽带 · PON 上联" },
		{ label: "无线终端", value: "手机 · 5 GHz Wi-Fi" },
	]
)

assert.deepEqual(
	getRelationTargetOptions(assets as never, "phone", "network").map((item) => item.value),
	["router", "ont", "switch"]
)
assert.deepEqual(
	getRelationTargetOptions(assets as never, "internet", "internet").map((item) => item.value),
	["router", "ont"]
)
assert.deepEqual(getEmptyRelationFormForGuide("internet"), {
	kind: "connected_to",
	target_asset: "",
	current_interface: "",
	peer_interface: "",
	link_kind: "internet",
	label: "",
	notes: "",
	guide: "internet",
})
assert.deepEqual(
	getPeerInterfaceOptions(
		[
			{ id: "ont-pon", asset: "ont", name: "PON", kind: "pon" },
			{ id: "ont-lan", asset: "ont", name: "LAN", kind: "lan" },
		] as never,
		assets as never,
		"internet",
		"ont",
		"internet"
	).map((item) => item.value),
	["", "ont-pon"]
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
	getRelationTargetOptions(assets as never, "phone", "wifi").map((item) => item.value),
	["router", "ont"]
)
assert.deepEqual(
	getPeerInterfaceOptions(
		[
			{ id: "ont-wifi-24", asset: "ont", name: "2.4 GHz Wi-Fi", kind: "wifi", metadata: { enabled: false } },
			{ id: "ont-wifi-5", asset: "ont", name: "5 GHz Wi-Fi", kind: "wifi", metadata: { enabled: true } },
			{ id: "ont-lan", asset: "ont", name: "LAN 1", kind: "lan", metadata: { enabled: true } },
		] as never,
		assets as never,
		"phone",
		"ont",
		"wifi"
	).map((item) => item.value),
	["", "ont-wifi-5"]
)

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
