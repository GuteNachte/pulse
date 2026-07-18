import type { AssetStatus, AssetType } from "../../types"

export type AssetFieldInputMode =
	| "manual_required"
	| "manual_optional"
	| "fixed_choice"
	| "captured_candidate"
	| "not_applicable"

export type AssetTypeFieldSpec = {
	key: string
	label: string
	group: string
	inputMode: AssetFieldInputMode
	source: "asset" | "metadata"
	type?: "text" | "number" | "date" | "url" | "select"
	options?: readonly { value: string; label: string }[]
	placeholder?: string
	unit?: string
	readOnly?: boolean
	span?: "full"
}

export type AssetTypeSpec = {
	type: AssetType
	detailTitle: string
	providerOptions: readonly { value: string; label: string }[]
	statusOptions: readonly { value: AssetStatus; label: string }[]
	notApplicable: {
		location: boolean
		role: boolean
		interfaces: boolean
		hardware: boolean
	}
	sections: readonly { title: string; fields: readonly AssetTypeFieldSpec[] }[]
}

const internetProviderOptions = [
	{ value: "中国电信", label: "中国电信" },
	{ value: "中国联通", label: "中国联通" },
	{ value: "中国移动", label: "中国移动" },
] as const

const internetStatusOptions = [
	{ value: "active", label: "使用中" },
	{ value: "inactive", label: "暂停服务" },
	{ value: "retired", label: "已注销" },
] as const

const accessTechnologyOptions = [
	{ value: "ftth", label: "家庭光纤宽带（FTTH）" },
	{ value: "dedicated_line", label: "专线" },
	{ value: "mobile", label: "移动网络（4G / 5G）" },
] as const

const authModeOptions = [
	{ value: "pppoe", label: "PPPoE 拨号" },
	{ value: "dhcp", label: "DHCP / IPoE 自动获取" },
	{ value: "static", label: "静态 IP" },
] as const

const billingCycleOptions = [
	{ value: "monthly", label: "月付" },
	{ value: "quarterly", label: "季付" },
	{ value: "semiannual", label: "半年付" },
	{ value: "yearly", label: "年付" },
] as const

const yesNoOptions = [
	{ value: "yes", label: "是" },
	{ value: "no", label: "否" },
] as const

export const internetAssetTypeSpec: AssetTypeSpec = {
	type: "internet",
	detailTitle: "线路档案",
	providerOptions: internetProviderOptions,
	statusOptions: internetStatusOptions,
	notApplicable: { location: true, role: true, interfaces: true, hardware: true },
	sections: [
		{
			title: "基础资料",
			fields: [
				{
					key: "vendor",
					label: "运营商",
					group: "基础资料",
					inputMode: "fixed_choice",
					source: "asset",
					type: "select",
					options: internetProviderOptions,
				},
			],
		},
		{
			title: "线路参数",
			fields: [
				{
					key: "access_technology",
					label: "线路接入技术",
					group: "线路参数",
					inputMode: "fixed_choice",
					source: "metadata",
					type: "select",
					options: accessTechnologyOptions,
				},
				{
					key: "auth_mode",
					label: "联网认证方式",
					group: "线路参数",
					inputMode: "fixed_choice",
					source: "metadata",
					type: "select",
					options: authModeOptions,
				},
				{
					key: "down_mbps",
					label: "下行带宽",
					group: "线路参数",
					inputMode: "manual_required",
					source: "metadata",
					type: "number",
					placeholder: "1000",
					unit: "Mbps",
				},
				{
					key: "up_mbps",
					label: "上行带宽",
					group: "线路参数",
					inputMode: "manual_required",
					source: "metadata",
					type: "number",
					placeholder: "300",
					unit: "Mbps",
				},
			],
		},
		{
			title: "动态公网地址",
			fields: [
				{
					key: "public_ipv4",
					label: "公网 IPv4",
					group: "动态公网地址",
					inputMode: "captured_candidate",
					source: "metadata",
					readOnly: true,
				},
				{
					key: "public_ipv6",
					label: "公网 IPv6",
					group: "动态公网地址",
					inputMode: "captured_candidate",
					source: "metadata",
					readOnly: true,
				},
			],
		},
		{
			title: "套餐与续费",
			fields: [
				{
					key: "package_name",
					label: "套餐名称",
					group: "套餐与续费",
					inputMode: "manual_optional",
					source: "metadata",
					placeholder: "例如 联通千兆融合套餐",
				},
				{
					key: "recurring_price_cny",
					label: "套餐费用（元）",
					group: "套餐与续费",
					inputMode: "manual_optional",
					source: "metadata",
					type: "number",
					placeholder: "165",
				},
				{
					key: "billing_cycle",
					label: "计费周期",
					group: "套餐与续费",
					inputMode: "fixed_choice",
					source: "metadata",
					type: "select",
					options: billingCycleOptions,
				},
				{
					key: "renewal_date",
					label: "到期日期",
					group: "套餐与续费",
					inputMode: "manual_optional",
					source: "metadata",
					type: "date",
				},
				{
					key: "auto_renew",
					label: "自动续费",
					group: "套餐与续费",
					inputMode: "fixed_choice",
					source: "metadata",
					type: "select",
					options: yesNoOptions,
				},
			],
		},
		{
			title: "备注",
			fields: [
				{
					key: "notes",
					label: "备注",
					group: "备注",
					inputMode: "manual_optional",
					source: "asset",
					span: "full",
				},
			],
		},
	],
}

export function getAssetTypeSpec(type: AssetType) {
	return type === "internet" ? internetAssetTypeSpec : undefined
}

export function getAssetTypeCapabilities(type: AssetType) {
	const notApplicable = getAssetTypeSpec(type)?.notApplicable
	return {
		showLocation: !notApplicable?.location,
		showRole: !notApplicable?.role,
		showHardware: !notApplicable?.hardware,
		showInterfaces: !notApplicable?.interfaces,
	}
}

export function normalizeInternetProvider(value: string) {
	const normalized = value.trim()
	const aliases: Record<string, string> = {
		电信: "中国电信",
		联通: "中国联通",
		移动: "中国移动",
	}
	return aliases[normalized] ?? normalized
}

export function formatInternetBandwidth(value?: number) {
	if (!value || !Number.isFinite(value) || value <= 0) return ""
	if (value >= 1000) {
		const gbps = value / 1000
		return `${Number.isInteger(gbps) ? gbps.toFixed(0) : gbps.toFixed(1)} Gbps`
	}
	return `${Math.round(value)} Mbps`
}

export function getInternetStatusLabel(status: AssetStatus) {
	return internetStatusOptions.find((option) => option.value === status)?.label ?? status
}

export function getInternetOptionLabel(fieldKey: string, value: string) {
	const field = internetAssetTypeSpec.sections.flatMap((section) => section.fields).find((item) => item.key === fieldKey)
	return field?.options?.find((option) => option.value === value)?.label ?? value
}

export function validateInternetAssetValues(values: {
	name: string
	provider: string
	status: AssetStatus
	accessTechnology: string
	authMode: string
	downMbps?: number
	upMbps?: number
}) {
	const errors: string[] = []
	if (!values.name.trim()) errors.push("资源名称")
	if (!internetProviderOptions.some((option) => option.value === normalizeInternetProvider(values.provider))) {
		errors.push("运营商")
	}
	if (!internetStatusOptions.some((option) => option.value === values.status)) errors.push("使用状态")
	if (!accessTechnologyOptions.some((option) => option.value === values.accessTechnology)) errors.push("线路接入技术")
	if (!authModeOptions.some((option) => option.value === values.authMode)) errors.push("联网认证方式")
	if (!values.downMbps || values.downMbps <= 0) errors.push("下行带宽")
	if (!values.upMbps || values.upMbps <= 0) errors.push("上行带宽")
	return errors
}
