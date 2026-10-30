import { HOST_ASSET_TYPES, NETWORK_ASSET_TYPES, getAssetTypeLabel, getMetadataString } from "./asset-schema.ts"
import { formatSpeed } from "./asset-runtime-hardware.ts"
import type {
	AssetInterfaceKind,
	AssetInterfaceRecord,
	AssetRecord,
	AssetRelationKind,
	AssetRelationRecord,
} from "@/types"

export const interfaceKindOptions: { value: AssetInterfaceKind; label: string }[] = [
	{ value: "ethernet", label: "有线" },
	{ value: "wifi", label: "无线" },
	{ value: "pon", label: "PON 光纤" },
	{ value: "optical", label: "光纤" },
	{ value: "wan", label: "WAN" },
	{ value: "lan", label: "LAN" },
	{ value: "management", label: "管理口" },
	{ value: "virtual", label: "虚拟接口" },
	// 2026-10-04 连接管理合并：电源与外接接口（官方规格常见端口）
	{ value: "power", label: "电源口" },
	{ value: "usb", label: "USB / 外设" },
	{ value: "video", label: "视频输出" },
	{ value: "custom", label: "自定义" },
]

export const relationKindOptions: { value: AssetRelationKind; label: string }[] = [
	{ value: "connected_to", label: "网络连接" },
	{ value: "hosted_on", label: "运行在" },
	{ value: "monitors", label: "监控" },
	{ value: "depends_on", label: "依赖" },
	{ value: "owns", label: "归属" },
	{ value: "located_in", label: "位于" },
	{ value: "powered_by", label: "供电于" },
	{ value: "custom", label: "自定义" },
]

export const relationLinkKindOptions = [
	{ value: "", label: "自动判断" },
	{ value: "ethernet", label: "有线链路" },
	{ value: "wifi", label: "无线链路" },
	{ value: "internet", label: "外网链路" },
	{ value: "custom", label: "自定义链路" },
]

export type RelationGuideId = "internet" | "network" | "wifi" | "power" | "host"

export type RelationFormState = {
	kind: AssetRelationKind
	target_asset: string
	current_interface: string
	peer_interface: string
	link_kind: string
	label: string
	notes: string
	guide?: RelationGuideId
}

export const emptyRelationForm: RelationFormState = {
	kind: "connected_to",
	target_asset: "",
	current_interface: "",
	peer_interface: "",
	link_kind: "",
	label: "",
	notes: "",
}

export const relationGuides: {
	id: RelationGuideId
	label: string
	description: string
	kind: AssetRelationKind
	linkKind: string
	labelPlaceholder: string
}[] = [
	{
		id: "internet",
		label: "关联接入设备",
		description: "宽带线路连接到光猫、路由器或网关的 PON / WAN 接口",
		kind: "connected_to",
		linkKind: "internet",
		labelPlaceholder: "例如 宽带 -> 光猫 PON",
	},
	{
		id: "network",
		label: "连接网络设备",
		description: "路由器、交换机、网关、光猫和外网入口",
		kind: "connected_to",
		linkKind: "ethernet",
		labelPlaceholder: "例如 LAN1 -> 主机",
	},
	{
		id: "wifi",
		label: "连接无线 / AP",
		description: "无线 AP、路由器 Wi-Fi 或无线回程",
		kind: "connected_to",
		linkKind: "wifi",
		labelPlaceholder: "例如 5G Wi-Fi",
	},
	{
		id: "power",
		label: "绑定供电来源",
		description: "UPS、智能插座或电源链路",
		kind: "powered_by",
		linkKind: "custom",
		labelPlaceholder: "例如 UPS 输出 1",
	},
	{
		id: "host",
		label: "绑定宿主资产",
		description: "虚拟机、服务或设备运行在某台主机上",
		kind: "hosted_on",
		linkKind: "custom",
		labelPlaceholder: "例如 PVE 宿主",
	},
]

export function getInterfaceKindLabel(kind?: AssetInterfaceKind) {
	return interfaceKindOptions.find((item) => item.value === kind)?.label ?? kind ?? "未知"
}

export function getRelationKindLabel(kind?: AssetRelationKind) {
	return relationKindOptions.find((item) => item.value === kind)?.label ?? kind ?? "未知"
}

export function getEmptyRelationFormForGuide(guideId?: RelationGuideId): RelationFormState {
	const guide = relationGuides.find((item) => item.id === guideId)
	if (!guide) return { ...emptyRelationForm }
	return {
		...emptyRelationForm,
		guide: guide.id,
		kind: guide.kind,
		link_kind: guide.linkKind,
	}
}

export function getRelationTargetOptions(assets: AssetRecord[], currentAssetId: string, guideId?: RelationGuideId) {
	return assets
		.filter((asset) => asset.id !== currentAssetId)
		.filter((asset) => isRelationGuideTarget(asset, guideId))
		.map((asset) => ({ value: asset.id, label: `${asset.name} · ${getAssetTypeLabel(asset.type)}` }))
}

function isRelationGuideTarget(asset: AssetRecord, guideId?: RelationGuideId) {
	if (!guideId) return true
	switch (guideId) {
		case "internet":
			return asset.type === "ont" || asset.type === "smart_ont" || asset.type === "router" || asset.type === "gateway"
		case "network":
			return asset.type === "internet" || NETWORK_ASSET_TYPES.includes(asset.type)
		case "wifi":
			return (
				asset.type === "ont" ||
				asset.type === "smart_ont" ||
				asset.type === "ap" ||
				asset.type === "router" ||
				asset.type === "gateway"
			)
		case "power":
			return asset.type === "ups" || asset.type === "plug"
		case "host":
			return HOST_ASSET_TYPES.includes(asset.type)
		default:
			return true
	}
}

export function getAssetInterfaceOptions(interfaces: AssetInterfaceRecord[], assetId: string) {
	return [
		{ value: "", label: "不指定" },
		...interfaces
			.filter((item) => item.asset === assetId)
			.map((item) => ({ value: item.id, label: getInterfaceOptionLabel(item) })),
	]
}

export function getPeerInterfaceOptions(
	interfaces: AssetInterfaceRecord[],
	assets: AssetRecord[],
	currentAssetId: string,
	targetAssetId: string,
	guideId?: RelationGuideId
) {
	const assetMap = new Map(assets.map((item) => [item.id, item]))
	const peerInterfaces = interfaces
		.filter((item) => (targetAssetId ? item.asset === targetAssetId : item.asset !== currentAssetId))
		.filter((item) => guideId !== "internet" || item.kind === "pon" || item.kind === "wan")
		.filter((item) => guideId !== "wifi" || (item.kind === "wifi" && item.metadata?.enabled !== false))
	return [
		{ value: "", label: "不指定" },
		...peerInterfaces.map((item) => ({
			value: item.id,
			label: `${assetMap.get(item.asset)?.name ?? "未知资产"} · ${getInterfaceOptionLabel(item)}`,
		})),
	]
}

function getInterfaceOptionLabel(item: AssetInterfaceRecord) {
	return [
		item.name || getInterfaceKindLabel(item.kind),
		item.speed_mbps ? formatSpeed(item.speed_mbps) : "",
		item.ipv4 || item.mac || "",
	]
		.filter(Boolean)
		.join(" · ")
}

// 关系必须带拓扑网段；拓扑页编辑时用当前画布网段，资产页新增时从两端资产的「所属网段」推断。
export function resolveRelationNetworkDomain(...assets: (AssetRecord | undefined)[]): "home" | "technology" {
	for (const item of assets) {
		const value = getMetadataString(item?.metadata, "network_domain")
		if (value === "technology" || value === "科技网") return "technology"
	}
	return "home"
}

export function buildRelationMetadata({
	relation,
	currentAssetId,
	sourceAsset,
	targetAsset,
	currentInterface,
	peerInterface,
	linkKind,
	notes,
}: {
	relation: AssetRelationRecord | null
	currentAssetId: string
	sourceAsset: string
	targetAsset: string
	currentInterface: string
	peerInterface: string
	linkKind: string
	notes: string
}) {
	const metadata = { ...(relation?.metadata ?? {}) }
	const sourceInterface = sourceAsset === currentAssetId ? currentInterface : peerInterface
	const targetInterface = targetAsset === currentAssetId ? currentInterface : peerInterface
	setMetadataString(metadata, "source_interface", sourceInterface)
	setMetadataString(metadata, "target_interface", targetInterface)
	setMetadataString(metadata, "link_kind", linkKind)
	setMetadataString(metadata, "notes", notes)
	return metadata
}

function setMetadataString(metadata: Record<string, unknown>, key: string, value: string) {
	if (value) metadata[key] = value
	else delete metadata[key]
}
