import { pb } from "@/lib/api"
import { NETWORK_ASSET_TYPES, getMetadataNumber } from "@/modules/asset-center/asset-schema"
import type { AssetFormState } from "@/modules/asset-center/asset-import"
import type { AssetInterfaceKind, AssetInterfaceRecord } from "@/types"

export async function syncPrimaryInterface(userId: string, assetId: string, form: AssetFormState) {
	const interfacePayload = buildPrimaryInterfacePayload(userId, assetId, form)
	if (!interfacePayload) {
		return
	}
	const existing = await pb.collection<AssetInterfaceRecord>("asset_interfaces").getFullList({
		filter: `asset="${assetId}" && source="manual" && primary=true`,
		requestKey: null,
	})
	if (existing[0]) {
		await pb.collection("asset_interfaces").update(existing[0].id, interfacePayload)
		return
	}
	await pb.collection("asset_interfaces").create(interfacePayload)
}

export function buildPrimaryInterfacePayload(userId: string, assetId: string, form: AssetFormState) {
	const metadata = form.metadata
	const speed = getPrimaryInterfaceSpeed(form)
	const mac = metadata.mac?.trim() || ""
	const ipv4 = getPrimaryIpv4(form)
	const ipv6 = metadata.fixed_ipv6?.trim() || metadata.public_ipv6?.trim() || ""
	if (!speed && !mac && !ipv4 && !ipv6 && !form.management_ip.trim()) {
		return null
	}
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
		metadata: {
			sync: "asset-center",
		},
	}
}

function getPrimaryInterfaceName(form: AssetFormState) {
	if (form.type === "internet") return "公网入口"
	if (NETWORK_ASSET_TYPES.includes(form.type)) return "管理口"
	if (form.metadata.connection_type === "wifi") return "无线网卡"
	if (form.metadata.connection_type === "both") return "主网卡"
	return "主网卡"
}

function getPrimaryInterfaceKind(form: AssetFormState): AssetInterfaceKind {
	if (form.type === "internet") return "wan"
	if (NETWORK_ASSET_TYPES.includes(form.type)) return "management"
	if (form.metadata.connection_type === "wifi") return "wifi"
	return "ethernet"
}

function getPrimaryIpv4(form: AssetFormState) {
	if (form.type === "internet") return form.metadata.public_ipv4?.trim() || ""
	return form.metadata.fixed_ipv4?.trim() || form.management_ip.trim()
}

function getPrimaryInterfaceSpeed(form: AssetFormState) {
	if (form.type === "internet") return getMetadataNumber(form.metadata, "down_mbps")
	if (NETWORK_ASSET_TYPES.includes(form.type)) return getMetadataNumber(form.metadata, "default_port_speed_mbps")
	return getMetadataNumber(form.metadata, "primary_nic_speed_mbps")
}
