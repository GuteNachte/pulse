import assert from "node:assert/strict"
import { ASSET_TYPE_OPTIONS, getAssetFormSections } from "./asset-schema.ts"
import {
	ASSET_PARAMETER_CATEGORIES,
	getAssetArchiveField,
	getAssetParameterFieldsForType,
	validateAssetParameterRegistry,
} from "./asset-parameter-registry.ts"

assert.deepEqual(
	ASSET_PARAMETER_CATEGORIES.map((category) => category.title),
	[
		// 2026-10-07 计算设备 11 组重构：分类顺序对齐 docs/pc-asset-design.md（外观/CPU/内存/存储/显卡/主板与固件/网络/接口与扩展/电源与散热/系统），新增系统分类
		// 2026-10-12 网络上移到内存之前（表格组相邻：网络/内存/存储）
		// 2026-10-17 用户定稿分类体系：新增显示输出分类；2026-10-18 移除特色功能分类（计算设备按 11 类固定顺序展示，见 asset-detail-parameter-groups）
		// 2026-10-20 智能家居预设：新增功能参数（加湿器/净化器等 iot）与电气参数（插座/智能开关）分类
		"外观",
		"功能参数",
		"CPU",
		"网络",
		"管理功能",
		"内存",
		"存储",
		"显示输出",
		"显卡",
		"主板与固件",
		"接口与扩展",
		"电气参数",
		"电源与散热",
		"系统",
		"显示",
		"影像",
		"音频",
		"传感器",
		"散热设计",
	]
)
assert.deepEqual(validateAssetParameterRegistry(), [])
assert.equal(getAssetArchiveField("fixed_ipv6"), undefined)
assert.equal(getAssetArchiveField("public_ipv6")?.scope, "line")
assert.deepEqual(getAssetArchiveField("public_ipv6")?.assetTypes, ["internet"])

for (const { value: type } of ASSET_TYPE_OPTIONS) {
	const fields = getAssetParameterFieldsForType(type)
	assert.equal(new Set(fields.map((field) => field.key)).size, fields.length, `${type} 不能重复注册参数`)
	for (const field of fields) assert.ok(field.category, `${type}.${field.key} 缺少固定分类`)
	const sectionCounts = new Map<string, number>()
	for (const field of fields) {
		const sectionKey = `${field.category}:${field.section ?? ""}`
		sectionCounts.set(sectionKey, (sectionCounts.get(sectionKey) ?? 0) + 1)
	}
	for (const [sectionKey, count] of sectionCounts) {
		assert.ok(count <= 8, `${type}.${sectionKey} 包含 ${count} 项，应继续拆内部小标题`)
	}
	for (const section of getAssetFormSections(type)) {
		for (const field of section.fields) {
			assert.ok(getAssetArchiveField(field.key), `${type}.${field.key} 未进入共享字段目录`)
		}
	}
}

console.log("asset parameter registry contract passed")
