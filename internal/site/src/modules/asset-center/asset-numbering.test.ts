import assert from "node:assert/strict"
import {
	buildAssetTagCandidates,
	buildNextAssetTag,
	getAssetTypeGroup,
	normalizeAssetNumberingSettings,
	resolveAssetNumberingSettings,
} from "./asset-numbering.ts"

// 2026-10-04 编号规则：按大类取号（NW-001、PC-002……），大类对齐"添加资产"界面分组，各自独立计数，自动避开已占用编号。
const settings = normalizeAssetNumberingSettings({ digits: "3", sequences: { PC: "1", NW: "1" } })
const assets = [
	{ type: "nas", metadata: { asset_tag: "PC-001" } },
	{ type: "router", metadata: { asset_tag: "NW-002" } },
	// 旧式 ASSET-xxxx 编号不与任何大类冲突，也不影响各大类计数
	{ type: "phone", metadata: { asset_tag: "ASSET-0003" } },
] as never[]

assert.deepEqual(buildAssetTagCandidates(assets, settings, "nas", 3), ["PC-002", "PC-003", "PC-004"])
assert.deepEqual(buildAssetTagCandidates(assets, settings, "router", 2), ["NW-003", "NW-004"])
assert.equal(buildNextAssetTag(assets, settings, "phone"), "MB-001")
assert.equal(buildNextAssetTag([], settings, "camera"), "SO-001")

// 大类归属：与"添加资产"界面的分组一一对应
assert.equal(getAssetTypeGroup("ont").code, "NW")
assert.equal(getAssetTypeGroup("nas").code, "PC")
assert.equal(getAssetTypeGroup("phone").code, "MB")
assert.equal(getAssetTypeGroup("speaker").code, "AV")
assert.equal(getAssetTypeGroup("camera").code, "SO")
assert.equal(getAssetTypeGroup("vacuum").code, "IOT")
assert.equal(getAssetTypeGroup("web_endpoint").code, "RS")
assert.equal(getAssetTypeGroup("custom").code, "X")
assert.equal(getAssetTypeGroup("unknown-type").code, "X")

// 旧单前缀设置兼容：只保留位数，序号从现状扫描推导
assert.deepEqual(resolveAssetNumberingSettings({ prefix: "ASSET-", digits: "4", nextSequence: "12" } as never, null), {
	digits: "4",
	sequences: {},
})
