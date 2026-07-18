export function getAssetMediaOriginalVersionId(
	versions: Array<{ id: string; media: string; parent_version?: string }>,
	mediaId: string
): string | undefined {
	return versions.find((version) => version.media === mediaId && !version.parent_version)?.id
}
