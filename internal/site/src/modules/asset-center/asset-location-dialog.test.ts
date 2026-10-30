import { buildAssetLocationPresetSelection } from "./asset-location-dialog.ts"
import { isAssetLocationNotApplicable, type AssetLocationPreset } from "./asset-location.ts"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

function assertDeepEqual(actual: unknown, expected: unknown) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
	}
}

const rootPresets: AssetLocationPreset[] = [
	{ name: "家", kind: "area", sortOrder: 10 },
	{ name: "公司", kind: "area", sortOrder: 20 },
]
const secondPresets: AssetLocationPreset[] = [{ name: "书房", kind: "room", parentName: "家", sortOrder: 130 }]

assertDeepEqual(
	buildAssetLocationPresetSelection({
		rootSelection: "家",
		secondSelection: "书房",
		customRoot: "",
		customSecond: "",
		rootPresets,
		secondPresets,
	}),
	{
		rootName: "家",
		rootPreset: rootPresets[0],
		secondName: "书房",
		secondPreset: secondPresets[0],
	}
)

const assetLocationInputSource = readFileSync(new URL("./components/asset-form-fields.tsx", import.meta.url), "utf8")
assert.equal(assetLocationInputSource.includes("一级位置"), false)
assert.equal(assetLocationInputSource.includes("二级位置"), false)
assert.equal(assetLocationInputSource.includes('aria-label="位置"'), true)
assert.equal(assetLocationInputSource.includes('aria-label="房间或子位置"'), true)

assertDeepEqual(isAssetLocationNotApplicable("internet"), true)
assertDeepEqual(isAssetLocationNotApplicable("phone"), false)
assertDeepEqual(isAssetLocationNotApplicable("web_endpoint"), false)

assertDeepEqual(
	buildAssetLocationPresetSelection({
		rootSelection: "__custom__",
		secondSelection: "__custom__",
		customRoot: " 父母家 ",
		customSecond: " 客房 ",
		rootPresets,
		secondPresets: [],
	}),
	{
		rootName: "父母家",
		rootPreset: undefined,
		secondName: "客房",
		secondPreset: undefined,
	}
)

assertDeepEqual(
	buildAssetLocationPresetSelection({
		rootSelection: "公司",
		secondSelection: "__none__",
		customRoot: "",
		customSecond: "",
		rootPresets,
		secondPresets: [],
	}),
	{
		rootName: "公司",
		rootPreset: rootPresets[1],
		secondName: "",
		secondPreset: undefined,
	}
)
