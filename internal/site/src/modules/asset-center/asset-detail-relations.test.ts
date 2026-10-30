import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
	buildRelationMetadata,
	getRelationTargetOptions,
	getEmptyRelationFormForGuide,
	getPeerInterfaceOptions,
	resolveRelationNetworkDomain,
} from "./asset-detail-relations.ts"

// 2026-10-06 页面重构：关系提交逻辑迁到 components/asset-relation-edit-dialog.tsx
const relationDialogSource = readFileSync(
	new URL("./components/asset-relation-edit-dialog.tsx", import.meta.url),
	"utf8"
)
const saveRelationStart = relationDialogSource.indexOf("async function save(")
const saveRelationSource = relationDialogSource.slice(saveRelationStart)
assert.equal(
	saveRelationSource.indexOf("new FormData(event.currentTarget)") > -1 &&
		saveRelationSource.indexOf("new FormData(event.currentTarget)") < saveRelationSource.indexOf("await "),
	true,
	"relationship submission must capture the form before crossing an async boundary"
)
assert.ok(saveRelationSource.includes("networkDomain"), "拓扑页编辑必须按当前画布网段写入关系")
assert.ok(saveRelationSource.includes("resolveRelationNetworkDomain"), "资产页新增连接必须推断网段")

const assets = [
	{ id: "phone", name: "手机", type: "phone" },
	{ id: "router", name: "路由器", type: "router" },
	{ id: "host", name: "主机", type: "physical_host" },
	{ id: "ont", name: "光猫", type: "ont" },
	{ id: "switch", name: "交换机", type: "switch" },
]

// 新增连接必须落到拓扑网段；科技网资产优先识别，否则回退家庭网。
assert.equal(
	resolveRelationNetworkDomain({ id: "tech", metadata: { network_domain: "科技网" } } as never),
	"technology"
)
assert.equal(
	resolveRelationNetworkDomain(
		{ id: "router", metadata: {} } as never,
		{ id: "phone", metadata: { network_domain: "technology" } } as never
	),
	"technology"
)
assert.equal(resolveRelationNetworkDomain({ id: "host", metadata: { network_domain: "家庭网" } } as never), "home")
assert.equal(resolveRelationNetworkDomain(undefined, undefined), "home")

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
