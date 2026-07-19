export function getAssetParameterSectionId(groupId: string) {
	return `asset-parameter-${groupId}`
}

export function getAssetParameterScrollBehavior(prefersReducedMotion: boolean): ScrollBehavior {
	return prefersReducedMotion ? "auto" : "smooth"
}
