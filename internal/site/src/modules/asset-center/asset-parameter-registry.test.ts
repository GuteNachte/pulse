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
		"外观与尺寸",
		"电源",
		"主板与平台",
		"处理器",
		"显卡",
		"内存",
		"存储",
		"网络",
		"接口与扩展",
		"显示",
		"影像",
		"音频",
		"传感器",
		"散热与环境",
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
