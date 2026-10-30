import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const assetEditorFieldFiles = [
	fileURLToPath(new URL("./components/asset-edit-profile-fields.tsx", import.meta.url)),
	fileURLToPath(new URL("./components/asset-form-fields.tsx", import.meta.url)),
]

for (const file of assetEditorFieldFiles) {
	assert.equal(
		readFileSync(file, "utf8").includes("AssetFieldCaptureTag"),
		false,
		"资产编辑字段标题不应显示采集来源标签"
	)
}
