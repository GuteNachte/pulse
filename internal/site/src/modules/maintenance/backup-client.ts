import { pb } from "@/lib/api"
import type { BackupPreflight, BackupRecord, RestoreStorageTarget, RestoreTask } from "./backup-model"

export async function listBackups() {
	return (await pb.send<{ items: BackupRecord[] }>("/api/pulse/backups", { requestKey: null })).items
}

export function createPortableBackup(name: string) {
	return pb.send<{ key: string }>("/api/pulse/backups", { method: "POST", body: { name } })
}

export async function uploadPortableBackup(file: File) {
	const body = new FormData()
	body.append("file", file)
	const response = await fetch("/api/pulse/backups/upload", {
		method: "POST",
		headers: { Authorization: pb.authStore.token },
		body,
	})
	if (!response.ok) throw new Error(`HTTP ${response.status}`)
	return (await response.json()) as BackupRecord
}

export function preflightPortableBackup(key: string, target?: RestoreStorageTarget) {
	return pb.send<BackupPreflight>(`/api/pulse/backups/${encodeURIComponent(key)}/preflight`, {
		method: "POST",
		body: target ?? {},
	})
}

export function startPortableRestore(key: string, target: RestoreStorageTarget) {
	return pb.send<RestoreTask>(`/api/pulse/backups/${encodeURIComponent(key)}/restore`, { method: "POST", body: target })
}

export function getRestoreTask(id: string) {
	return pb.send<RestoreTask>(`/api/pulse/backups/tasks/${encodeURIComponent(id)}`, { requestKey: null })
}

export async function downloadBackup(record: BackupRecord) {
	const response = await fetch(`/api/pulse/backups/${encodeURIComponent(record.key)}`, {
		headers: { Authorization: pb.authStore.token },
	})
	if (!response.ok) throw new Error(`HTTP ${response.status}`)
	const url = URL.createObjectURL(await response.blob())
	const link = document.createElement("a")
	link.href = url
	link.download = record.key
	document.body.appendChild(link)
	link.click()
	link.remove()
	URL.revokeObjectURL(url)
}

export function deleteBackup(record: BackupRecord) {
	return pb.send(`/api/pulse/backups/${encodeURIComponent(record.key)}`, { method: "DELETE" })
}
