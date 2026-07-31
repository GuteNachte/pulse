export type DemoRecord = Record<string, unknown> & { id: string }

export type DemoListResult<T> = {
	page: number
	perPage: number
	totalItems: number
	totalPages: number
	items: T[]
}

function getField(record: DemoRecord, path: string) {
	return path.split(".").reduce<unknown>((value, key) => {
		if (typeof value !== "object" || value === null) return undefined
		return (value as Record<string, unknown>)[key]
	}, record)
}

function parseValue(quoted: string | undefined, primitive: string | undefined) {
	if (quoted !== undefined) {
		return quoted.replaceAll('\\"', '"').replaceAll("\\\\", "\\")
	}
	if (primitive === "true") return true
	if (primitive === "false") return false
	if (primitive && /^-?\d+(?:\.\d+)?$/.test(primitive)) return Number(primitive)
	return primitive
}

export function matchesFilter(record: DemoRecord, filter: string) {
	const normalized = filter.trim()
	if (!normalized) return true
	return normalized.split(/\s*&&\s*/).every((rawExpression) => {
		const expression = rawExpression
			.trim()
			.replace(/^\((.*)\)$/, "$1")
			.trim()
		const match = expression.match(/^([A-Za-z_][\w.]*)\s*(=|!=)\s*(?:"((?:\\.|[^"])*)"|(true|false|-?\d+(?:\.\d+)?))$/)
		if (!match) {
			throw new Error(`Unsupported demo filter: ${expression}`)
		}
		const [, field, operator, quoted, primitive] = match
		const expected = parseValue(quoted, primitive)
		const actual = getField(record, field)
		return operator === "=" ? actual === expected : actual !== expected
	})
}

export function projectRecord<T extends DemoRecord>(record: T, fields?: string): Partial<T> {
	if (!fields?.trim()) return { ...record }
	return fields
		.split(",")
		.map((field) => field.trim())
		.filter(Boolean)
		.reduce<Partial<T>>((result, field) => {
			if (field in record) {
				;(result as Record<string, unknown>)[field] = record[field]
			}
			return result
		}, {})
}

function compareValues(left: unknown, right: unknown) {
	if (left === right) return 0
	if (left === undefined || left === null) return -1
	if (right === undefined || right === null) return 1
	if (typeof left === "number" && typeof right === "number") return left - right
	return String(left).localeCompare(String(right), "zh-CN", { numeric: true, sensitivity: "base" })
}

export function listRecords<T extends DemoRecord>(records: T[], url: URL): DemoListResult<Partial<T>> {
	const filter = url.searchParams.get("filter") ?? ""
	const sortFields = (url.searchParams.get("sort") ?? "")
		.split(",")
		.map((field) => field.trim())
		.filter(Boolean)
	const fields = url.searchParams.get("fields") ?? undefined
	const page = Math.max(1, Number(url.searchParams.get("page")) || 1)
	const perPage = Math.max(1, Number(url.searchParams.get("perPage")) || 30)
	const filtered = records.filter((record) => matchesFilter(record, filter))
	const sorted = [...filtered].sort((left, right) => {
		for (const rawField of sortFields) {
			const descending = rawField.startsWith("-")
			const field = rawField.replace(/^[-+]/, "")
			const result = compareValues(getField(left, field), getField(right, field))
			if (result !== 0) return descending ? -result : result
		}
		return 0
	})
	const start = (page - 1) * perPage
	return {
		page,
		perPage,
		totalItems: sorted.length,
		totalPages: Math.ceil(sorted.length / perPage),
		items: sorted.slice(start, start + perPage).map((record) => projectRecord(record, fields)),
	}
}

export function getRecord<T extends DemoRecord>(records: T[], id: string, fields?: string) {
	const record = records.find((item) => item.id === id)
	return record ? projectRecord(record, fields) : undefined
}
