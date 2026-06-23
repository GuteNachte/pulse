export type URLProtocol = "http://" | "https://"
export type IconSource = "internal" | "external" | "custom"
export type TargetScope = "internal" | "external"
export type TargetIPVersion = "IPv4" | "IPv6"
export type TargetKind = "internal-ipv4" | "internal-ipv6" | "external-ipv4" | "external-ipv6"
export type StatusFilter = "all" | "up" | "down" | "unknown" | "stale"

export type MonitorTargetForm = {
	id: string
	kind: TargetKind
	protocol: URLProtocol
	address: string
}

export type MonitorTargetPayload = {
	id: string
	label: string
	url: string
	scope?: TargetScope
	ip_version?: TargetIPVersion
}

export type MonitorForm = {
	id?: string
	system: string
	name: string
	description: string
	targets: MonitorTargetForm[]
	expected_content: string
	icon_source: IconSource
	icon_url: string
	group: string
	interval_seconds: number
	timeout_seconds: number
	enabled: boolean
}

export type IconPreviewState = {
	status: "idle" | "loading" | "loaded" | "failed"
	url: string
}

export const targetKindOptions: Array<{
	value: TargetKind
	label: string
	scope: TargetScope
	ipVersion: TargetIPVersion
}> = [
	{ value: "internal-ipv4", label: "内网 IPv4", scope: "internal", ipVersion: "IPv4" },
	{ value: "internal-ipv6", label: "内网 IPv6", scope: "internal", ipVersion: "IPv6" },
	{ value: "external-ipv4", label: "外网 IPv4", scope: "external", ipVersion: "IPv4" },
	{ value: "external-ipv6", label: "外网 IPv6", scope: "external", ipVersion: "IPv6" },
]

export function createEmptyForm(): MonitorForm {
	return {
		system: "",
		name: "",
		description: "",
		targets: [
			{ id: "internal-ipv4", kind: "internal-ipv4", protocol: "http://", address: "" },
			{ id: "external-ipv4", kind: "external-ipv4", protocol: "https://", address: "" },
		],
		expected_content: "",
		icon_source: "internal",
		icon_url: "",
		group: "",
		interval_seconds: 300,
		timeout_seconds: 10,
		enabled: true,
	}
}
