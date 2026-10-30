import assert from "node:assert/strict"
import { buildAssetMigrationSummary, isAssetMigrationPackage } from "./asset-migration.ts"

assert.equal(isAssetMigrationPackage("pulse-assets-20260724.pulse-assets.zip"), true)
assert.equal(isAssetMigrationPackage("assets.zip"), true)
assert.equal(isAssetMigrationPackage("assets.json"), false)

const model = buildAssetMigrationSummary({
	upload_id: "upload-1",
	status: "warning",
	manifest: {
		schema: "pulse.asset-center.package.v1",
		package_id: "package-1",
		pulse_version: "1.0.6",
		created_at: "2026-07-24T00:00:00Z",
		source_instance: "source-1",
		scope: "asset-center",
		counts: { assets: 9, asset_interfaces: 12 },
		files: [{ path: "records.json", size: 100, sha256: "a".repeat(64) }],
	},
	counts: { assets: 9, asset_interfaces: 12 },
	plans: {
		add_only: { create: 7, merge: 0, replace: 0, skip: 2 },
		merge: { create: 7, merge: 2, replace: 0, skip: 0 },
		replace_matched: { create: 7, merge: 0, replace: 2, skip: 0 },
	},
	messages: [{ level: "warning", code: "asset_conflicts", message: "检测到 2 个现有资产" }],
	blockers: 0,
})

assert.equal(model.assetCount, 9)
assert.equal(model.interfaceCount, 12)
assert.equal(model.fileCount, 1)
assert.equal(model.modeOptions[0].label, "仅新增")
assert.equal(model.modeOptions[0].detail, "新增 7，跳过 2")
assert.equal(model.canApply, true)

console.log("asset migration model tests passed")
