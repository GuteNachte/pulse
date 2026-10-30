import assert from "node:assert/strict"
import {
	ASSET_COMPONENT_CATEGORIES,
	formatComponentSpec,
	getComponentCategoryLabel,
	getComponentSpecFields,
	normalizeComponentSpec,
} from "./asset-component-list.ts"

// 2026-10-07 计算设备④：自组装配件清单契约（docs/pc-asset-design.md 四）
// 分类固定 10 种；规格字段按分类动态出；规格清洗只保留模板键。

const expectedKinds = ["cpu", "motherboard", "memory", "storage", "gpu", "psu", "case", "cooler", "nic", "other"]
assert.deepEqual(
	ASSET_COMPONENT_CATEGORIES.map((category) => category.value),
	expectedKinds,
	"配件分类固定 10 种，顺序不得变化"
)
assert.deepEqual(
	ASSET_COMPONENT_CATEGORIES.map((category) => category.label),
	["CPU", "主板", "内存", "存储", "显卡", "电源", "机箱", "散热器", "网卡", "其他"]
)

assert.deepEqual(getComponentSpecFields("memory"), ["容量", "类型", "频率"])
assert.deepEqual(getComponentSpecFields("storage"), ["容量", "接口", "介质"])
assert.deepEqual(getComponentSpecFields("other"), [])
assert.equal(getComponentCategoryLabel("gpu"), "显卡")
assert.equal(getComponentCategoryLabel("unknown"), "unknown")

// 规格摘要：模板键顺序、空值跳过
assert.equal(
	formatComponentSpec("memory", { 频率: "5600MHz", 容量: "16GB x2", 类型: "DDR5" }),
	"容量 16GB x2 · 类型 DDR5 · 频率 5600MHz"
)
assert.equal(formatComponentSpec("memory", { 容量: "  ", 类型: "DDR5" }), "类型 DDR5")
assert.equal(formatComponentSpec("memory", undefined), "")
assert.equal(formatComponentSpec("other", { 任意: "备注值" }), "任意 备注值", "其他分类保留自定义键")

// 规格清洗：只保留模板内键，空值丢弃；其他分类（无模板）全保留
assert.deepEqual(normalizeComponentSpec("memory", { 容量: "16GB x2", 乱入: "x", 类型: " " }), { 容量: "16GB x2" })
assert.deepEqual(normalizeComponentSpec("other", { 任意: "备注值", 空: "" }), { 任意: "备注值" })
assert.deepEqual(normalizeComponentSpec("memory", undefined), {})

console.log("asset component list contract passed")
