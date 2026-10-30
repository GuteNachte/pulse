import { useEffect, useState, type FormEvent } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { AssetRecord } from "@/types"
import { getMetadataString } from "../asset-schema"

export const ASSET_HARDWARE_IDENTITY_EDIT_FORM_ID = "asset-hardware-identity-edit-form"

// 2026-10-17 用户拍板：品牌改为单字段——直接填「铭凡 (Minisforum)」这种中英文合并写法，
// 不再拆中英文双框；旧数据仍可能分存 vendor_cn + vendor，打开时合并显示为「铭凡 (MINISFORUM)」，
// 保存时清掉旧的 vendor_cn（见编辑页 saveHardwareIdentity），之后就是单字段口径
function mergeVendorDisplay(vendor: string, vendorCn: string): string {
	const english = vendor.trim()
	const chinese = vendorCn.trim()
	if (chinese && english) return `${chinese} (${english})`
	return chinese || english
}

// 2026-10-17 用户拍板：内部型号不再单列——直接写在型号后面的括号里（如 UM690 (M2S)）；
// 旧数据仍可能分存 metadata.internal_model，打开时合并进型号显示，保存时归一为单字段
function mergeModelDisplay(model: string, internalModel: string): string {
	const base = model.trim()
	const internal = internalModel.trim()
	if (internal && base) return `${base} (${internal})`
	return base || internal
}

// 2026-10-10 详情页大布局：设备档案编辑——只管设备本体的硬件身份
// （型号 / 品牌 / 官网）；通用信息（名称/编号/类型/状态/位置/用途/IP）在通用档案弹窗维护。
export function AssetHardwareIdentityEditForm({
	asset,
	readOnly,
	saving,
	onSave,
}: {
	asset: AssetRecord
	readOnly: boolean
	saving: boolean
	onSave: (event: FormEvent<HTMLFormElement>) => void
}) {
	const metadata = asset.metadata ?? {}
	const [modelValue, setModelValue] = useState(
		mergeModelDisplay(asset.model || "", getMetadataString(metadata, "internal_model"))
	)
	const [vendorValue, setVendorValue] = useState(
		mergeVendorDisplay(asset.vendor || "", getMetadataString(metadata, "vendor_cn"))
	)
	const [officialUrlValue, setOfficialUrlValue] = useState(getMetadataString(metadata, "official_url"))
	// 2026-10-12 用户拍板：上市日期从外观参数组移到设备档案（展示在档案卡，这里编辑）
	const [releaseDateValue, setReleaseDateValue] = useState(getMetadataString(metadata, "release_date"))
	// 2026-10-17 用户拍板：基本信息增加「产品定位」（如迷你主机 / 工作站 / 家用 NAS），存 metadata 自由键
	const [productPositioningValue, setProductPositioningValue] = useState(
		getMetadataString(metadata, "product_positioning")
	)

	useEffect(() => {
		const nextMetadata = asset.metadata ?? {}
		setModelValue(mergeModelDisplay(asset.model || "", getMetadataString(nextMetadata, "internal_model")))
		setVendorValue(mergeVendorDisplay(asset.vendor || "", getMetadataString(nextMetadata, "vendor_cn")))
		setOfficialUrlValue(getMetadataString(nextMetadata, "official_url"))
		setReleaseDateValue(getMetadataString(nextMetadata, "release_date"))
		setProductPositioningValue(getMetadataString(nextMetadata, "product_positioning"))
	}, [asset.id, asset.model, asset.vendor, asset.metadata])

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		if (!readOnly && !saving) onSave(event)
		else event.preventDefault()
	}

	return (
		<form id={ASSET_HARDWARE_IDENTITY_EDIT_FORM_ID} onSubmit={handleSubmit} className="grid gap-3">
			<div className="grid gap-2 sm:grid-cols-2">
				<div className="grid gap-2">
					<Label htmlFor="hardware-identity-vendor">品牌</Label>
					<Input
						id="hardware-identity-vendor"
						name="vendor"
						value={vendorValue}
						placeholder="例如 铭凡 (Minisforum)"
						onChange={(event) => setVendorValue(event.target.value)}
						disabled={readOnly || saving}
					/>
				</div>
				<div className="grid gap-2">
					<Label htmlFor="hardware-identity-model">型号</Label>
					<Input
						id="hardware-identity-model"
						name="model"
						value={modelValue}
						placeholder="例如 UM690（内部型号写在括号里）"
						onChange={(event) => setModelValue(event.target.value)}
						disabled={readOnly || saving}
					/>
				</div>
				<div className="grid gap-2">
					<Label htmlFor="hardware-identity-product-positioning">产品定位</Label>
					<Input
						id="hardware-identity-product-positioning"
						name="product_positioning"
						value={productPositioningValue}
						placeholder="例如 迷你主机 / 工作站 / 家用 NAS"
						onChange={(event) => setProductPositioningValue(event.target.value)}
						disabled={readOnly || saving}
					/>
				</div>
				<div className="grid gap-2">
					<Label htmlFor="hardware-identity-release-date">上市日期</Label>
					<Input
						id="hardware-identity-release-date"
						name="release_date"
						value={releaseDateValue}
						placeholder="例如 2022 年 / Q4'22"
						onChange={(event) => setReleaseDateValue(event.target.value)}
						disabled={readOnly || saving}
					/>
				</div>
				<div className="grid gap-2">
					<Label htmlFor="hardware-identity-official-url">官方网站</Label>
					<Input
						id="hardware-identity-official-url"
						name="official_url"
						value={officialUrlValue}
						placeholder="型号官方资料页面 URL，可选"
						onChange={(event) => setOfficialUrlValue(event.target.value)}
						disabled={readOnly || saving}
					/>
				</div>
			</div>
		</form>
	)
}
