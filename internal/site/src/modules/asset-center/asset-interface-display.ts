import type { AssetInterfaceKind, AssetInterfaceRecord } from "@/types"

export function isAssetInterfaceEnabled(record: AssetInterfaceRecord) {
	return record.metadata?.enabled !== false
}

export function formatAssetInterfaceKind(kind: AssetInterfaceKind) {
	switch (kind) {
		case "ethernet":
			return "有线"
		case "wifi":
			return "Wi-Fi"
		case "pon":
			return "PON"
		case "optical":
			return "光纤"
		case "wan":
			return "WAN"
		case "lan":
			return "LAN"
		case "management":
			return "管理口"
		case "virtual":
			return "虚拟接口"
		// 2026-10-04 连接管理合并：电源与外接接口
		case "power":
			return "电源口"
		case "usb":
			return "USB / 外设"
		case "video":
			return "视频输出"
		case "custom":
			return "自定义"
	}
}

export function formatAssetInterfaceSpeed(speedMbps: number) {
	if (!Number.isFinite(speedMbps) || speedMbps <= 0) return "速率未填"
	if (speedMbps >= 1000) {
		const speedGbps = speedMbps / 1000
		return `${Number.isInteger(speedGbps) ? speedGbps.toFixed(0) : speedGbps.toFixed(1)} Gbps`
	}
	return `${Math.round(speedMbps)} Mbps`
}
