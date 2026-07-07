import { ASSET_TYPE_OPTIONS, buildFixedSpecAssetName } from "@/modules/asset-center/asset-schema"
import type { AssetRecord, AssetStatus, AssetType } from "@/types"

export type AssetImportPreviewRow = {
	index: number
	form: AssetFormState
	errors: string[]
	warnings: string[]
	raw: Record<string, unknown>
}

export type AssetFormState = {
	name: string
	type: AssetType
	status: AssetStatus
	parent_asset: string
	vendor: string
	model: string
	serial_number: string
	management_ip: string
	location: string
	role: string
	notes: string
	metadata: Record<string, string>
}

export function buildAssetPayload(user: string, form: AssetFormState) {
	return {
		user,
		name: form.name.trim() || buildFixedSpecAssetName(form.type, form.model, form.metadata.internal_model),
		type: form.type,
		status: form.status,
		parent_asset: form.type === "vm" ? form.parent_asset : "",
		vendor: form.vendor.trim(),
		model: form.model.trim(),
		serial_number: form.serial_number.trim(),
		management_ip: form.management_ip.trim(),
		location: form.location.trim(),
		role: form.role.trim(),
		notes: form.notes.trim(),
		metadata: normalizeMetadata(form.metadata, form.type),
	}
}

export function metadataToStringMap(metadata?: Record<string, unknown>) {
	const result: Record<string, string> = {}
	for (const [key, value] of Object.entries(metadata ?? {})) {
		if (typeof value === "string") {
			result[key] = value
		} else if (typeof value === "number" && Number.isFinite(value)) {
			result[key] = String(value)
		}
	}
	return result
}

export function normalizeMetadata(metadata: Record<string, string>, type: AssetType) {
	const result: Record<string, string | number> = {}
	const numberKeys = new Set([
		"down_mbps",
		"up_mbps",
		"port_count",
		"default_port_speed_mbps",
		"memory_gb",
		"primary_nic_speed_mbps",
		"vcpu",
		"disk_gb",
		"storage_gb",
		"capacity_va",
		"capacity_w",
		"battery_count",
		"outlet_count",
	])
	for (const [key, value] of Object.entries(metadata)) {
		const trimmed = value.trim()
		if (!trimmed) {
			continue
		}
		if (numberKeys.has(key)) {
			const parsed = Number(trimmed)
			if (Number.isFinite(parsed)) {
				result[key] = parsed
			}
			continue
		}
		result[key] = trimmed
	}
	if (type !== "internet") {
		delete result.down_mbps
		delete result.up_mbps
	}
	return result
}

export function parseAssetImportRows(input: string): Record<string, unknown>[] {
	const text = input.trim()
	if (!text) return []
	if (text.startsWith("[") || text.startsWith("{")) {
		const parsed = JSON.parse(text)
		const rows = Array.isArray(parsed) ? parsed : [parsed]
		if (!rows.every((row) => row && typeof row === "object" && !Array.isArray(row))) {
			throw new Error("JSON 必须是对象或对象数组。")
		}
		return rows as Record<string, unknown>[]
	}
	return parseCsvRows(text)
}

export function buildImportPreviewRow(
	raw: Record<string, unknown>,
	index: number,
	existingAssets: AssetRecord[]
): AssetImportPreviewRow {
	const errors: string[] = []
	const warnings: string[] = []
	const type = normalizeAssetType(getImportString(raw, ["type", "资产类型", "类型"]))
	const status = normalizeAssetStatus(getImportString(raw, ["status", "状态"]))
	const metadata = extractImportMetadata(raw)
	const name =
		getImportString(raw, ["name", "资产名称", "名称"]).trim() ||
		buildFixedSpecAssetName(
			type ?? "custom",
			getImportString(raw, ["model", "型号", "套餐"]).trim(),
			metadata.internal_model
		)
	const parentInput = getImportString(raw, ["parent_asset", "parent", "宿主资产", "宿主"]).trim()
	const parentAsset = resolveAssetReference(parentInput, existingAssets)
	const form: AssetFormState = {
		name,
		type: type ?? "custom",
		status: status ?? "active",
		parent_asset: parentAsset?.id ?? "",
		vendor: getImportString(raw, ["vendor", "厂商", "品牌", "运营商"]).trim(),
		model: getImportString(raw, ["model", "型号", "套餐"]).trim(),
		serial_number: getImportString(raw, ["serial_number", "serial", "序列号"]).trim(),
		management_ip: getImportString(raw, ["management_ip", "管理IP", "管理 IP"]).trim(),
		location: getImportString(raw, ["location", "位置", "房间"]).trim(),
		role: getImportString(raw, ["role", "用途", "角色", "说明"]).trim(),
		notes: getImportString(raw, ["notes", "备注"]).trim(),
		metadata,
	}
	if (!name) errors.push("缺少资产名称")
	if (!type) errors.push("资产类型无效")
	if (!status) errors.push("状态无效")
	if (form.type === "vm" && !form.parent_asset) {
		errors.push(parentInput ? "宿主资产不存在" : "虚拟机需要宿主资产")
	}
	for (const duplicateReason of findExistingDuplicateReasons(form, existingAssets)) {
		errors.push(duplicateReason)
	}
	if (parentInput && parentAsset && ["internet", "web_endpoint", "vm"].includes(parentAsset.type)) {
		warnings.push("宿主资产类型可能不适合作为硬件父级")
	}
	return { index, form, errors, warnings, raw }
}

export function withBatchImportDuplicateChecks(rows: AssetImportPreviewRow[]) {
	const seen = new Map<string, number>()
	return rows.map((row) => {
		const duplicateKeys = getImportDuplicateKeys(row.form)
		const errors = [...row.errors]
		for (const key of duplicateKeys) {
			const firstIndex = seen.get(key)
			if (firstIndex !== undefined) {
				errors.push(`与第 ${firstIndex + 1} 条重复`)
				continue
			}
			seen.set(key, row.index)
		}
		return { ...row, errors }
	})
}

function parseCsvRows(text: string): Record<string, unknown>[] {
	const rows = parseCsvTable(text)
	if (rows.length < 2) {
		throw new Error("CSV 需要表头和至少一条数据。")
	}
	const headers = rows[0].map((header) => header.trim())
	if (headers.some((header) => !header)) {
		throw new Error("CSV 表头不能为空。")
	}
	return rows.slice(1).map((values) => {
		const row: Record<string, unknown> = {}
		headers.forEach((header, index) => {
			row[header] = values[index] ?? ""
		})
		return row
	})
}

function parseCsvTable(text: string): string[][] {
	const rows: string[][] = []
	let row: string[] = []
	let cell = ""
	let quoted = false
	for (let index = 0; index < text.length; index += 1) {
		const char = text[index]
		const next = text[index + 1]
		if (quoted) {
			if (char === '"' && next === '"') {
				cell += '"'
				index += 1
			} else if (char === '"') {
				quoted = false
			} else {
				cell += char
			}
			continue
		}
		if (char === '"') {
			quoted = true
			continue
		}
		if (char === ",") {
			row.push(cell)
			cell = ""
			continue
		}
		if (char === "\n") {
			row.push(cell)
			rows.push(row)
			row = []
			cell = ""
			continue
		}
		if (char !== "\r") {
			cell += char
		}
	}
	if (quoted) {
		throw new Error("CSV 引号未闭合。")
	}
	row.push(cell)
	rows.push(row)
	return rows.filter((item) => item.some((value) => value.trim()))
}

function findExistingDuplicateReasons(form: AssetFormState, existingAssets: AssetRecord[]) {
	const reasons: string[] = []
	const normalizedName = normalizeCompareValue(form.name)
	const serial = normalizeCompareValue(form.serial_number)
	const managementIp = normalizeCompareValue(form.management_ip)
	const mac = normalizeMac(form.metadata.mac ?? "")
	const fixedIpv4 = normalizeCompareValue(form.metadata.fixed_ipv4 ?? "")
	for (const asset of existingAssets) {
		const metadata = metadataToStringMap(asset.metadata)
		if (normalizedName && normalizeCompareValue(asset.name) === normalizedName && asset.type === form.type) {
			reasons.push("同类型同名资产已存在")
			continue
		}
		if (serial && normalizeCompareValue(asset.serial_number ?? "") === serial) {
			reasons.push("序列号已存在")
			continue
		}
		if (
			managementIp &&
			(normalizeCompareValue(asset.management_ip ?? "") === managementIp ||
				normalizeCompareValue(metadata.fixed_ipv4 ?? "") === managementIp)
		) {
			reasons.push("管理 IP 已存在")
			continue
		}
		if (fixedIpv4 && normalizeCompareValue(metadata.fixed_ipv4 ?? "") === fixedIpv4) {
			reasons.push("固定 IPv4 已存在")
			continue
		}
		if (mac && normalizeMac(metadata.mac ?? "") === mac) {
			reasons.push("MAC 已存在")
		}
	}
	return [...new Set(reasons)]
}

function getImportDuplicateKeys(form: AssetFormState) {
	const keys: string[] = []
	const name = normalizeCompareValue(form.name)
	const serial = normalizeCompareValue(form.serial_number)
	const ip = normalizeCompareValue(form.management_ip || form.metadata.fixed_ipv4 || "")
	const mac = normalizeMac(form.metadata.mac ?? "")
	if (name) keys.push(`name:${form.type}:${name}`)
	if (serial) keys.push(`serial:${serial}`)
	if (ip) keys.push(`ip:${ip}`)
	if (mac) keys.push(`mac:${mac}`)
	return keys
}

function extractImportMetadata(raw: Record<string, unknown>) {
	const metadata: Record<string, string> = {}
	const directMetadata = raw.metadata
	if (directMetadata && typeof directMetadata === "object" && !Array.isArray(directMetadata)) {
		for (const [key, value] of Object.entries(directMetadata as Record<string, unknown>)) {
			const text = stringifyImportValue(value)
			if (text) metadata[key] = text
		}
	}
	for (const [key, value] of Object.entries(raw)) {
		if (key.startsWith("metadata.")) {
			const metadataKey = key.slice("metadata.".length)
			const text = stringifyImportValue(value)
			if (metadataKey && text) metadata[metadataKey] = text
		}
	}
	for (const [metadataKey, aliases] of Object.entries(importMetadataAliases)) {
		const text = getImportString(raw, aliases)
		if (text && !metadata[metadataKey]) metadata[metadataKey] = text
	}
	return metadata
}

function getImportString(raw: Record<string, unknown>, keys: string[]) {
	for (const key of keys) {
		if (key in raw) {
			return stringifyImportValue(raw[key])
		}
	}
	return ""
}

function stringifyImportValue(value: unknown) {
	if (value === null || value === undefined) return ""
	if (typeof value === "string") return value.trim()
	if (typeof value === "number" || typeof value === "boolean") return String(value)
	return ""
}

function normalizeAssetType(value: string): AssetType | null {
	const normalized = normalizeCompareValue(value)
	if (!normalized) return null
	const byValue = ASSET_TYPE_OPTIONS.find((item) => item.value === normalized)
	if (byValue) return byValue.value
	const byLabel = ASSET_TYPE_OPTIONS.find((item) => normalizeCompareValue(item.label) === normalized)
	return byLabel?.value ?? null
}

function normalizeAssetStatus(value: string): AssetStatus | null {
	if (!value.trim()) return "active"
	const normalized = normalizeCompareValue(value)
	const values: Record<string, AssetStatus> = {
		active: "active",
		在用: "active",
		online: "active",
		planned: "planned",
		规划: "planned",
		inactive: "inactive",
		停用: "inactive",
		offline: "inactive",
		retired: "retired",
		退役: "retired",
	}
	return values[normalized] ?? null
}

function resolveAssetReference(value: string, assets: AssetRecord[]) {
	const normalized = normalizeCompareValue(value)
	if (!normalized) return null
	return assets.find((asset) => asset.id === value || normalizeCompareValue(asset.name) === normalized) ?? null
}

function normalizeCompareValue(value: unknown) {
	return String(value ?? "")
		.trim()
		.toLowerCase()
}

function normalizeMac(value: string) {
	return value.replace(/[^0-9a-f]/gi, "").toLowerCase()
}

const importMetadataAliases: Record<string, string[]> = {
	fixed_ipv4: ["fixed_ipv4", "固定IPv4", "固定 IPv4", "ipv4", "IP", "ip"],
	fixed_ipv6: ["fixed_ipv6", "固定IPv6", "固定 IPv6", "ipv6"],
	internal_model: ["internal_model", "内部型号", "产品内部型号", "内部代号"],
	mac: ["mac", "MAC", "主MAC", "主 MAC"],
	management_url: ["management_url", "管理URL", "管理 URL"],
	down_mbps: ["down_mbps", "下行Mbps", "下行 Mbps"],
	up_mbps: ["up_mbps", "上行Mbps", "上行 Mbps"],
	port_count: ["port_count", "端口数量"],
	default_port_speed_mbps: ["default_port_speed_mbps", "默认端口速率Mbps", "默认端口速率 Mbps"],
	primary_nic_speed_mbps: ["primary_nic_speed_mbps", "主网卡速率Mbps", "主网卡速率 Mbps"],
	purchase_date: ["purchase_date", "购买日期"],
	online_date: ["online_date", "上线日期"],
	warranty_until: ["warranty_until", "保修到期"],
	owner: ["owner", "归属", "责任人"],
}
