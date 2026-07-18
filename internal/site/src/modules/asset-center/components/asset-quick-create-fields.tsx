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
import { internetAssetTypeSpec } from "../asset-type-specs"

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
	if (form.type === "internet") {
		return (
			<AssetFormSection title="基础资料与线路参数">
				<AssetFormField label="资源名称" required>
					<Input value={form.name} onChange={(event) => onFormValue("name", event.target.value)} placeholder="例如 宽带" />
				</AssetFormField>
				<AssetFormField label="运营商" required>
					<select
						value={form.vendor}
						onChange={(event) => onFormValue("vendor", event.target.value)}
						className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
					>
						<option value="">请选择运营商</option>
						{internetAssetTypeSpec.providerOptions.map((option) => (
							<option key={option.value} value={option.value}>{option.label}</option>
						))}
					</select>
				</AssetFormField>
				<AssetFormField label="使用状态" required>
					<select value={form.status} onChange={(event) => onFormValue("status", event.target.value as AssetFormState["status"])} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm">
						{internetAssetTypeSpec.statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
					</select>
				</AssetFormField>
				<AssetFormField label="线路接入技术" required>
					<select value={form.metadata.access_technology ?? ""} onChange={(event) => onMetadataValue("access_technology", event.target.value)} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm">
						<option value="">请选择线路技术</option>
						{internetAssetTypeSpec.sections.flatMap((section) => section.fields).find((field) => field.key === "access_technology")?.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
					</select>
				</AssetFormField>
				<AssetFormField label="联网认证方式" required>
					<select value={form.metadata.auth_mode ?? ""} onChange={(event) => onMetadataValue("auth_mode", event.target.value)} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm">
						<option value="">请选择认证方式</option>
						{internetAssetTypeSpec.sections.flatMap((section) => section.fields).find((field) => field.key === "auth_mode")?.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
					</select>
				</AssetFormField>
				<AssetFormField label="下行带宽 Mbps" required>
					<Input
						type="number"
						min="1"
						value={form.metadata.down_mbps ?? ""}
						onChange={(event) => onMetadataValue("down_mbps", event.target.value)}
						placeholder="1000"
					/>
				</AssetFormField>
				<AssetFormField label="上行带宽 Mbps" required>
					<Input
						type="number"
						min="1"
						value={form.metadata.up_mbps ?? ""}
						onChange={(event) => onMetadataValue("up_mbps", event.target.value)}
						placeholder="100"
					/>
				</AssetFormField>
			</AssetFormSection>
		)
	}
	if (form.type === "web_endpoint") {
		return (
			<AssetFormSection title="互联网服务监控">
				<AssetFormField label="所属类型" required>
					<div className="flex h-10 items-center rounded-md border border-border/70 bg-surface-soft px-3 text-sm text-foreground">
						{getAssetTypeLabel(form.type)}
					</div>
				</AssetFormField>
				<AssetFormField label="服务名称" required>
					<Input
						value={form.name}
						onChange={(event) => onFormValue("name", event.target.value)}
						placeholder="例如 家庭门户 / API 网关 / 中转站"
					/>
				</AssetFormField>
				<AssetFormField label="主访问 URL" required>
					<Input
						type="url"
						value={form.metadata.url ?? ""}
						onChange={(event) => onMetadataValue("url", event.target.value)}
						placeholder="https://service.example.com"
					/>
				</AssetFormField>
				<AssetFormField label="位置" required>
					<AssetLocationInput
						idPrefix="quick-service-location-options"
						value={form.location}
						locationOptions={locationOptions}
						onChange={(value) => onFormValue("location", value)}
					/>
				</AssetFormField>
			</AssetFormSection>
		)
	}

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
					placeholder={form.type === "phone" ? "可选，留空按型号和内部型号自动生成" : "可选，留空按型号自动生成"}
				/>
			</AssetFormField>
			<AssetFormField label="IPv4 地址" required>
				<Input
					value={form.management_ip}
					onChange={(event) => onFormValue("management_ip", event.target.value)}
					placeholder="192.168.1.10"
				/>
			</AssetFormField>
			<AssetFormField label="厂商 / 品牌" required>
				<Input
					value={form.vendor}
					onChange={(event) => onFormValue("vendor", event.target.value)}
					placeholder="例如 小米 / Redmi / TP-Link / 自组"
				/>
			</AssetFormField>
			<AssetFormField label="型号 / 规格" required>
				<Input
					value={form.model}
					onChange={(event) => onFormValue("model", event.target.value)}
					placeholder="例如 Redmi K50 / V271-20 / CM754"
				/>
			</AssetFormField>
			{form.type === "phone" && (
				<AssetFormField label="内部型号 / 搜索代码" required>
					<Input
						value={form.metadata.internal_model ?? ""}
						onChange={(event) => onMetadataValue("internal_model", event.target.value)}
						placeholder="例如 22021211RC / 产品内部代号 / 硬件代码"
					/>
				</AssetFormField>
			)}
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
