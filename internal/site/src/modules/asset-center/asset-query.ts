export function escapePocketBaseFilterValue(value: string) {
	return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')
}
