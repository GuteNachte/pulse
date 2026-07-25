type MediaItem = { id: string; active_version?: string }
type Placement = { role: string; version: string; visible?: boolean }

export function getAssetMediaInitialSelection(media: MediaItem[], placements: Placement[]): string | null {
	const coverVersion = placements.find(
		(placement) => placement.role === "cover" && placement.visible !== false
	)?.version
	return media.find((item) => item.active_version === coverVersion)?.id ?? media[0]?.id ?? null
}
