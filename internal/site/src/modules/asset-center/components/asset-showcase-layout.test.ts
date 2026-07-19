import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const workspace = readFileSync(new URL("./asset-showcase-workspace.tsx", import.meta.url), "utf8")
const columns = readFileSync(new URL("./asset-parameter-columns.tsx", import.meta.url), "utf8")
const media = readFileSync(new URL("./asset-media-showcase.tsx", import.meta.url), "utf8")
const page = readFileSync(new URL("../asset-detail-page.tsx", import.meta.url), "utf8")

assert.equal(workspace.includes("AssetParameterNavigator"), true, "desktop archive column must render parameter navigation")
assert.equal(workspace.includes("xl:sticky xl:top-4"), true, "desktop archive column must remain visible while the page scrolls")
assert.equal(workspace.includes("xl:h-full"), false, "workspace must not force a nested viewport height")
assert.equal(columns.includes("xl:overflow-y-auto"), false, "hardware archive must use page-level scrolling")
assert.equal(columns.includes("getAssetParameterSectionId(group.id)"), true, "every parameter card must expose a stable anchor")
assert.equal(columns.includes('variant="inline"'), true, "small screens must render compact inline navigation")
assert.equal(
	columns.includes('<div className="grid gap-2 sm:grid-cols-2">'),
	true,
	"archive rows must stay compact in two columns"
)
assert.equal(columns.includes("xl:grid-cols-1"), false, "desktop archives must not stretch every short row to full width")
assert.equal(workspace.includes('className="grid items-start gap-4 xl:grid-cols'), true, "workspace spacing must stay compact")
assert.equal(page.includes("xl:h-[calc(100dvh-7rem)]"), false, "detail page must not force the old fixed viewport")
assert.equal(page.includes("xl:overflow-hidden"), false, "detail page must not clip long parameter groups")
assert.equal(workspace.includes("<AssetMediaShowcase covers={media?.covers ?? []} />"), true, "the media frame must always render")
assert.equal(media.includes("if (!primary) return null"), false, "missing covers must not remove the media frame")
assert.equal(media.includes("暂无图片"), true, "the empty media frame must use a neutral label")

console.log("asset showcase layout contract passed")
