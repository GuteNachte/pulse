import type { AssetInterfaceRecord, AssetRelationRecord } from "../../types.ts"
import { withTopologyMetadata, type TopologyDomain, type TopologyMedium } from "./topology-domain.ts"

export type NetworkRelationPayload = {
	user: string
	source_asset: string
	target_asset: string
	kind: "connected_to"
	label?: string
	metadata: Record<string, unknown>
}

export type RelationValidationFailure = {
	ok: false
	reason: "missing-interface" | "interface-ownership" | "same-asset"
}

export type BuildNetworkRelationInput = {
	user: string
	sourceAsset: string
	targetAsset: string
	sourceInterface: string
	targetInterface: string
	domain: TopologyDomain
	medium: TopologyMedium
	interfaces: AssetInterfaceRecord[]
	metadata?: Record<string, unknown>
	label?: string
}

type RelationCollection = {
	create: (payload: Record<string, unknown>) => Promise<AssetRelationRecord>
	update: (id: string, payload: Record<string, unknown>) => Promise<AssetRelationRecord>
	delete: (id: string) => Promise<unknown>
}

export function validateInterfaceOwnership({
	sourceAsset,
	targetAsset,
	sourceInterface,
	targetInterface,
	interfaces,
}: Pick<
	BuildNetworkRelationInput,
	"sourceAsset" | "targetAsset" | "sourceInterface" | "targetInterface" | "interfaces"
>): { ok: true } | RelationValidationFailure {
	if (sourceAsset === targetAsset) return { ok: false, reason: "same-asset" }
	if (!sourceInterface || !targetInterface) return { ok: false, reason: "missing-interface" }
	const interfacesById = new Map(interfaces.map((item) => [item.id, item]))
	const source = interfacesById.get(sourceInterface)
	const target = interfacesById.get(targetInterface)
	if (!source || !target) return { ok: false, reason: "missing-interface" }
	if (source.asset !== sourceAsset || target.asset !== targetAsset) {
		return { ok: false, reason: "interface-ownership" }
	}
	return { ok: true }
}

export function buildNetworkRelationPayload(
	input: BuildNetworkRelationInput
): { ok: true; payload: NetworkRelationPayload } | RelationValidationFailure {
	const validation = validateInterfaceOwnership(input)
	if (!validation.ok) return validation
	return {
		ok: true,
		payload: {
			user: input.user,
			source_asset: input.sourceAsset,
			target_asset: input.targetAsset,
			kind: "connected_to",
			...(input.label?.trim() ? { label: input.label.trim() } : {}),
			metadata: withTopologyMetadata(
				{
					...input.metadata,
					source_interface: input.sourceInterface,
					target_interface: input.targetInterface,
				},
				{ domain: input.domain, medium: input.medium }
			),
		},
	}
}

export async function saveNetworkRelation({
	readOnly,
	relationId,
	input,
	collection,
}: {
	readOnly: boolean
	relationId?: string
	input: BuildNetworkRelationInput
	collection: RelationCollection
}): Promise<
	| { status: "saved"; relation: AssetRelationRecord }
	| { status: "invalid"; reason: RelationValidationFailure["reason"] }
	| { status: "forbidden" }
	| { status: "failed"; error: unknown }
> {
	if (readOnly) return { status: "forbidden" }
	const result = buildNetworkRelationPayload(input)
	if (!result.ok) return { status: "invalid", reason: result.reason }
	try {
		const relation = relationId
			? await collection.update(relationId, result.payload)
			: await collection.create(result.payload)
		return { status: "saved", relation }
	} catch (error) {
		return { status: "failed", error }
	}
}

export async function deleteNetworkRelation({
	readOnly,
	relationId,
	collection,
}: {
	readOnly: boolean
	relationId: string
	collection: RelationCollection
}): Promise<{ status: "deleted" } | { status: "forbidden" } | { status: "failed"; error: unknown }> {
	if (readOnly) return { status: "forbidden" }
	try {
		await collection.delete(relationId)
		return { status: "deleted" }
	} catch (error) {
		return { status: "failed", error }
	}
}
