import { Os } from "@/lib/enums"
import { formatBytes, formatTemperature, getVisualStringWidth, toFixedFloat } from "@/lib/utils"
import type { SmartDeviceRecord } from "@/types"

export const SMART_DEVICE_FIELDS = "id,system,name,model,state,capacity,temp,type,media_type,hours,cycles,updated"

export function formatCapacity(bytes: number): string {
	const { value, unit } = formatBytes(bytes)
	return `${toFixedFloat(value, value >= 10 ? 1 : 2)} ${unit}`
}

export function formatSmartTemperature(temp: number) {
	const { value, unit } = formatTemperature(temp)
	return `${value} ${unit}`
}

export function getReadableSmartDeviceName(device: SmartDeviceRecord, os?: Os) {
	const normalized = device.name?.trim()
	if (!normalized) {
		return device.model || ""
	}
	const physicalDrive = normalized.match(/physicaldrive(\d+)/i)
	if (physicalDrive) {
		return `Disk ${physicalDrive[1]}`
	}
	if (os === Os.Windows && /^\/dev\/[a-z]+$/i.test(normalized)) {
		return `Disk ${normalized.toLowerCase().charCodeAt(normalized.length - 1) - 97}`
	}
	return normalized
}

export function formatSmartDeviceSecondary(device: SmartDeviceRecord) {
	if (device.model) {
		return device.model
	}
	return formatSmartDevicePath(device.name)
}

export function formatSmartDevicePath(name?: string) {
	const normalized = name?.trim()
	if (!normalized) {
		return ""
	}
	const physicalDrive = normalized.match(/physicaldrive(\d+)/i)
	if (physicalDrive) {
		return `Disk ${physicalDrive[1]} / ${normalized}`
	}
	return normalized
}

export function formatSmartStatus(status?: string) {
	switch ((status ?? "").toUpperCase()) {
		case "PASSED":
			return "正常"
		case "FAILED":
			return "异常"
		default:
			return status || "未知"
	}
}

export function measureSmartDeviceWidths({
	devices,
	systemId,
	systemNames,
	os,
}: {
	devices: SmartDeviceRecord[] | undefined
	systemId?: string
	systemNames: Record<string, string | undefined>
	os?: Os
}) {
	const result = { longestName: 0, longestModel: 0, longestDevice: 0 }
	if (!devices || Object.keys(systemNames).length === 0) {
		return result
	}
	const seenSystems = new Set<string>()
	for (const device of devices) {
		if (!systemId && !seenSystems.has(device.system)) {
			seenSystems.add(device.system)
			const name = systemNames[device.system] ?? ""
			result.longestName = Math.max(result.longestName, getVisualStringWidth(name))
		}
		result.longestModel = Math.max(result.longestModel, getVisualStringWidth(device.model ?? ""))
		result.longestDevice = Math.max(
			result.longestDevice,
			getVisualStringWidth(getReadableSmartDeviceName(device, os)),
			getVisualStringWidth(formatSmartDeviceSecondary(device))
		)
	}
	return result
}
