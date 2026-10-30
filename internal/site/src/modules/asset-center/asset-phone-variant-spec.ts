export function getPhoneVariantSpecMode(value: string, presets: string[]) {
	const normalizedValue = value.trim()
	return normalizedValue && !presets.includes(normalizedValue) ? "custom" : "preset"
}
