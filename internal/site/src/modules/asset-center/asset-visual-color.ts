export function mergeOfficialColorOptions(options: string[], current?: string) {
	const result = [...options]
	const value = current?.trim()
	if (value && !options.some((option) => normalizeComparableText(option) === normalizeComparableText(value))) {
		result.unshift(value)
	}
	return result
}

function normalizeComparableText(value: string) {
	return value.trim().toLowerCase()
}
