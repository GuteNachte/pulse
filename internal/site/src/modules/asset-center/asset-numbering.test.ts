import assert from "node:assert/strict"
import { buildAssetTagCandidates, buildNextAssetTag, resolveAssetNumberingSettings } from "./asset-numbering.ts"

const settings = { prefix: "ASSET-", digits: 4, nextSequence: 1 }
const assets = [
	{ metadata: { asset_tag: "ASSET-0001" } },
	{ metadata: { asset_tag: "ASSET-0003" } },
	{ metadata: { asset_tag: "CUSTOM-42" } },
] as never[]

assert.deepEqual(buildAssetTagCandidates(assets, settings), [
	"ASSET-0004",
	"ASSET-0005",
	"ASSET-0006",
	"ASSET-0007",
	"ASSET-0008",
])
assert.equal(buildNextAssetTag(assets, settings), "ASSET-0004")

assert.deepEqual(
	resolveAssetNumberingSettings(
		{ prefix: "NET-", digits: "5", nextSequence: "12" },
		{ prefix: "LOCAL-", digits: "3", nextSequence: "2" }
	),
	{ prefix: "NET-", digits: "5", nextSequence: "12" }
)
assert.deepEqual(resolveAssetNumberingSettings(null, { prefix: "LOCAL-", digits: "3", nextSequence: "2" }), {
	prefix: "LOCAL-",
	digits: "3",
	nextSequence: "2",
})
