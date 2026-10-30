import assert from "node:assert/strict"
import { filterAssets, getAssetListCounts, LOOSE_LOCATION_FILTER, sortAssetsByListOrder } from "./asset-list.ts"

// 2026-10-04 清单默认排序：按编号升序（分组+序号），未编号排最后，同起点按名称。
const assets = [
	{ name: "小米 BE7000 路由器", metadata: { asset_tag: "NW-003" } },
	{ name: "未编号资产", metadata: {} },
	{ name: "UM690", metadata: { asset_tag: "PC-001" } },
	{ name: "主力机", metadata: { asset_tag: "PC-003" } },
	{ name: "UNRAID NAS", metadata: { asset_tag: "PC-002" } },
	{ name: "无 metadata 的资产" },
	{ name: "飞牛 NAS", metadata: { asset_tag: "PC-004" } },
	{ name: "小米智能摄像机3", metadata: { asset_tag: "SO-001" } },
] as never[]

const sorted = sortAssetsByListOrder(assets).map(
	(asset) => (asset.metadata?.asset_tag as string | undefined) ?? `未编号:${asset.name}`
)
assert.deepEqual(sorted, [
	"NW-003",
	"PC-001",
	"PC-002",
	"PC-003",
	"PC-004",
	"SO-001",
	"未编号:未编号资产",
	"未编号:无 metadata 的资产",
])

// 不改变原数组顺序
const original = [{ name: "B" }, { name: "A" }] as { name: string }[]
sortAssetsByListOrder(original as never[])
assert.deepEqual(
	original.map((asset) => asset.name),
	["B", "A"]
)

// 2026-10-19 资产中心三栏：按大类筛选（PC/NW/RS）与位置前缀叠加
const groupedAssets = [
	{ id: "pc", name: "UM690", type: "mini_pc", location: "家 / 卧室", metadata: {} },
	{ id: "nw", name: "主路由", type: "router", location: "家", metadata: {} },
	{ id: "rs", name: "宽带", type: "internet", location: "", metadata: {} },
] as never[]

function filterNames(typeGroupFilter: string, locationFilter = "all") {
	return filterAssets({
		assets: groupedAssets,
		search: "",
		typeFilter: "all",
		statusFilter: "all",
		locationFilter,
		monitorFilter: "all",
		typeGroupFilter,
		monitoredAssetIds: new Set(),
	}).map((asset) => asset.name)
}

assert.deepEqual(filterNames("PC"), ["UM690"])
assert.deepEqual(filterNames("NW"), ["主路由"])
assert.deepEqual(filterNames("RS"), ["宽带"])
assert.deepEqual(filterNames("all", "家"), ["UM690", "主路由"])
assert.deepEqual(filterNames("all", "__empty__"), ["宽带"])

// 2026-10-21 待归档位置：位置文本存在但尚未写入位置主数据，列表必须能按该口径筛选。
const looseLocationNames = new Set(["家 / 卧室"])
const looseAssets = filterAssets({
	assets: groupedAssets,
	search: "",
	typeFilter: "all",
	statusFilter: "all",
	locationFilter: LOOSE_LOCATION_FILTER,
	monitorFilter: "all",
	typeGroupFilter: "all",
	monitoredAssetIds: new Set(),
	looseLocationNames,
}).map((asset) => asset.name)
assert.deepEqual(looseAssets, ["UM690"])

// 2026-10-21 资产监控口径：未监控只统计可监控且未接入的资产，不把路由器/IoT 算进去。
const monitorableAssets = [
	{ id: "host", name: "主机", type: "physical_host", status: "active", metadata: {} },
	{ id: "website", name: "网站", type: "web_endpoint", status: "active", metadata: {} },
	{ id: "router", name: "路由器", type: "router", status: "active", metadata: {} },
] as never[]
const counts = getAssetListCounts({
	assets: monitorableAssets,
	locationCount: 0,
	looseLocationAssetCount: 0,
	monitoredAssetIds: new Set(["host"]),
})
assert.equal(counts.total, 3)
assert.equal(counts.monitored, 1)
assert.equal(counts.manual, 1)
const unmonitored = filterAssets({
	assets: monitorableAssets,
	search: "",
	typeFilter: "all",
	statusFilter: "all",
	locationFilter: "all",
	monitorFilter: "unmonitored",
	typeGroupFilter: "all",
	monitoredAssetIds: new Set(["host"]),
}).map((asset) => asset.name)
assert.deepEqual(unmonitored, ["网站"])
