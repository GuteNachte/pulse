import { CableIcon } from "lucide-react"
import { useMemo } from "react"
import type { AssetInterfaceRecord, AssetRecord, AssetRelationRecord } from "@/types"
import { buildAssetParameterGroups } from "../asset-detail-parameter-groups"
import { getMetadataString } from "../asset-schema"
import { getInternetStatusLabel } from "../asset-type-specs"
import { getInternetAddressAutoRefreshSettings } from "../asset-internet-address-status"
import { getAssetDetailRelationRows } from "../asset-detail-relations"
import { buildNetworkDeviceDetailModel, isNetworkDetailParameterGroup } from "../asset-network-detail-model"
import {
	AssetHardwareSpecsColumn,
	AssetOverviewColumn,
	type AssetParameterGroup,
	type AssetParameterRow,
} from "./asset-parameter-columns"
import {
	InternetAddressAutoRefreshControls,
	type InternetAddressAutoRefreshSettings,
} from "./internet-address-auto-refresh-controls"
import { AssetMediaShowcase, type AssetMediaShowcaseItem } from "./asset-media-showcase"
import { AssetNetworkDetailTable } from "./asset-network-detail-table"

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
	const networkDetailModel = useMemo(
		() => buildNetworkDeviceDetailModel(asset, assets, interfaces, relations),
		[asset, assets, interfaces, relations]
	)
	const parameterGroups = useMemo(() => {
		const groups = buildAssetParameterGroups(asset, { interfaces, assets, relations })
		if (networkDetailModel) {
			return groups.filter((group) => !isNetworkDetailParameterGroup(asset.type, group.id))
		}
		const relationGroup = buildAssetRelationParameterGroup(asset, assets, interfaces, relations)
		if (!relationGroup) return groups
		const anchorTitle = asset.type === "internet" ? "线路参数" : "网络"
		const anchorIndex = groups.findIndex((group) => group.title === anchorTitle)
		const insertAt = anchorIndex >= 0 ? anchorIndex + 1 : groups.length
		return [...groups.slice(0, insertAt), relationGroup, ...groups.slice(insertAt)]
	}, [asset, assets, interfaces, networkDetailModel, relations])
	const identitySections = useMemo(() => buildAssetIdentitySections(asset), [asset])
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
		<section className="grid items-start pulse-card-gap xl:grid-cols-[minmax(23rem,0.78fr)_minmax(0,1.62fr)] 2xl:grid-cols-[minmax(25rem,0.72fr)_minmax(0,1.68fr)]">
			<aside className="grid content-start pulse-card-gap xl:sticky xl:top-4">
				<AssetMediaShowcase covers={media?.covers ?? []} />
				<AssetOverviewColumn
					sections={identitySections}
					title={asset.type === "internet" ? "线路档案" : "设备档案"}
					subtitle={asset.type === "internet" ? null : "主档与接入信息"}
				/>
			</aside>
			<div className="grid min-w-0 content-start pulse-card-gap">
				{networkDetailModel ? <AssetNetworkDetailTable model={networkDetailModel} /> : null}
				{parameterGroups.length > 0 || !networkDetailModel ? (
					<AssetHardwareSpecsColumn
						groups={parameterGroups}
						groupActions={internetAddressGroupActions}
						title={asset.type === "internet" ? "线路参数" : "硬件档案"}
						description={asset.type === "internet" ? "已确认的线路与套餐参数" : undefined}
						emptyLabel={asset.type === "internet" ? "暂无已确认的线路参数。" : "暂无已确认的硬件参数。"}
					/>
				) : null}
			</div>
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
	if (asset.type === "internet") {
		return [
			{
				title: "基础资料",
				rows: compact([
					textRow("编号", getMetadataString(metadata, "asset_tag")),
					textRow("运营商", asset.vendor),
					textRow("状态", getInternetStatusLabel(asset.status || "active")),
				]),
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
				{ label: "MAC", value: getMetadataString(metadata, "mac") },
				linkRow("管理页面", getMetadataString(metadata, "management_url")),
			]),
		},
		{
			title: "资料",
			rows: compact([linkRow("官方网站", getMetadataString(metadata, "official_url"))]),
		},
	].filter((section) => section.rows.length > 0)
}

function buildAssetRelationParameterGroup(
	asset: AssetRecord,
	assets: AssetRecord[],
	interfaces: AssetInterfaceRecord[],
	relations: AssetRelationRecord[]
): AssetParameterGroup | undefined {
	const relationRows = getAssetDetailRelationRows(asset.id, assets, interfaces, relations)
	const rows =
		asset.type === "internet" && relationRows.length === 0
			? [{ label: "当前接入", value: "待关联接入设备" }]
			: relationRows
	if (rows.length === 0) return undefined
	return {
		id: "asset-relations",
		title: "接入关系",
		summary: `${rows.length} 条关系`,
		icon: <CableIcon className="size-4" />,
		rows,
	}
}

function firstNonEmpty(...values: (string | undefined)[]) {
	return values.find((value) => value?.trim())?.trim() ?? ""
}
