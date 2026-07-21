import { NETWORK_ASSET_TYPES, getMetadataNumber, isInternetResourceAssetType } from "./asset-schema.ts"
import type { AssetFormState } from "./asset-import.ts"
import type { AssetInterfaceKind } from "../../types"

export function buildPrimaryInterfacePayload(userId: string, assetId: string, form: AssetFormState) {
	if (form.type === "ont") return null
	if (isInternetResourceAssetType(form.type)) return null
	const metadata = form.metadata
	const speed = getPrimaryInterfaceSpeed(form)
	const mac = metadata.mac?.trim() || ""
	const ipv4 = getPrimaryIpv4(form)
	const ipv6 = ""
	if (!speed && !mac && !ipv4 && !form.management_ip.trim()) return null
	return {
		user: userId,
		asset: assetId,
		name: getPrimaryInterfaceName(form),
		kind: getPrimaryInterfaceKind(form),
		mac,
		ipv4,
		ipv6,
		speed_mbps: speed,
		connected: form.status === "active",
		primary: true,
		source: "manual",
		metadata: { sync: "asset-center" },
	}
}

function getPrimaryInterfaceName(form: AssetFormState) {
	if (NETWORK_ASSET_TYPES.includes(form.type)) return "管理口"
	if (form.metadata.connection_type === "wifi") return "无线网卡"
	if (form.metadata.connection_type === "both") return "主网卡"
	return "主网卡"
}

function getPrimaryInterfaceKind(form: AssetFormState): AssetInterfaceKind {
	if (NETWORK_ASSET_TYPES.includes(form.type)) return "management"
	if (form.metadata.connection_type === "wifi") return "wifi"
	return "ethernet"
}

function getPrimaryIpv4(form: AssetFormState) {
	return form.metadata.fixed_ipv4?.trim() || form.management_ip.trim()
}

function getPrimaryInterfaceSpeed(form: AssetFormState) {
	if (NETWORK_ASSET_TYPES.includes(form.type)) return getMetadataNumber(form.metadata, "default_port_speed_mbps")
	return getMetadataNumber(form.metadata, "primary_nic_speed_mbps")
}
