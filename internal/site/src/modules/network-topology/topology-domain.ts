export type TopologyDomain = "home" | "technology"
export type TopologyMedium = "wired" | "wifi" | "fiber"

export function getRelationDomain(metadata: Record<string, unknown> | undefined): TopologyDomain | undefined {
	const value = metadata?.network_domain
	return value === "home" || value === "technology" ? value : undefined
}

export function getRelationMedium(metadata: Record<string, unknown> | undefined): TopologyMedium | undefined {
	const value = metadata?.link_kind
	if (value === "wifi") return "wifi"
	if (value === "fiber" || value === "internet") return "fiber"
	if (value === "ethernet") return "wired"
	return undefined
}
