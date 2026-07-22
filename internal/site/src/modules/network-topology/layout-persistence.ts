import type { NetworkLayoutRecord } from "../../types.ts"
import { serializeTopologyLayout, type TopologyLayoutV2 } from "./layout-v2.ts"
import type { TopologyDomain } from "./topology-domain.ts"

export type TopologyLayoutKey = "network-home" | "network-technology"

export type SaveTopologyLayoutResult =
	| { status: "saved"; updated: string }
	| { status: "conflict"; remote: NetworkLayoutRecord }
	| { status: "failed"; error: unknown }

type LayoutCollection = {
	getOne: (
		id: string,
		options: { fields: string; requestKey: null }
	) => Promise<NetworkLayoutRecord>
	update: (id: string, payload: Record<string, unknown>) => Promise<NetworkLayoutRecord>
	create: (payload: Record<string, unknown>) => Promise<NetworkLayoutRecord>
}

export function getTopologyLayoutKey(domain: TopologyDomain): TopologyLayoutKey {
	return domain === "technology" ? "network-technology" : "network-home"
}

export async function saveTopologyLayout({
	record,
	loadedUpdated,
	layout,
	layoutKey,
	userId,
	collection,
}: {
	record?: Pick<NetworkLayoutRecord, "id" | "updated">
	loadedUpdated?: string
	layout: TopologyLayoutV2
	layoutKey: TopologyLayoutKey
	userId: string
	collection: LayoutCollection
}): Promise<SaveTopologyLayoutResult> {
	try {
		if (record) {
			const remote = await collection.getOne(record.id, {
				fields: "id,key,layout,updated",
				requestKey: null,
			})
			if (remote.updated !== loadedUpdated) {
				return { status: "conflict", remote }
			}
		}

		const payload = {
			user: userId,
			key: layoutKey,
			layout: serializeTopologyLayout(layout),
		}
		const saved = record
			? await collection.update(record.id, payload)
			: await collection.create(payload)
		return { status: "saved", updated: saved.updated }
	} catch (error) {
		return { status: "failed", error }
	}
}
