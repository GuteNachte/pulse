import { pb } from "@/lib/api"
import type { AssetMigrationMode, AssetMigrationPreflight, AssetMigrationResult } from "./asset-migration"

export async function downloadAssetMigrationPackage() {
	const response = await fetch("/api/pulse/assets/migrations/export", {
		method: "POST",
		headers: { Authorization: pb.authStore.token },
	})
	if (!response.ok) throw new Error(`HTTP ${response.status}`)
	const disposition = response.headers.get("Content-Disposition") ?? ""
	const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? `pulse-assets-${Date.now()}.pulse-assets.zip`
	downloadBlob(await response.blob(), filename)
}

export async function uploadAssetMigrationPackage(file: File) {
	const body = new FormData()
	body.append("file", file)
	const response = await fetch("/api/pulse/assets/migrations/upload", {
		method: "POST",
		headers: { Authorization: pb.authStore.token },
		body,
	})
	if (!response.ok) throw new Error(`HTTP ${response.status}`)
	return (await response.json()) as { upload_id: string }
}

export function preflightAssetMigrationPackage(uploadId: string) {
	return pb.send<AssetMigrationPreflight>(`/api/pulse/assets/migrations/${encodeURIComponent(uploadId)}/preflight`, {
		method: "POST",
	})
}

export function applyAssetMigrationPackage(uploadId: string, mode: AssetMigrationMode) {
	return pb.send<AssetMigrationResult>(`/api/pulse/assets/migrations/${encodeURIComponent(uploadId)}/apply`, {
		method: "POST",
		body: { mode },
	})
}

function downloadBlob(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob)
	const link = document.createElement("a")
	link.href = url
	link.download = filename
	document.body.appendChild(link)
	link.click()
	link.remove()
	URL.revokeObjectURL(url)
}
