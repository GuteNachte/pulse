import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"

const workspace = readFileSync(new URL("./asset-showcase-workspace.tsx", import.meta.url), "utf8")
const columns = readFileSync(new URL("./asset-parameter-columns.tsx", import.meta.url), "utf8")
const globalStyles = readFileSync(new URL("../../../index.css", import.meta.url), "utf8")
const media = readFileSync(new URL("./asset-media-showcase.tsx", import.meta.url), "utf8")
const tags = readFileSync(new URL("./asset-showcase-tags.tsx", import.meta.url), "utf8")
const page = readFileSync(new URL("../asset-detail-page.tsx", import.meta.url), "utf8")
const networkCard = readFileSync(new URL("./asset-network-connection-card.tsx", import.meta.url), "utf8")
const navigatorModule = new URL("./asset-parameter-navigator.tsx", import.meta.url)
const navigationRulesModule = new URL("../asset-parameter-navigation.ts", import.meta.url)
const identityBuilderStart = workspace.indexOf("function buildAssetIdentitySections")
const identityBuilderEnd = workspace.indexOf("\nfunction ", identityBuilderStart + 1)
const identityBuilderSource = workspace.slice(
	identityBuilderStart,
	identityBuilderEnd >= 0 ? identityBuilderEnd : undefined
)

assert.equal(
	existsSync(navigatorModule),
	false,
	"the removed parameter directory component must not remain as dead code"
)
assert.equal(
	existsSync(navigationRulesModule),
	false,
	"the removed parameter directory helper must not remain as dead code"
)

assert.equal(
	workspace.includes("AssetParameterNavigator"),
	false,
	"the first column must only render media and the asset overview"
)
assert.equal(
	workspace.includes('variant="sidebar"'),
	false,
	"desktop parameter navigation must not appear in the first column"
)
const detailCard = readFileSync(new URL("./asset-detail-field-card.tsx", import.meta.url), "utf8")

assert.equal(
	workspace.includes("buildAssetParameterGroups(asset, { interfaces, assets, relations })"),
	true,
	"all asset types must merge port/network data into canonical parameter groups"
)
assert.equal(
	workspace.includes("buildNetworkDeviceDetailModel(asset, assets, interfaces, relations)"),
	false,
	"2026-10-20 统一详情页：network devices must not render a separate detail model"
)
assert.equal(
	workspace.includes("isNetworkDetailParameterGroup(asset.type, group.id)"),
	false,
	"network capability and port groups must stay in the standard card grid"
)
assert.equal(
	workspace.includes("<AssetNetworkDetailTable"),
	false,
	"network devices must use the same card grid as every other asset"
)
assert.equal(
	workspace.includes('visibleParameterGroups.length === 1 ? "grid gap-5" : "grid gap-5 md:grid-cols-2"'),
	true,
	"one card spans full width; two or more cards use a two-column grid"
)
assert.equal(workspace.includes("硬件档案"), false, "detail page must not show a 硬件档案 heading")
assert.equal(workspace.includes("服务档案"), false, "detail page must not show a 服务档案 heading")
assert.equal(workspace.includes("按设备类别整理的已确认规格"), false, "detail page must not show the archive subtitle")
assert.equal(workspace.includes("按服务类别整理的已确认信息"), false, "detail page must not show the service subtitle")
assert.equal(
	(workspace.match(/group\.id !== "internet-public-addresses"/g)?.length ?? 0) >= 3,
	true,
	"dynamic public address is a system group: no delete, reorder or dropped params"
)
assert.equal(page.includes("Agent 填写参数"), true, "edit header must expose the Agent entry")
assert.equal(page.includes("新建分组"), true, "edit header must expose the new group entry")
assert.equal(workspace.includes("新建分组"), false, "right column must not keep the edit toolbar")
assert.equal(
	detailCard.includes("splitParameterNumberUnit") &&
		detailCard.includes("getParameterStatusTone") &&
		detailCard.includes("splitParameterFeatureTags"),
	true,
	"parameter values must render as number+unit, status dot or feature tags"
)
assert.equal(
	detailCard.includes('<div className="mt-2 grid gap-y-0.5">'),
	true,
	"parameter rows must be one per line in the unified card grid"
)
// 2026-10-20 用户《网络连接中心设计方案》：去掉顶部「连接」按钮，改为右栏网络连接卡片。
assert.equal(
	workspace.includes("AssetNetworkConnectionCard"),
	true,
	"detail page must render the network connection card"
)
assert.equal(
	page.includes("AssetConnectionManagerDialog") && page.includes("onEditConnections"),
	true,
	"network connection card edit must open the connection manager"
)
assert.equal(page.includes("AssetConnectionLinksDialog"), false, "old top connection dialog must be removed")
assert.equal(page.includes("请先完成或取消当前弹窗"), true, "top save must not discard changes in an open edit dialog")
assert.equal(page.includes("connectionDialogOpen"), false, "old top connection button state must be removed")
assert.equal(
	existsSync(new URL("./asset-connection-links-dialog.tsx", import.meta.url)),
	false,
	"removed top connection dialog must not remain as dead code"
)
const networkHeaders = ["接口名", "类型", "速率", "协议", "连接对端", "连接介质", "状态"]
let networkHeaderIndex = -1
for (const header of networkHeaders) {
	const index = networkCard.indexOf(`>${header}<`)
	assert.equal(index > networkHeaderIndex, true, `network connection card column order is wrong at ${header}`)
	networkHeaderIndex = index
}
assert.equal(workspace.includes("<AssetDetailFieldCard"), true, "parameter groups must render as detail cards")
assert.equal(workspace.includes("hasVisibleGroupRows"), true, "empty parameter groups must not render a card")
assert.equal(
	identityBuilderSource.includes('title: "接入关系"'),
	false,
	"the left device archive must not contain relationship sections"
)
assert.equal(
	workspace.includes("buildAssetRelationParameterGroup"),
	false,
	"access relationships are unified in 连接; no right-side relation card"
)
assert.equal(workspace.includes('title: "接入关系"'), false, "detail page must not render an 接入关系 group")
assert.equal(workspace.includes("asset-relations"), false, "detail page must not keep the relation group id")
assert.equal(
	workspace.includes("xl:sticky xl:top-16"),
	true,
	"desktop archive column must remain visible while the page scrolls"
)
assert.equal(workspace.includes("xl:h-full"), false, "workspace must not force a nested viewport height")
assert.equal(columns.includes("xl:overflow-y-auto"), false, "hardware archive must use page-level scrolling")
assert.equal(columns.includes("id={`asset-parameter-"), true, "every parameter card must expose a stable anchor")
assert.equal(
	columns.includes("AssetParameterNavigator"),
	false,
	"asset details must not render a parameter directory on any screen size"
)
assert.equal(
	columns.includes('aria-label="参数目录"'),
	false,
	"asset details must not expose a parameter directory landmark"
)
assert.equal(
	columns.includes('<div className="grid gap-2 sm:grid-cols-2">'),
	true,
	"archive rows must stay compact in two columns"
)
assert.equal(
	columns.includes("xl:grid-cols-1"),
	false,
	"desktop archives must not stretch every short row to full width"
)
assert.equal(
	columns.includes('className="grid items-stretch pulse-card-gap p-3 lg:grid-cols-2"'),
	true,
	"desktop parameter cards must keep equal heights only within each row"
)
assert.equal(globalStyles.includes("--pulse-card-gap: 10px;"), true, "shared card spacing must remain 10px")
assert.equal(columns.includes("lg:auto-rows-fr"), false, "different parameter rows must keep natural heights")
assert.equal(columns.includes('className="grid auto-rows-fr'), false, "small screens must keep natural card heights")
assert.equal(
	columns.includes("grid items-start gap-2.5 p-3 lg:grid-cols-2"),
	false,
	"desktop card rows must allow equal-height stretching"
)
assert.equal(
	columns.includes('group.rows.length > 6 && "sm:col-span-2"'),
	false,
	"long parameter groups must not force a full-width desktop card"
)
assert.equal(
	workspace.includes("grid items-start gap-4 xl:grid-cols-[minmax(22rem,0.72fr)_minmax(0,1.6fr)]"),
	true,
	"detail page must keep the previous responsive archive width and 16px card spacing"
)
assert.equal(page.includes("xl:h-[calc(100dvh-7rem)]"), false, "detail page must not force the old fixed viewport")
assert.equal(page.includes("xl:overflow-hidden"), false, "detail page must not clip long parameter groups")
// 2026-10-04 展示组件升级：封面 + 画廊一起渲染，画廊缩略图带排序动作
assert.equal(
	workspace.includes("gallery={media?.gallery ?? []}"),
	true,
	"the media frame must always render with cover and gallery"
)
assert.equal(media.includes("if (!effectivePrimary) {"), true, "missing covers must not remove the media frame")
assert.equal(media.includes("暂无图片"), true, "the empty media frame must use a neutral label")
assert.equal(media.includes("onMoveGallery"), true, "gallery thumbnails must support sorting")
assert.equal(media.includes("图片前移") && media.includes("图片后移"), true, "gallery sorting must offer move up/down")
assert.equal(tags.includes('add("用途", asset.role || "未填写"'), true, "every asset type must show its purpose role")

console.log("asset showcase layout contract passed")
