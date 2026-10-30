import assert from "node:assert/strict"
import { buildBackupRow, getRestoreTaskStageLabel } from "./backup-model.ts"

const row = buildBackupRow({
	key: "pulse-instance.zip",
	type: "pulse",
	checksum: "verified",
	scope: "instance",
	pulse_version: "1.0.6",
	size: 2048,
	modified: "2026-07-24T00:00:00Z",
})
assert.equal(row.typeLabel, "Pulse 完整备份")
assert.equal(row.checksumLabel, "校验通过")
assert.equal(row.versionLabel, "1.0.6")
assert.equal(buildBackupRow({ ...row.record, type: "legacy", checksum: "unchecked" }).typeLabel, "旧版原生备份")
assert.equal(getRestoreTaskStageLabel("restore_external_media"), "恢复设备图片")
assert.equal(getRestoreTaskStageLabel("manual_recovery_required"), "需要手动恢复")

console.log("backup model tests passed")
