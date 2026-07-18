import { getAssetTypeLabel, getStatusLabel } from "@/modules/asset-center/asset-schema"
import { getAssetCompleteness } from "@/modules/asset-center/asset-profile-summary"
import type {
	AssetAttachmentRecord,
	AssetInterfaceRecord,
	AssetLocationRecord,
	AssetMaintenanceRecord,
	AssetRecord,
	AssetRelationRecord,
} from "@/types"

export type AssetCenterSnapshotInput = {
	exportedAt: Date
	assets: AssetRecord[]
	assetInterfaces: AssetInterfaceRecord[]
	assetRelations: AssetRelationRecord[]
	assetLocations: AssetLocationRecord[]
	assetMaintenance: AssetMaintenanceRecord[]
	assetAttachments: AssetAttachmentRecord[]
}

export function buildAssetExportCsv(assets: AssetRecord[], monitoredAssetIds: ReadonlySet<string>) {
	const rows = assets.map((asset) => {
		const completeness = getAssetCompleteness(asset)
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
			completeness: `${completeness.score}%`,
			completeness_label: completeness.label,
			notes: asset.notes || "",
			metadata: JSON.stringify(asset.metadata ?? {}),
		}
	})
	return `\uFEFF${toCsv(rows)}`
}

export function buildAssetCenterSnapshot(input: AssetCenterSnapshotInput) {
	return JSON.stringify(
		{
			schema: "pulse.asset-center.snapshot.v1",
			exported_at: input.exportedAt.toISOString(),
			counts: {
				assets: input.assets.length,
				asset_interfaces: input.assetInterfaces.length,
				asset_relations: input.assetRelations.length,
				asset_locations: input.assetLocations.length,
				asset_maintenance: input.assetMaintenance.length,
				asset_attachments: input.assetAttachments.length,
			},
			assets: input.assets,
			asset_interfaces: input.assetInterfaces,
			asset_relations: input.assetRelations,
			asset_locations: input.assetLocations,
			asset_maintenance: input.assetMaintenance,
			asset_attachments: input.assetAttachments,
		},
		null,
		2
	)
}

export function downloadTextFile(filename: string, content: string, type: string) {
	const blob = new Blob([content], { type })
	const url = URL.createObjectURL(blob)
	const anchor = document.createElement("a")
	anchor.href = url
	anchor.download = filename
	document.body.appendChild(anchor)
	anchor.click()
	anchor.remove()
	URL.revokeObjectURL(url)
}

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
