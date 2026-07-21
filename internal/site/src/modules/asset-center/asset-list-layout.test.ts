import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { assetListColumns, assetListDesktopGridClassName } from "./asset-list-layout.ts"

assert.deepEqual(
	assetListColumns.map((column) => column.label),
	["编号", "资产", "位置", "IPv4", "网络上联", "网络接入方式", "状态 / 资料"]
)
assert.equal(assetListColumns.length, 7)
assert.match(assetListDesktopGridClassName, /md:grid-cols-/)
assert.match(assetListDesktopGridClassName, /minmax\(12rem,1\.25fr\)/)
assert.match(assetListDesktopGridClassName, /minmax\(10rem/)

const assetCardSource = readFileSync(new URL("./components/asset-card.tsx", import.meta.url), "utf8")
assert.ok(
	assetCardSource.indexOf("<AssetNetworkUplinkCell") < assetCardSource.indexOf("{network.accessLabel}"),
	"资产行应先显示网络上联，再显示网络接入方式"
)
assert.ok(
	assetCardSource.includes("<AssetCompletenessScoreTag score={completeness.score} tone={completeness.tone} />"),
	"资料完整度百分比应使用统一标签组件"
)
for (const className of ["w-11", "justify-center", "tabular-nums"]) {
	assert.ok(assetCardSource.includes(className), `资料完整度标签缺少固定尺寸样式 ${className}`)
}
assert.ok(assetCardSource.includes("border-sky-200 bg-sky-50 text-sky-700"), "资料可用状态应使用清晰且独立的蓝色标签")

console.log("asset list layout contract passed")
