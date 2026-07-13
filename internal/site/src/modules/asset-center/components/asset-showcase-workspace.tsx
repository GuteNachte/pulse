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
		<section className="grid items-start gap-5 xl:h-full xl:min-h-0 xl:grid-cols-[minmax(20rem,0.8fr)_minmax(0,1.7fr)] 2xl:grid-cols-[minmax(22rem,0.72fr)_minmax(0,1.78fr)]">
			<aside className="grid content-start gap-5 xl:min-h-0">
				<AssetVisualCard visuals={visuals} />
				<AssetOverviewColumn sections={identitySections} />
			</aside>
			<AssetHardwareSpecsColumn groups={parameterGroups} />
		</section>
	)
}

function buildAssetIdentitySections(asset: AssetRecord): { title: string; rows: AssetParameterRow[] }[] {
	const metadata = asset.metadata ?? {}
	const textRow = (label: string, value: string | undefined): AssetParameterRow | undefined =>
		value ? { label, value } : undefined
	const linkRow = (label: string, value: string | undefined): AssetParameterRow | undefined =>
		value ? { label, value, href: /^https?:\/\//i.test(value) ? value : undefined } : undefined
	const compact = (rows: (AssetParameterRow | undefined)[]) => rows.filter((row) => row?.value) as AssetParameterRow[]
	return [
		{
			title: "身份",
			rows: compact([
				textRow("编号", getMetadataString(metadata, "asset_tag")),
				textRow("厂商", asset.vendor),
				textRow("型号", asset.model),
				textRow("内部型号", getMetadataString(metadata, "internal_model")),
				textRow("序列号", asset.serial_number),
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
