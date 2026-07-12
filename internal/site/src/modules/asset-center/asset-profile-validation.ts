import type { AssetRecord } from "../../types"
import { getAssetTypeLabel, getMetadataNumber, getMetadataString, isPhoneVariantSpecRequired } from "./asset-schema.ts"

export type AssetRecognitionRequirement = {
	label: string
	value: string
	ok: boolean
}

export function getAssetRecognitionRequirements(asset: AssetRecord): AssetRecognitionRequirement[] {
	const metadata = asset.metadata ?? {}
	if (asset.type === "internet") {
		const downMbps = getMetadataNumber(metadata, "down_mbps")
		const upMbps = getMetadataNumber(metadata, "up_mbps")
		return [
			{ label: "运营商", value: asset.vendor || "", ok: Boolean(asset.vendor?.trim()) },
			{ label: "下行带宽", value: downMbps ? `${downMbps} Mbps` : "", ok: Boolean(downMbps) },
			{ label: "上行带宽", value: upMbps ? `${upMbps} Mbps` : "", ok: Boolean(upMbps) },
		]
	}
	const fixedIpv4 = firstNonEmpty(asset.management_ip, getMetadataString(metadata, "fixed_ipv4"))
	const requirements: AssetRecognitionRequirement[] = [
		{ label: "IPv4", value: fixedIpv4, ok: Boolean(fixedIpv4) },
		{ label: "厂商 / 品牌", value: asset.vendor || "", ok: Boolean(asset.vendor?.trim()) },
		{ label: "型号 / 规格", value: asset.model || "", ok: Boolean(asset.model?.trim()) },
		{
			label: "内部型号 / 搜索代码",
			value: getMetadataString(metadata, "internal_model"),
			ok: Boolean(getMetadataString(metadata, "internal_model")),
		},
		{
			label: "资产编号",
			value: getMetadataString(metadata, "asset_tag"),
			ok: Boolean(getMetadataString(metadata, "asset_tag")),
		},
		{ label: "所属类型", value: getAssetTypeLabel(asset.type), ok: Boolean(asset.type) },
		{ label: "位置", value: asset.location || "", ok: Boolean(asset.location?.trim()) },
	]
	if (isPhoneVariantSpecRequired(asset.type)) {
		const memoryGb = getMetadataNumber(metadata, "memory_gb")
		const storageGb = getMetadataNumber(metadata, "storage_gb")
		requirements.push(
			{ label: "运行内存", value: memoryGb ? `${memoryGb} GB` : "", ok: Boolean(memoryGb) },
			{ label: "存储容量", value: storageGb ? `${storageGb} GB` : "", ok: Boolean(storageGb) }
		)
	}
	return requirements
}

export function validateAssetProfileForm(values: {
	type: AssetRecord["type"]
	name: string
	vendor: string
	model: string
	internalModel: string
	color: string
	assetTag: string
	location: string
	ipv4: string
	memoryGb: string
	storageGb: string
	downMbps?: string
	upMbps?: string
}) {
	const errors: string[] = []
	if (values.type === "internet") {
		if (!values.vendor.trim()) errors.push("运营商")
		if (!isPositiveNumberString(values.downMbps)) errors.push("下行带宽")
		if (!isPositiveNumberString(values.upMbps)) errors.push("上行带宽")
		return errors
	}
	if (!values.name.trim()) errors.push("资产名称")
	if (!values.ipv4.trim()) {
		errors.push("IPv4")
	} else if (!isValidAssetIpv4(values.ipv4)) {
		errors.push("IPv4 格式不正确")
	}
	if (!values.vendor.trim()) errors.push("厂商 / 品牌")
	if (!values.model.trim()) errors.push("型号 / 规格")
	if (!values.internalModel.trim()) errors.push("内部型号 / 搜索代码")
	if (!values.assetTag.trim()) errors.push("资产编号")
	if (!values.location.trim()) errors.push("位置")
	if (isPhoneVariantSpecRequired(values.type)) {
		if (!isPositiveNumberString(values.memoryGb)) errors.push("运行内存")
		if (!isPositiveNumberString(values.storageGb)) errors.push("存储容量")
	}
	return errors
}

function firstNonEmpty(...values: (string | undefined)[]) {
	return values.find((value) => value?.trim())?.trim() ?? ""
}

function isPositiveNumberString(value: string | undefined) {
	if (!value?.trim()) return false
	const number = Number(value)
	return Number.isFinite(number) && number > 0
}

function isValidAssetIpv4(value: string) {
	const parts = value.trim().split(".")
	return (
		parts.length === 4 &&
		parts.every((part) => {
			if (!/^\d{1,3}$/.test(part)) return false
			if (part.length > 1 && part.startsWith("0")) return false
			const number = Number(part)
			return Number.isInteger(number) && number >= 0 && number <= 255
		})
	)
}
