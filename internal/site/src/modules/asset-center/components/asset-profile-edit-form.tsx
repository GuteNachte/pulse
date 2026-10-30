import { useEffect, useMemo, useState, type FormEvent } from "react"
import { BoxIcon, InfoIcon, MapPinIcon, NetworkIcon, ReceiptTextIcon } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { AssetLocationRecord, AssetRecord } from "@/types"
import { AssetCandidateTextField } from "./asset-edit-profile-fields"
import { SelectField } from "./asset-detail-form-fields"
import { AssetLocationInput, AssetTagInput } from "./asset-form-fields"
import {
	buildAssetTagCandidates,
	loadAssetNumberingSettings,
	normalizeAssetNumberingSettings,
} from "../asset-numbering"
import { buildAssetLocationOptions } from "../asset-list"
import { isAssetLocationNotApplicable } from "../asset-location"
import { getEditableAssetTypeOptions, isServiceAssetType } from "../asset-profiles"
import { getAssetTypeSpec, internetAssetTypeSpec } from "../asset-type-specs"
import { getAssetFormSections } from "../asset-schema"
import { getInternetAddressAutoRefreshSettings } from "../asset-internet-address-status"
import { getMetadataString, STATUS_OPTIONS } from "../asset-schema"

// 2026-10-20 用户拍板：编辑基本信息弹窗与详情页「基本信息」卡完全同构——
// 同样的 5 组 20 字段（基础信息/品牌与型号/位置与归属/网络与状态/采购与保修），不加任何其他参数；
// 宽带公网 IPv4 是唯一例外：只读展示自动检测结果，不提交。
// 装机方式、宽带线路参数、ONT 运营商字段等归各自的编辑窗口（编辑页/参数组弹窗）。

export const ASSET_PROFILE_EDIT_FORM_ID = "asset-profile-edit-form"

type BasicInfoGroup = { icon: LucideIcon; title: string }

const FORM_GROUPS: BasicInfoGroup[] = [
	{ icon: InfoIcon, title: "基础信息" },
	{ icon: BoxIcon, title: "品牌与型号" },
	{ icon: MapPinIcon, title: "位置与归属" },
	{ icon: NetworkIcon, title: "网络与状态" },
	{ icon: ReceiptTextIcon, title: "采购与保修" },
]

// 2026-10-20 用户拍板：服务类资产只保留与其他资产共有的公共字段，组名随字段收敛；
// 型号/序列号/位置/固定 IP/MAC/保修不在服务类基本信息中出现，服务专属数据归右侧参数分组；
// 宽带例外：显示型号（运营商写入 assets.model）和自动获取的只读公网 IPv4。
const SERVICE_FORM_GROUPS: BasicInfoGroup[] = [
	{ icon: InfoIcon, title: "基础信息" },
	{ icon: BoxIcon, title: "品牌与官网" },
	{ icon: MapPinIcon, title: "归属与用途" },
	{ icon: NetworkIcon, title: "网络与状态" },
]

// 宽带基本信息展示型号，组名随字段改为「品牌与型号」。
const INTERNET_FORM_GROUPS: BasicInfoGroup[] = SERVICE_FORM_GROUPS.map((group, index) =>
	index === 1 ? { ...group, title: "品牌与型号" } : group
)

function FormGroup({ group, children }: { group: BasicInfoGroup; children: React.ReactNode }) {
	return (
		<section className="grid gap-2 border-b border-border/40 pb-2.5 last:border-b-0 last:pb-0">
			<div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
				<group.icon className="size-3" />
				{group.title}
			</div>
			{/* 2026-10-20 用户拍板：编辑排版跟实际显示走——基本信息卡组内两列，弹窗同样两列 */}
			<div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">{children}</div>
		</section>
	)
}

export function AssetProfileEditForm({
	asset,
	assets,
	locations,
	readOnly,
	onSaveProfile,
}: {
	asset: AssetRecord
	assets: AssetRecord[]
	locations: AssetLocationRecord[]
	readOnly: boolean
	onSaveProfile: (event: FormEvent<HTMLFormElement>, extraMetadata: Record<string, string>) => void
}) {
	const metadata = asset.metadata ?? {}
	const [selectedType, setSelectedType] = useState<AssetRecord["type"]>(asset.type)
	// 参数行编辑：schema 之外的自由参数（其他参数），随表单一起提交
	const [extraParams, setExtraParams] = useState<Record<string, string>>({})
	const [extraParamsAssetId, setExtraParamsAssetId] = useState(asset.id)
	const [nameValue, setNameValue] = useState(asset.name || "")
	const [statusValue, setStatusValue] = useState(asset.status || "active")
	const [locationValue, setLocationValue] = useState(asset.location || "")
	const [assetTagValue, setAssetTagValue] = useState(getMetadataString(metadata, "asset_tag"))
	const [internetAddressSettingsDraft, setInternetAddressSettingsDraft] = useState(
		getInternetAddressAutoRefreshSettings(metadata)
	)
	const [fixedIpv4Value, setFixedIpv4Value] = useState(
		getMetadataString(metadata, "fixed_ipv4") || asset.management_ip || ""
	)
	useEffect(() => {
		setSelectedType(asset.type)
		setNameValue(asset.name || "")
		setStatusValue(asset.status || "active")
		setLocationValue(asset.location || "")
		setAssetTagValue(getMetadataString(asset.metadata, "asset_tag"))
		setFixedIpv4Value(getMetadataString(asset.metadata, "fixed_ipv4") || asset.management_ip || "")
		setInternetAddressSettingsDraft(getInternetAddressAutoRefreshSettings(asset.metadata ?? {}))
		if (asset.id !== extraParamsAssetId) {
			setExtraParamsAssetId(asset.id)
			const covered = buildProfileCoveredKeys(asset.type)
			const extra: Record<string, string> = {}
			for (const [key, value] of Object.entries(asset.metadata ?? {})) {
				if (covered.has(key) || key === "asset_tag") continue
				const text = typeof value === "string" || typeof value === "number" ? String(value) : ""
				if (text.trim()) extra[key] = text
			}
			setExtraParams(extra)
		}
	}, [asset.id, asset.location, asset.metadata, asset.name, asset.status, asset.type, extraParamsAssetId])
	const locationOptions = useMemo(
		() => buildAssetLocationOptions(assets, locations, { includePresets: true }).values,
		[assets, locations]
	)
	const numberingSettings = useMemo(() => normalizeAssetNumberingSettings(loadAssetNumberingSettings()), [])
	const assetTagCandidates = useMemo(
		() => buildAssetTagCandidates(assets, numberingSettings, selectedType),
		[assets, numberingSettings, selectedType]
	)
	const isInternetResource = selectedType === "internet"
	const isInternetService = selectedType === "web_endpoint"
	const locationNotApplicable = isAssetLocationNotApplicable(selectedType)
	const selectedTypeSpec = getAssetTypeSpec(selectedType)
	// 2026-10-20 用户报「资产状态点开没有选项」：互联网/ONT/交换机之外的类型没有专属规格，
	// 状态下拉回退到标准四档（在用/规划/停用/退役），不再渲染空下拉。
	const statusOptions = selectedTypeSpec ? [...selectedTypeSpec.statusOptions] : [...STATUS_OPTIONS]
	const serviceAsset = isServiceAssetType(selectedType)
	const formGroups = serviceAsset ? (isInternetResource ? INTERNET_FORM_GROUPS : SERVICE_FORM_GROUPS) : FORM_GROUPS

	return (
		<fieldset disabled={readOnly} className="contents">
			<form
				id={ASSET_PROFILE_EDIT_FORM_ID}
				onSubmit={(event) => onSaveProfile(event, extraParams)}
				className="grid content-start gap-2.5 [&_input]:h-8 [&_input]:px-2 [&_select]:h-8 [&_select]:px-2 [&_button[role=combobox]]:h-8 [&_button[role=combobox]]:px-2"
			>
				{/* 宽带公网地址自动更新设置不在本弹窗展示，隐藏提交保持现值不变 */}
				<input
					type="hidden"
					name="public_ip_auto_refresh"
					value={internetAddressSettingsDraft.enabled ? "yes" : "no"}
				/>
				<input
					type="hidden"
					name="public_ip_refresh_interval_minutes"
					value={internetAddressSettingsDraft.intervalMinutes}
				/>

				<FormGroup group={formGroups[0]}>
					<AssetCandidateTextField name="name" label="资产名称" value={nameValue} onChange={setNameValue} />
					<AssetTagInput
						id="asset-profile-edit-asset-tag"
						name="asset_tag"
						label="资产编号"
						value={assetTagValue}
						onChange={setAssetTagValue}
						assetTagCandidates={assetTagCandidates}
					/>
					{isInternetResource ? (
						<input type="hidden" name="type" value={selectedType} />
					) : (
						<SelectField
							name="type"
							label="资产类型"
							options={getEditableAssetTypeOptions(selectedType).map((item) => ({
								value: item.type,
								label: item.label,
							}))}
							value={selectedType}
							onChange={(value) => setSelectedType(value as AssetRecord["type"])}
						/>
					)}
					<div className="grid gap-2">
						<Label htmlFor="profile-edit-notes">备注</Label>
						<Textarea
							id="profile-edit-notes"
							name="notes"
							defaultValue={asset.notes ?? ""}
							placeholder="其他补充说明"
							className="min-h-14 text-sm"
						/>
					</div>
				</FormGroup>

				<FormGroup group={formGroups[1]}>
					{isInternetResource ? (
						<SelectField
							name="vendor"
							label="品牌（运营商）"
							options={[...internetAssetTypeSpec.providerOptions]}
							defaultValue={asset.vendor}
						/>
					) : (
						<div className="grid gap-2">
							<Label htmlFor="profile-edit-vendor">品牌</Label>
							<Input
								id="profile-edit-vendor"
								name="vendor"
								defaultValue={asset.vendor ?? ""}
								placeholder="例如 铭凡 / 绿联"
							/>
						</div>
					)}
					{!serviceAsset || isInternetResource ? (
						<>
							<div className="grid gap-2">
								<Label htmlFor="profile-edit-model">型号</Label>
								<Input
									id="profile-edit-model"
									name="model"
									defaultValue={asset.model ?? ""}
									placeholder={isInternetResource ? "例如 中国联通 / 中国电信" : "例如 UM690 / CM754"}
								/>
							</div>
							{!serviceAsset ? (
								<div className="grid gap-2">
									<Label htmlFor="profile-edit-serial">序列号/SN</Label>
									<Input
										id="profile-edit-serial"
										name="serial_number"
										defaultValue={asset.serial_number ?? ""}
										placeholder="出厂序列号，可选"
									/>
								</div>
							) : null}
						</>
					) : null}
					<div className="grid gap-2">
						<Label htmlFor="profile-edit-official-url">官方网站</Label>
						<Input
							id="profile-edit-official-url"
							name="official_url"
							type="url"
							defaultValue={getMetadataString(metadata, "official_url")}
							placeholder="https://"
						/>
					</div>
				</FormGroup>

				<FormGroup group={formGroups[2]}>
					{locationNotApplicable || serviceAsset ? (
						<input type="hidden" name="location" value={locationValue} />
					) : (
						<div className="grid gap-2 sm:col-span-2">
							<Label>位置（大类 / 房间）</Label>
							<AssetLocationInput
								idPrefix="asset-detail-edit-location"
								value={locationValue}
								locationOptions={locationOptions}
								onChange={setLocationValue}
								allowNone={locationNotApplicable}
							/>
							<input type="hidden" name="location" value={locationValue} />
						</div>
					)}
					<div className="grid gap-2">
						<Label htmlFor="profile-edit-owner">所属人</Label>
						<Input
							id="profile-edit-owner"
							name="owner"
							defaultValue={getMetadataString(metadata, "owner")}
							placeholder="谁在使用，例如 我 / 家人"
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="profile-edit-role">用途/角色</Label>
						<Input
							id="profile-edit-role"
							name="role"
							defaultValue={asset.role ?? ""}
							placeholder="例如 主路由 / 备份 NAS"
						/>
					</div>
				</FormGroup>

				<FormGroup group={formGroups[3]}>
					{isInternetResource ? (
						<div className="grid gap-2">
							<Label htmlFor="profile-edit-public-ip">IP 地址（自动获取）</Label>
							<Input
								id="profile-edit-public-ip"
								value={getMetadataString(metadata, "public_ipv4") || "尚未获取"}
								readOnly
								aria-readonly="true"
								className="bg-muted/30 font-mono tabular-nums"
							/>
						</div>
					) : null}
					{/* 2026-10-20 用户拍板：服务类资产不是实物，没有固定 IPv4——不在服务类基本信息弹窗展示/提交固定 IP；
					    宽带的公网地址继续由详情页「动态公网地址」卡片自动更新 */}
					{!serviceAsset ? (
						<div className="grid gap-2">
							<Label htmlFor="fixed_ipv4">IP 地址</Label>
							<Input
								id="fixed_ipv4"
								name="fixed_ipv4"
								value={fixedIpv4Value}
								placeholder="192.168.1.90"
								onChange={(event) => setFixedIpv4Value(event.target.value)}
							/>
						</div>
					) : null}
					{!serviceAsset ? (
						<div className="grid gap-2">
							<Label htmlFor="profile-edit-mac">MAC 地址</Label>
							<Input
								id="profile-edit-mac"
								name="mac"
								defaultValue={getMetadataString(metadata, "mac")}
								placeholder="AA:BB:CC:DD:EE:FF"
							/>
						</div>
					) : null}
					<div className="grid gap-2">
						<Label htmlFor="profile-edit-network">所属网段</Label>
						<select
							id="profile-edit-network"
							name="network_domain"
							defaultValue={getMetadataString(metadata, "network_domain")}
							className="h-8 w-full rounded-md border border-input bg-card px-2 text-sm"
						>
							<option value="">未设置</option>
							<option value="家庭网">家庭网</option>
							<option value="科技网">科技网</option>
							<option value="IoT网">IoT网</option>
						</select>
					</div>
					<SelectField
						name="status"
						label="资产状态"
						options={statusOptions}
						value={statusValue}
						onChange={(value) => setStatusValue(value as NonNullable<AssetRecord["status"]>)}
					/>
				</FormGroup>

				{/* 2026-10-20 用户拍板：服务类基本信息的采购信息整组去掉；宽带订阅周期改为右侧专属分组 */}
				{!serviceAsset ? (
					<FormGroup group={FORM_GROUPS[4]}>
						<div className="grid gap-2">
							<Label htmlFor="profile-edit-purchase-date">购入日期</Label>
							<Input
								id="profile-edit-purchase-date"
								name="purchase_date"
								type="date"
								defaultValue={getMetadataString(metadata, "purchase_date")}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="profile-edit-install-date">启用日期</Label>
							<Input
								id="profile-edit-install-date"
								name="install_date"
								type="date"
								defaultValue={getMetadataString(metadata, "install_date")}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="profile-edit-warranty">保修到期</Label>
							<Input
								id="profile-edit-warranty"
								name="warranty_until"
								type="date"
								defaultValue={getMetadataString(metadata, "warranty_until")}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="profile-edit-price">购入价格（元）</Label>
							<Input
								id="profile-edit-price"
								name="purchase_price_cny"
								type="number"
								min="0"
								defaultValue={getMetadataString(metadata, "purchase_price_cny")}
								placeholder="例如 2999"
							/>
						</div>
					</FormGroup>
				) : null}

				{!isInternetService ? (
					<input
						type="hidden"
						name="management_ip"
						value={serviceAsset ? (asset.management_ip ?? "") : fixedIpv4Value}
					/>
				) : null}
			</form>
		</fieldset>
	)
}

// schema 字段已覆盖的 metadata 键（这些键不进自由参数行）
function buildProfileCoveredKeys(type: AssetRecord["type"]) {
	const covered = new Set<string>(["color", "device_color", "colors_available", "official_colors", "build_mode"])
	for (const section of getAssetFormSections(type)) {
		for (const field of section.fields) {
			if (field.source === "metadata") covered.add(field.key)
		}
	}
	return covered
}
