export function normalizeMemorySpecification(value: string | undefined) {
	const text = value?.trim() ?? ""
	if (!text) return ""
	if (/^\d+(?:\.\d+)?\s*GB\s*x\s*\d+(?:\s*\+\s*\d+(?:\.\d+)?\s*GB\s*x\s*\d+)*$/i.test(text)) {
		return text.replace(/(\d+(?:\.\d+)?)\s*GB\s*x\s*(\d+)/gi, "$1 GB x $2")
	}
	const capacities = new Map<number, number>()
	for (const match of text.matchAll(/(\d+(?:\.\d+)?)\s*(?:GB|G)/gi)) {
		const capacity = Number(match[1])
		if (!Number.isFinite(capacity) || capacity <= 0) continue
		capacities.set(capacity, (capacities.get(capacity) ?? 0) + 1)
	}
	if (capacities.size === 0) return text
	return [...capacities.entries()]
		.sort(([left], [right]) => left - right)
		.map(([capacity, count]) => `${formatMemoryCapacity(capacity)} GB x ${count}`)
		.join(" + ")
}

function formatMemoryCapacity(value: number) {
	return Number.isInteger(value) ? String(value) : String(value).replace(/\.0+$/, "")
}
