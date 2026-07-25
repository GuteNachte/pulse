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
const assetsPageSource = readFileSync(new URL("../../components/routes/assets.tsx", import.meta.url), "utf8")
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
assert.ok(
	assetCardSource.includes('className="flex min-w-0 items-center justify-end"'),
	"监控标签单元格应与资料完整度标签垂直居中对齐"
)
assert.ok(
	assetCardSource.includes('column.key === "status" && "text-right"'),
	"状态 / 资料表头应与行内标签共用右侧对齐基准"
)
assert.ok(
	assetCardSource.includes('className="inline-flex h-5 items-center py-0"'),
	"监控标签应与资料完整度标签保持相同的 20px 高度"
)
assert.ok(assetsPageSource.includes("xl:min-h-[calc(100dvh-20rem)]"), "资产清单应随桌面视口增高并保留自然内容高度")
assert.equal(
	assetsPageSource.includes("max-h-[calc(100vh-18rem)]"),
	false,
	"资产清单不应继续使用固定最大高度和内部滚动"
)
assert.ok(assetCardSource.includes("xl:sticky xl:top-16 xl:self-start"), "桌面端资产详情应固定在页面可视区域")
assert.ok(
	assetsPageSource.includes('<Card className="overflow-visible border-border/70 bg-card shadow-none">'),
	"资产清单外层不能裁切桌面端固定详情"
)
const assetCenterTitleIndex = assetsPageSource.indexOf(">资产中心</h1>")
const inlineSummaryIndex = assetsPageSource.indexOf('aria-label="资产概览"')
assert.ok(assetCenterTitleIndex >= 0 && inlineSummaryIndex > assetCenterTitleIndex, "资产概览应紧跟在资产中心标题之后")
assert.equal(
	assetsPageSource.includes("grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5"),
	false,
	"资产中心不应继续保留独占一行的统计网格"
)
assert.ok(assetsPageSource.includes('className="inline-flex h-8 items-center'), "资产概览指标应使用紧凑的横向样式")

console.log("asset list layout contract passed")
