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
const scoreTagSource = readFileSync(new URL("./components/asset-completeness-score-tag.tsx", import.meta.url), "utf8")
assert.ok(
	assetCardSource.indexOf("<AssetNetworkUplinkCell") < assetCardSource.indexOf("{network.accessLabel}"),
	"资产行应先显示网络上联，再显示网络接入方式"
)
assert.ok(
	assetCardSource.includes("<AssetCompletenessScoreTag score={completeness.score} />"),
	"资料完整度百分比应使用统一标签组件"
)
for (const className of ["h-5", "w-11", "items-center", "justify-center", "font-mono", "tabular-nums"]) {
	assert.ok(scoreTagSource.includes(className), `资料完整度标签缺少固定尺寸样式 ${className}`)
}
assert.ok(scoreTagSource.includes("h-5 w-11"), "资料完整度标签必须固定为 44 × 20px")
assert.ok(assetCardSource.includes("grid-cols-[minmax(0,1fr)_2.75rem]"), "资料完整度应占据列表状态列最右侧固定槽位")

console.log("asset list layout contract passed")
