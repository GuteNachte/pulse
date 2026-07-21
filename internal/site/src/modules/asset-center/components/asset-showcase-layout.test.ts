import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"

const workspace = readFileSync(new URL("./asset-showcase-workspace.tsx", import.meta.url), "utf8")
const columns = readFileSync(new URL("./asset-parameter-columns.tsx", import.meta.url), "utf8")
const media = readFileSync(new URL("./asset-media-showcase.tsx", import.meta.url), "utf8")
const tags = readFileSync(new URL("./asset-showcase-tags.tsx", import.meta.url), "utf8")
const page = readFileSync(new URL("../asset-detail-page.tsx", import.meta.url), "utf8")
const navigatorModule = new URL("./asset-parameter-navigator.tsx", import.meta.url)
const navigationRulesModule = new URL("../asset-parameter-navigation.ts", import.meta.url)
const identityBuilderStart = workspace.indexOf("function buildAssetIdentitySections")
const identityBuilderEnd = workspace.indexOf("function buildAssetRelationParameterGroup", identityBuilderStart)
const identityBuilderSource = workspace.slice(identityBuilderStart, identityBuilderEnd)

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
assert.equal(
	workspace.includes("buildAssetParameterGroups(asset, { interfaces, assets, relations })"),
	true,
	"switch details must merge port status into canonical parameter groups"
)
assert.equal(
	identityBuilderSource.includes('title: "接入关系"'),
	false,
	"the left device archive must not contain relationship sections"
)
assert.equal(
	workspace.includes("buildAssetRelationParameterGroup(asset, assets, interfaces, relations)"),
	true,
	"access relationships must be composed into the right parameter cards"
)
assert.equal(
	workspace.includes("xl:sticky xl:top-4"),
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
	columns.includes('className="grid items-stretch gap-2.5 p-3 lg:grid-cols-2"'),
	true,
	"desktop parameter cards must keep equal heights only within each row"
)
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
	workspace.includes('className="grid items-start gap-4 xl:grid-cols'),
	true,
	"workspace spacing must stay compact"
)
assert.equal(page.includes("xl:h-[calc(100dvh-7rem)]"), false, "detail page must not force the old fixed viewport")
assert.equal(page.includes("xl:overflow-hidden"), false, "detail page must not clip long parameter groups")
assert.equal(
	workspace.includes("<AssetMediaShowcase covers={media?.covers ?? []} />"),
	true,
	"the media frame must always render"
)
assert.equal(media.includes("if (!primary) return null"), false, "missing covers must not remove the media frame")
assert.equal(media.includes("暂无图片"), true, "the empty media frame must use a neutral label")
assert.equal(tags.includes('add("用途", asset.role || "未填写"'), true, "every asset type must show its purpose role")

console.log("asset showcase layout contract passed")
