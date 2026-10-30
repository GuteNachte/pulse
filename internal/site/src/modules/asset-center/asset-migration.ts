export type AssetMigrationMode = "add_only" | "merge" | "replace_matched"

export type AssetMigrationArchiveEntry = {
	path: string
	size: number
	sha256: string
}

export type AssetMigrationManifest = {
	schema: string
	package_id: string
	pulse_version: string
	created_at: string
	source_instance: string
	scope: string
	counts: Record<string, number>
	files: AssetMigrationArchiveEntry[]
}

export type AssetMigrationPlan = {
	create: number
	merge: number
	replace: number
	skip: number
}

export type AssetMigrationMessage = {
	level: "info" | "warning" | "error"
	code: string
	message: string
}

export type AssetMigrationPreflight = {
	upload_id: string
	status: "ready" | "warning" | "blocked"
	manifest: AssetMigrationManifest
	counts: Record<string, number>
	plans: Record<AssetMigrationMode, AssetMigrationPlan>
	messages: AssetMigrationMessage[]
	blockers: number
}

export type AssetMigrationResult = {
	status: string
	created: number
	merged: number
	replaced: number
	skipped: number
	files: number
}

export type AssetMigrationSummary = {
	assetCount: number
	interfaceCount: number
	fileCount: number
	canApply: boolean
	modeOptions: Array<{ value: AssetMigrationMode; label: string; detail: string }>
}

export function isAssetMigrationPackage(filename: string) {
	return filename.trim().toLowerCase().endsWith(".zip")
}

export function buildAssetMigrationSummary(preflight: AssetMigrationPreflight): AssetMigrationSummary {
	return {
		assetCount: preflight.counts.assets ?? 0,
		interfaceCount: preflight.counts.asset_interfaces ?? 0,
		fileCount: preflight.manifest.files.length,
		canApply: preflight.status !== "blocked" && preflight.blockers === 0,
		modeOptions: [
			{
				value: "add_only",
				label: "仅新增",
				detail: formatAssetMigrationPlan(preflight.plans.add_only),
			},
			{
				value: "merge",
				label: "合并补全",
				detail: formatAssetMigrationPlan(preflight.plans.merge),
			},
			{
				value: "replace_matched",
				label: "覆盖匹配项",
				detail: formatAssetMigrationPlan(preflight.plans.replace_matched),
			},
		],
	}
}

function formatAssetMigrationPlan(plan: AssetMigrationPlan | undefined) {
	if (!plan) return "无可执行记录"
	const parts = [
		plan.create > 0 ? `新增 ${plan.create}` : "",
		plan.merge > 0 ? `合并 ${plan.merge}` : "",
		plan.replace > 0 ? `覆盖 ${plan.replace}` : "",
		plan.skip > 0 ? `跳过 ${plan.skip}` : "",
	].filter(Boolean)
	return parts.join("，") || "无变更"
}
