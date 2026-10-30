import assert from "node:assert/strict"
import {
	applyAssetGroupLayout,
	buildGroupOrderFromDrop,
	getAssetCustomGroups,
	getAssetGroupOrder,
	getAssetGroupTitle,
	getAssetHiddenGroups,
	moveAssetCustomParam,
	removeAssetCustomGroup,
} from "./asset-custom-groups.ts"

const metadata = {
	_custom_groups: [
		{ id: "custom-a", title: "功能特性" },
		{ id: "custom-b", title: "扩展" },
	],
	_group_order: ["network", "custom-a"],
	_group_titles: { network: "网络与通信" },
	_hidden_groups: ["power"],
	_group_params: {
		network: ["自定义网口"],
		"custom-a": ["灯效", "按键数量"],
	},
	_param_order: {
		"custom-a": ["按键数量", "灯效"],
	},
	灯效: "RGB",
	按键数量: "2",
	自定义网口: "4 个",
}

assert.deepEqual(getAssetCustomGroups(metadata), [
	{ id: "custom-a", title: "功能特性" },
	{ id: "custom-b", title: "扩展" },
])
assert.deepEqual(getAssetGroupOrder(metadata), ["network", "custom-a"])
assert.equal(getAssetGroupTitle(metadata, "network", "网络"), "网络与通信")
assert.equal(getAssetGroupTitle(metadata, "cpu", "CPU"), "CPU")
assert.deepEqual(getAssetHiddenGroups(metadata), ["power"])

const groups = [
	{ id: "appearance", title: "物理规格" },
	{ id: "network", title: "网络" },
	{ id: "power", title: "电源" },
	{ id: "custom-a", title: "功能特性" },
	{ id: "custom-b", title: "扩展" },
]
assert.deepEqual(
	applyAssetGroupLayout(groups, metadata).map((group) => group.id),
	["network", "custom-a", "appearance", "custom-b"],
	"隐藏 power；network/custom-a 按 _group_order 置前，其余保持相对顺序"
)

const moved = moveAssetCustomParam(metadata, "灯效", "custom-a", "network")
assert.ok(moved)
if (moved) {
	assert.deepEqual((moved._group_params as Record<string, string[]>).network, ["自定义网口", "灯效"])
	assert.deepEqual((moved._group_params as Record<string, string[]>)[`custom-a`], ["按键数量"])
	assert.deepEqual((moved._param_order as Record<string, string[]>).network, ["灯效"])
	assert.deepEqual((moved._param_order as Record<string, string[]>)[`custom-a`], ["按键数量"])
}

const removed = removeAssetCustomGroup(metadata, "custom-a")
assert.deepEqual(removed._custom_groups, [{ id: "custom-b", title: "扩展" }])
assert.equal((removed._group_params as Record<string, unknown>)[`custom-a`], undefined)
assert.equal(removed.灯效, undefined)
assert.equal(removed.按键数量, undefined)
assert.deepEqual(removed._group_order, ["network"])

assert.deepEqual(buildGroupOrderFromDrop(groups, "custom-b", "network"), [
	"appearance",
	"custom-b",
	"network",
	"power",
	"custom-a",
])

console.log("asset custom groups contract passed")
