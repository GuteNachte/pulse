import { useMemo } from "react"
import type { AssetRecord, AssetVisualRecord } from "@/types"
import { buildAssetParameterGroups } from "../asset-detail-parameter-groups"
import { getMetadataString } from "../asset-schema"
import { AssetHardwareSpecsColumn, AssetOverviewColumn, type AssetParameterRow } from "./asset-parameter-columns"
import { AssetVisualCard } from "./asset-visual-card"

export function AssetShowcaseWorkspace({ asset, visuals }: { asset: AssetRecord; visuals: AssetVisualRecord[] }) {
	const parameterGroups = useMemo(() => buildAssetParameterGroups(asset), [asset])
	const identitySections = useMemo(() => buildAssetIdentitySections(asset), [asset])

	return (
		<section className="grid gap-3 xl:grid-cols-[minmax(0,3fr)_minmax(0,4fr)_minmax(0,3fr)] xl:items-start">
			<AssetVisualCard visuals={visuals} />
			<AssetOverviewColumn sections={identitySections} />
			<AssetHardwareSpecsColumn groups={parameterGroups} />
		</section>
	)
}

function buildAssetIdentitySections(asset: AssetRecord): { title: string; rows: AssetParameterRow[] }[] {
	const metadata = asset.metadata ?? {}
	const linkRow = (label: string, value: string): AssetParameterRow | undefined =>
		value ? { label, value, href: /^https?:\/\//i.test(value) ? value : undefined } : undefined
	const compact = (rows: (AssetParameterRow | undefined)[]) => rows.filter((row) => row?.value) as AssetParameterRow[]
	return [
		{
			title: "身份",
			rows: compact([
				{ label: "编号", value: getMetadataString(metadata, "asset_tag") },
				{ label: "厂商", value: asset.vendor },
				{ label: "型号", value: asset.model },
				{ label: "内部型号", value: getMetadataString(metadata, "internal_model") },
				{ label: "序列号", value: asset.serial_number },
			]),
		},
		{
			title: "网络",
			rows: compact([
				{ label: "IPv4", value: firstNonEmpty(getMetadataString(metadata, "fixed_ipv4"), asset.management_ip) },
				{ label: "IPv6", value: getMetadataString(metadata, "fixed_ipv6") },
				{ label: "MAC", value: getMetadataString(metadata, "mac") },
				linkRow("管理 URL", getMetadataString(metadata, "management_url")),
			]),
		},
		{
			title: "资料",
			rows: compact([
				linkRow("支持页", getMetadataString(metadata, "support_url")),
				linkRow("产品页", getMetadataString(metadata, "product_url")),
				linkRow("资料页", getMetadataString(metadata, "official_url")),
			]),
		},
	].filter((section) => section.rows.length > 0)
}

function firstNonEmpty(...values: (string | undefined)[]) {
	return values.find((value) => value?.trim())?.trim() ?? ""
}
