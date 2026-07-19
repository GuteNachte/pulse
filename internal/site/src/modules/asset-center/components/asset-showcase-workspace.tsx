import { useMemo } from "react"
import type { AssetInterfaceRecord, AssetRecord, AssetRelationRecord } from "@/types"
import { buildAssetParameterGroups } from "../asset-detail-parameter-groups"
import { getMetadataString } from "../asset-schema"
import { getInternetStatusLabel } from "../asset-type-specs"
import { getInternetAddressAutoRefreshSettings } from "../asset-internet-address-status"
import { getAssetDetailRelationRows } from "../asset-detail-relations"
import { AssetHardwareSpecsColumn, AssetOverviewColumn, type AssetParameterRow } from "./asset-parameter-columns"
import {
	InternetAddressAutoRefreshControls,
	type InternetAddressAutoRefreshSettings,
} from "./internet-address-auto-refresh-controls"
import { AssetMediaShowcase, type AssetMediaShowcaseItem } from "./asset-media-showcase"
import { AssetParameterNavigator } from "./asset-parameter-navigator"

export function AssetShowcaseWorkspace({
	asset,
	media,
	assets = [],
	interfaces = [],
	relations = [],
	readOnly = false,
	internetAddressRefreshing = false,
	onRefreshInternetAddresses,
	onUpdateInternetAddressSettings,
}: {
	asset: AssetRecord
	media?: { covers: AssetMediaShowcaseItem[] }
	assets?: AssetRecord[]
	interfaces?: AssetInterfaceRecord[]
	relations?: AssetRelationRecord[]
	readOnly?: boolean
	internetAddressRefreshing?: boolean
	onRefreshInternetAddresses?: () => void
	onUpdateInternetAddressSettings?: (settings: InternetAddressAutoRefreshSettings) => void
}) {
	const parameterGroups = useMemo(() => buildAssetParameterGroups(asset), [asset])
	const identitySections = useMemo(
		() => buildAssetIdentitySections(asset, assets, interfaces, relations),
		[asset, assets, interfaces, relations]
	)
	const internetAddressSettings = getInternetAddressAutoRefreshSettings(asset.metadata ?? {})
	const internetAddressGroupActions =
		asset.type === "internet" && onRefreshInternetAddresses && onUpdateInternetAddressSettings
			? {
					动态公网地址: (
						<InternetAddressAutoRefreshControls
							settings={internetAddressSettings}
							disabled={readOnly || internetAddressRefreshing}
							refreshing={internetAddressRefreshing}
							onChange={onUpdateInternetAddressSettings}
							onRefresh={onRefreshInternetAddresses}
						/>
					),
				}
			: undefined

	return (
		<section className="grid items-start gap-5 xl:grid-cols-[minmax(22rem,0.78fr)_minmax(0,1.62fr)] 2xl:grid-cols-[minmax(24rem,0.72fr)_minmax(0,1.68fr)]">
			<aside className="grid content-start gap-5 xl:sticky xl:top-4">
				<AssetMediaShowcase covers={media?.covers ?? []} />
				<AssetOverviewColumn
					sections={identitySections}
					title={asset.type === "internet" ? "线路档案" : "设备档案"}
					subtitle={asset.type === "internet" ? null : "主档与接入信息"}
				/>
				<AssetParameterNavigator groups={parameterGroups} variant="sidebar" className="hidden xl:block" />
			</aside>
			<AssetHardwareSpecsColumn
				groups={parameterGroups}
				groupActions={internetAddressGroupActions}
				title={asset.type === "internet" ? "线路参数" : "硬件档案"}
				description={asset.type === "internet" ? "已确认的线路与套餐参数" : undefined}
				emptyLabel={asset.type === "internet" ? "暂无已确认的线路参数。" : "暂无已确认的硬件参数。"}
			/>
		</section>
	)
}

function buildAssetIdentitySections(
	asset: AssetRecord,
	assets: AssetRecord[],
	interfaces: AssetInterfaceRecord[],
	relations: AssetRelationRecord[]
): { title: string; rows: AssetParameterRow[] }[] {
	const metadata = asset.metadata ?? {}
	const textRow = (label: string, value: string | undefined): AssetParameterRow | undefined =>
		value ? { label, value } : undefined
	const linkRow = (label: string, value: string | undefined): AssetParameterRow | undefined =>
		value ? { label, value, href: /^https?:\/\//i.test(value) ? value : undefined } : undefined
	const compact = (rows: (AssetParameterRow | undefined)[]) => rows.filter((row) => row?.value) as AssetParameterRow[]
	if (asset.type === "internet") {
		const uplink = relations.find(
			(relation) =>
				relation.source_asset === asset.id &&
				relation.kind === "connected_to" &&
				getMetadataString(relation.metadata, "link_kind") === "internet"
		)
		const expandedTarget = uplink?.expand?.target_asset as AssetRecord | undefined
		const target = assets.find((item) => item.id === uplink?.target_asset) ?? expandedTarget
		const targetInterface = interfaces.find(
			(item) => item.id === getMetadataString(uplink?.metadata, "target_interface")
		)
		const relationLabel = target ? [target.name, targetInterface?.name].filter(Boolean).join(" · ") : "待关联接入设备"
		return [
			{
				title: "基础资料",
				rows: compact([
					textRow("编号", getMetadataString(metadata, "asset_tag")),
					textRow("运营商", asset.vendor),
					textRow("状态", getInternetStatusLabel(asset.status || "active")),
				]),
			},
			{
				title: "接入关系",
				rows: [{ label: "当前接入", value: relationLabel }],
			},
		]
	}
	return [
		{
			title: "身份",
			rows: compact([
				textRow("编号", getMetadataString(metadata, "asset_tag")),
				textRow("厂商", asset.vendor),
				textRow("型号", asset.model),
				...(asset.type === "phone" ? [textRow("内部型号", getMetadataString(metadata, "internal_model"))] : []),
				textRow("序列号", asset.serial_number),
			]),
		},
		{
			title: "网络",
			rows: compact([
				{ label: "IPv4", value: firstNonEmpty(getMetadataString(metadata, "fixed_ipv4"), asset.management_ip) },
				{ label: "IPv6", value: getMetadataString(metadata, "fixed_ipv6") },
				{ label: "MAC", value: getMetadataString(metadata, "mac") },
				linkRow("管理页面", getMetadataString(metadata, "management_url")),
			]),
		},
		{
			title: "资料",
			rows: compact([linkRow("官方网站", getMetadataString(metadata, "official_url"))]),
		},
		...(asset.type === "ont"
			? [
					{
						title: "接入关系",
						rows: getAssetDetailRelationRows(asset.id, assets, interfaces, relations),
					},
				]
			: []),
	].filter((section) => section.rows.length > 0)
}

function firstNonEmpty(...values: (string | undefined)[]) {
	return values.find((value) => value?.trim())?.trim() ?? ""
}
