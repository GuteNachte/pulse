export const DEFAULT_SYSTEM_ROLE = "physical"
export const DEFAULT_PRIMARY_USE = "production"

export const systemAttributeOptions = [
	{ value: "physical", label: "物理机" },
	{ value: "virtualization", label: "虚拟机" },
] as const

export const systemRoleOptions = systemAttributeOptions
export type SystemRole = (typeof systemRoleOptions)[number]["value"]

export const primaryUseOptions = [
	{ value: "primary", label: "主力机" },
	{ value: "production", label: "生产服务" },
	{ value: "development", label: "开发调试" },
	{ value: "container_host", label: "容器承载" },
	{ value: "website", label: "网站服务" },
	{ value: "storage", label: "存储备份" },
	{ value: "download", label: "下载任务" },
	{ value: "network", label: "网络服务" },
] as const

export type PrimaryUse = (typeof primaryUseOptions)[number]["value"]

export function getSystemRoleLabel(value?: string) {
	const normalized = value?.trim() || DEFAULT_SYSTEM_ROLE
	return (
		systemRoleOptions.find((option) => option.value === normalized)?.label ?? getSystemRoleLabel(DEFAULT_SYSTEM_ROLE)
	)
}

export function getSystemRoleDisplayLabel(role?: string, _customRole?: string, _fallbackCustomRole?: string) {
	return getSystemRoleLabel(role)
}

export function getPrimaryUseLabel(value?: string) {
	const normalized = value?.trim() || DEFAULT_PRIMARY_USE
	return (
		primaryUseOptions.find((option) => option.value === normalized)?.label ?? getPrimaryUseLabel(DEFAULT_PRIMARY_USE)
	)
}

export function getSystemDisplayName(
	system?: { display_name?: string; name?: string; info?: { h?: string }; is_local?: boolean },
	fallback = "待接入机器"
) {
	return (
		normalizeSystemName(system?.display_name) ||
		normalizeSystemName(system?.info?.h) ||
		normalizeSystemName(system?.name) ||
		fallback
	)
}

export function getSystemHostname(system?: { name?: string; info?: { h?: string } }, fallback = "未采集") {
	return normalizeSystemName(system?.info?.h) || normalizeSystemName(system?.name) || fallback
}

function normalizeSystemName(value?: string) {
	const normalized = value?.trim()
	if (!normalized || normalized === "本机") {
		return ""
	}
	return normalized
}
