import { getSystemDisplayName } from "@/lib/system-roles"
import type { SystemRecord } from "@/types"

export type WebsiteSystemOption = Pick<SystemRecord, "id" | "asset"> & { name: string }

export function buildWebsiteSystemOptions(availableSystemsById: Record<string, SystemRecord>) {
	return Object.values(availableSystemsById)
		.filter(Boolean)
		.map(
			(system): WebsiteSystemOption => ({
				id: system.id,
				name: getSystemDisplayName(system, system.id),
				asset: system.asset,
			})
		)
		.sort((a, b) => a.name.localeCompare(b.name))
}
