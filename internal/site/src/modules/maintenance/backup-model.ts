export type BackupRecord = {
	key: string
	size: number
	modified: string
	type: "pulse" | "legacy"
	pulse_version?: string
	checksum: "verified" | "unchecked" | "failed"
	scope: string
}

export type RestoreStorageTarget = { asset_media_root: string }
export type BackupCheck = { level: string; code: string; message: string }
export type BackupManifest = {
	schema: string
	backup_id: string
	scope: string
	pulse_version: string
	created_at: string
	external: { asset_media: { included: boolean; files: number; bytes: number } }
}
export type BackupPreflight = {
	key: string
	status: "ready" | "blocked"
	manifest: BackupManifest
	target: RestoreStorageTarget
	checks: BackupCheck[]
	blockers: BackupCheck[]
	warnings: BackupCheck[]
}
export type RestoreTask = {
	id: string
	key: string
	status: string
	stage: string
	safety_backup_key: string
	target: RestoreStorageTarget
	error?: string
	updated_at: string
}

export function buildBackupRow(record: BackupRecord) {
	return {
		record,
		typeLabel: record.type === "pulse" ? "Pulse 完整备份" : "旧版原生备份",
		checksumLabel: record.checksum === "verified" ? "校验通过" : record.checksum === "failed" ? "校验失败" : "未校验",
		versionLabel: record.pulse_version || "-",
	}
}

const restoreTaskStageLabels: Record<string, string> = {
	preflight: "执行恢复预检",
	safety_backup: "创建安全备份",
	stage_payloads: "暂存恢复数据",
	restore_database: "恢复数据库",
	restore_external_media: "恢复设备图片",
	apply_storage_settings: "应用存储设置",
	verify: "核验恢复结果",
	success: "恢复完成",
	rollback: "自动回滚",
	rollback_complete: "已回滚",
	manual_recovery_required: "需要手动恢复",
}

export function getRestoreTaskStageLabel(stage: string) {
	return restoreTaskStageLabels[stage] ?? stage
}
