import { getAssetTypeLabel, getStatusLabel } from "./asset-schema.ts"
import type { AssetRecord } from "../../types.ts"

function sanitizeAssetMetadataForArchive(metadata?: Record<string, unknown>) {
	return Object.fromEntries(Object.entries(metadata ?? {}).filter(([key]) => key !== "fixed_ipv6"))
}

export function buildAssetExportCsv(assets: AssetRecord[], monitoredAssetIds: ReadonlySet<string>) {
	const rows = assets.map((asset) => {
		return {
			id: asset.id,
			name: asset.name,
			type: asset.type,
			type_label: getAssetTypeLabel(asset.type),
			status: getStatusLabel(asset.status || "active"),
			vendor: asset.vendor || "",
			model: asset.model || "",
			serial_number: asset.serial_number || "",
			management_ip: asset.management_ip || "",
			location: asset.location || "",
			role: asset.role || "",
			monitored: monitoredAssetIds.has(asset.id) ? "是" : "否",
			notes: asset.notes || "",
			metadata: JSON.stringify(sanitizeAssetMetadataForArchive(asset.metadata)),
		}
	})
	return `\uFEFF${toCsv(rows)}`
}

// 相对路径 re-export 共享实现：本文件被 node --experimental-strip-types 测试链直接加载，不能用 @/ 别名
export { downloadTextFile } from "../../lib/download-text-file.ts"

export function formatAssetExportTimestamp(date: Date) {
	const pad = (value: number) => String(value).padStart(2, "0")
	return [
		date.getFullYear(),
		pad(date.getMonth() + 1),
		pad(date.getDate()),
		"-",
		pad(date.getHours()),
		pad(date.getMinutes()),
		pad(date.getSeconds()),
	].join("")
}

function toCsv(rows: Record<string, unknown>[]) {
	if (rows.length === 0) return ""
	const headers = Object.keys(rows[0])
	const lines = [headers.join(",")]
	for (const row of rows) {
		lines.push(headers.map((header) => escapeCsvValue(row[header])).join(","))
	}
	return lines.join("\r\n")
}

function escapeCsvValue(value: unknown) {
	const text = String(value ?? "")
	if (/[",\r\n]/.test(text)) {
		return `"${text.replace(/"/g, '""')}"`
	}
	return text
}
