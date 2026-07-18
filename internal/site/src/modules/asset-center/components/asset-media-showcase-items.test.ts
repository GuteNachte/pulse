import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { getAssetMediaShowcaseActiveItem, getAssetMediaShowcaseLayout } from "./asset-media-showcase-items.ts"

const layout = getAssetMediaShowcaseLayout([
	{ id: "cover-1", url: "/media/1" },
	{ id: "cover-2", url: "/media/2" },
])

assert.equal(layout.primary?.id, "cover-1")
assert.deepEqual(
	layout.thumbnails.map((item) => item.id),
	["cover-1", "cover-2"]
)
assert.equal(getAssetMediaShowcaseActiveItem(layout.primary, layout.thumbnails, "cover-1")?.id, "cover-1")
assert.equal(getAssetMediaShowcaseActiveItem(layout.primary, layout.thumbnails, "gallery-3")?.id, "cover-1")

const emptyLayout = getAssetMediaShowcaseLayout([])
assert.equal(emptyLayout.primary, undefined)
assert.deepEqual(emptyLayout.thumbnails, [])

const workspaceSource = readFileSync(new URL("./asset-showcase-workspace.tsx", import.meta.url), "utf8")
assert.equal(workspaceSource.includes("AssetVisualCard"), false)
