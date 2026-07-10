import {
	AssetFormField,
	AssetFormSection,
	AssetLocationInput,
	AssetTagInput,
	PHONE_MEMORY_OPTIONS,
	PHONE_STORAGE_OPTIONS,
	PhoneVariantSpecInput,
} from "@/modules/asset-center/components/asset-form-fields"
import type { AssetFormState } from "@/modules/asset-center/asset-import"
import { getAssetTypeLabel, isPhoneVariantSpecRequired } from "@/modules/asset-center/asset-schema"
import { Input } from "@/components/ui/input"

export function QuickAssetCreateFields({
	form,
	locationOptions,
	nextAssetTagPreview,
	onFormValue,
	onMetadataValue,
}: {
	form: AssetFormState
	locationOptions: string[]
	nextAssetTagPreview: string
	onFormValue: <K extends keyof AssetFormState>(key: K, value: AssetFormState[K]) => void
	onMetadataValue: (key: string, value: string) => void
}) {
	return (
		<AssetFormSection title="快速建档">
			<AssetFormField label="所属类型" required>
				<div className="flex h-10 items-center rounded-md border border-border/70 bg-surface-soft px-3 text-sm text-foreground">
					{getAssetTypeLabel(form.type)}
				</div>
			</AssetFormField>
			<AssetFormField label="资产名称">
				<Input
					value={form.name}
					onChange={(event) => onFormValue("name", event.target.value)}
					placeholder="可选，留空按型号和内部型号自动生成"
				/>
			</AssetFormField>
			<AssetFormField label="IPv4 地址" required capture="agent_required">
				<Input
					value={form.management_ip}
					onChange={(event) => onFormValue("management_ip", event.target.value)}
					placeholder="192.168.1.10"
				/>
			</AssetFormField>
			<AssetFormField label="厂商 / 品牌" required capture="future_collectable">
				<Input
					value={form.vendor}
					onChange={(event) => onFormValue("vendor", event.target.value)}
					placeholder="例如 小米 / Redmi / TP-Link / 自组"
				/>
			</AssetFormField>
			<AssetFormField label="型号 / 规格" required capture="future_collectable">
				<Input
					value={form.model}
					onChange={(event) => onFormValue("model", event.target.value)}
					placeholder="例如 Redmi K50 / V271-20 / CM754"
				/>
			</AssetFormField>
			<AssetFormField label="内部型号 / 搜索代码" required capture="future_collectable">
				<Input
					value={form.metadata.internal_model ?? ""}
					onChange={(event) => onMetadataValue("internal_model", event.target.value)}
					placeholder="例如 22021211RC / 产品内部代号 / 硬件代码"
				/>
			</AssetFormField>
			<AssetFormField label="外观颜色">
				<Input
					value={form.metadata.color ?? ""}
					onChange={(event) => onMetadataValue("color", event.target.value)}
					placeholder="资料补全后选择官方配色"
				/>
			</AssetFormField>
			{isPhoneVariantSpecRequired(form.type) && (
				<>
					<AssetFormField label="运行内存 GB" required>
						<PhoneVariantSpecInput
							value={form.metadata.memory_gb ?? ""}
							onChange={(value) => onMetadataValue("memory_gb", value)}
							options={PHONE_MEMORY_OPTIONS}
							customPlaceholder="例如 10"
						/>
					</AssetFormField>
					<AssetFormField label="存储容量 GB" required>
						<PhoneVariantSpecInput
							value={form.metadata.storage_gb ?? ""}
							onChange={(value) => onMetadataValue("storage_gb", value)}
							options={PHONE_STORAGE_OPTIONS}
							customPlaceholder="例如 384"
						/>
					</AssetFormField>
				</>
			)}
			<AssetFormField label="资产编号">
				<AssetTagInput
					value={form.metadata.asset_tag ?? ""}
					onChange={(value) => onMetadataValue("asset_tag", value)}
					nextAssetTagPreview={nextAssetTagPreview}
				/>
			</AssetFormField>
			<AssetFormField label="位置" required>
				<AssetLocationInput
					idPrefix="quick-asset-location-options"
					value={form.location}
					locationOptions={locationOptions}
					onChange={(value) => onFormValue("location", value)}
				/>
			</AssetFormField>
		</AssetFormSection>
	)
}
