import { useEffect, useState } from "react"
import { NetworkIcon } from "lucide-react"
import { pb } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SelectField, TextField, TextAreaField } from "./asset-detail-form-fields"
import { DialogFormSection, yesNoOptions } from "../asset-detail-dialog-parts"
import { getMetadataString } from "@/modules/asset-center/asset-schema"
import { interfaceKindOptions } from "@/modules/asset-center/asset-detail-relations"
import type { AssetInterfaceKind, AssetInterfaceRecord, AssetRecord } from "@/types"

// 2026-10-06 页面重构：接口编辑弹窗从详情页抽出，展示页与编辑页共用。
// 接口只负责网络身份：名称、类型、IP、MAC、速率和是否作为主接口。

export function AssetInterfaceEditDialog({
	open,
	onOpenChange,
	asset,
	editing,
	currentInterfaces,
	onSaved,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	asset: AssetRecord
	editing: AssetInterfaceRecord | null
	currentInterfaces: AssetInterfaceRecord[]
	onSaved: () => void
}) {
	const [kindDraft, setKindDraft] = useState<AssetInterfaceKind>("ethernet")
	const [saving, setSaving] = useState(false)
	// ONT 接口模板只允许 enabled/role/band/connection_note/notes，Wi-Fi 制式以资产档案为准；
	// 交换机接口只接受有线/光纤，角色只允许上联、下联、通用。
	const isOntAsset = asset.type === "ont" || asset.type === "smart_ont"
	const isSwitchAsset = asset.type === "switch"
	const kindOptions = isSwitchAsset
		? interfaceKindOptions.filter((option) => option.value === "ethernet" || option.value === "optical")
		: interfaceKindOptions
	const roleOptions = isSwitchAsset
		? [
				{ value: "uplink", label: "上联" },
				{ value: "downlink", label: "下联" },
				{ value: "general", label: "通用" },
			]
		: [
				{ value: "uplink", label: "上联" },
				{ value: "downlink", label: "下联" },
				{ value: "lan", label: "LAN" },
				{ value: "radio", label: "无线频段" },
			]
	const bandOptions = isOntAsset
		? [
				{ value: "2.4 GHz", label: "2.4 GHz" },
				{ value: "5 GHz", label: "5 GHz" },
			]
		: [
				{ value: "2.4 GHz", label: "2.4 GHz" },
				{ value: "5 GHz", label: "5 GHz" },
				{ value: "6 GHz", label: "6 GHz" },
			]

	useEffect(() => {
		if (open) setKindDraft(editing?.kind ?? "ethernet")
	}, [open, editing])

	async function clearOtherPrimaryInterfaces(keepId: string) {
		const records = currentInterfaces.filter((item) => item.asset === asset.id && item.id !== keepId && item.primary)
		await Promise.all(records.map((record) => pb.collection("asset_interfaces").update(record.id, { primary: false })))
	}

	async function save(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const form = new FormData(event.currentTarget)
		const name = form.get("name")?.toString().trim() || ""
		if (!name) return
		const user = pb.authStore.record?.id
		if (!user) return
		const primary = form.get("primary") === "yes"
		const kind = form.get("kind")?.toString() || "ethernet"
		const payload = {
			user,
			asset: asset.id,
			name,
			kind,
			mac: form.get("mac")?.toString().trim(),
			ipv4: form.get("ipv4")?.toString().trim(),
			ipv6: form.get("ipv6")?.toString().trim(),
			speed_mbps: Number(form.get("speed_mbps")) || undefined,
			connected: form.get("connected") === "yes",
			primary,
			source: editing?.source || "manual",
			metadata: {
				enabled: form.get("enabled") !== "no",
				role: form.get("interface_role")?.toString() || "",
				...(kind === "wifi"
					? {
							...(isOntAsset ? {} : { wifi_standard: form.get("wifi_standard")?.toString() || "" }),
							band: form.get("band")?.toString() || "",
						}
					: {}),
				connection_note: form.get("connection_note")?.toString().trim() || "",
				notes: form.get("notes")?.toString().trim() || "",
			},
		}
		setSaving(true)
		try {
			const saved = editing
				? await pb.collection<AssetInterfaceRecord>("asset_interfaces").update(editing.id, payload)
				: await pb.collection<AssetInterfaceRecord>("asset_interfaces").create(payload)
			if (primary) await clearOtherPrimaryInterfaces(saved.id)
			onOpenChange(false)
			onSaved()
		} catch (error) {
			console.error("save asset interface", error)
		} finally {
			setSaving(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[88dvh] w-full max-w-4xl overflow-y-auto">
				<form key={editing?.id ?? "new-interface"} onSubmit={save} className="grid gap-4">
					<DialogHeader className="gap-1 border-b border-border/70 pb-3">
						<DialogTitle>{editing ? "编辑接口" : "添加接口"}</DialogTitle>
					</DialogHeader>
					<div className="grid gap-3">
						<DialogFormSection
							icon={<NetworkIcon className="size-4" />}
							title="接口身份"
							description="决定这个端口在资产、拓扑和后续监控里怎么被识别。"
						>
							<TextField
								name="name"
								label="接口名称"
								placeholder="主网卡 / LAN1 / Wi-Fi"
								required
								defaultValue={editing?.name}
							/>
							<SelectField
								name="kind"
								label="网络接入方式"
								options={kindOptions}
								value={kindDraft}
								onChange={(value) => setKindDraft(value as AssetInterfaceKind)}
							/>
							<SelectField
								name="enabled"
								label="启用状态"
								options={[
									{ value: "yes", label: "启用" },
									{ value: "no", label: "未启用" },
								]}
								defaultValue={editing?.metadata?.enabled === false ? "no" : "yes"}
							/>
							<SelectField
								name="interface_role"
								label="接口角色"
								options={roleOptions}
								defaultValue={getMetadataString(editing?.metadata, "role") || (isSwitchAsset ? "general" : "lan")}
							/>
							{kindDraft === "wifi" ? (
								<>
									{isOntAsset ? null : (
										<SelectField
											name="wifi_standard"
											label="无线标准"
											placeholder="选择标准"
											options={[
												{ value: "Wi-Fi 4", label: "Wi-Fi 4" },
												{ value: "Wi-Fi 5", label: "Wi-Fi 5" },
												{ value: "Wi-Fi 6", label: "Wi-Fi 6" },
												{ value: "Wi-Fi 6E", label: "Wi-Fi 6E" },
												{ value: "Wi-Fi 7", label: "Wi-Fi 7" },
											]}
											defaultValue={getMetadataString(editing?.metadata, "wifi_standard")}
										/>
									)}
									<SelectField
										name="band"
										label="无线频段"
										placeholder="选择频段"
										options={bandOptions}
										defaultValue={getMetadataString(editing?.metadata, "band")}
									/>
								</>
							) : null}
							<SelectField
								name="connected"
								label="当前接入"
								options={yesNoOptions()}
								defaultValue={editing?.connected === false ? "no" : "yes"}
							/>
							<SelectField
								name="primary"
								label="主接口"
								options={yesNoOptions()}
								defaultValue={editing?.primary ? "yes" : "no"}
							/>
						</DialogFormSection>
						<DialogFormSection
							icon={<NetworkIcon className="size-4" />}
							title="网络参数"
							description="这些字段会被网络拓扑和资产识别复用，尽量填写长期稳定值。"
						>
							<TextField name="mac" label="MAC" placeholder="AA:BB:CC:DD:EE:FF" defaultValue={editing?.mac} />
							<TextField
								name="speed_mbps"
								label="网卡速率 Mbps"
								type="number"
								placeholder="2500"
								defaultValue={editing?.speed_mbps ? String(editing.speed_mbps) : ""}
							/>
							<TextField name="ipv4" label="IPv4" placeholder="192.168.1.10" defaultValue={editing?.ipv4} />
							<TextField name="ipv6" label="IPv6" placeholder="可选" defaultValue={editing?.ipv6} />
							<TextField
								name="connection_note"
								label="接线说明"
								placeholder="例如 交换机（待建档）"
								defaultValue={getMetadataString(editing?.metadata, "connection_note")}
							/>
							<TextAreaField
								name="notes"
								label="备注"
								className="sm:col-span-2"
								defaultValue={getMetadataString(editing?.metadata, "notes")}
							/>
						</DialogFormSection>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
							取消
						</Button>
						<Button type="submit" disabled={saving}>
							{saving ? "保存中" : editing ? "保存接口" : "添加接口"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
