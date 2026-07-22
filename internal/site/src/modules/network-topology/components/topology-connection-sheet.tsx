import { AlertTriangleIcon, Trash2Icon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Link, prependBasePath } from "../../../components/router.tsx"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "../../../components/ui/alert-dialog.tsx"
import { Alert, AlertDescription, AlertTitle } from "../../../components/ui/alert.tsx"
import { Button } from "../../../components/ui/button.tsx"
import { Input } from "../../../components/ui/input.tsx"
import { Label } from "../../../components/ui/label.tsx"
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../../../components/ui/select.tsx"
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "../../../components/ui/sheet.tsx"
import { pb } from "../../../lib/api.ts"
import type { AssetInterfaceRecord, AssetRecord, AssetRelationRecord } from "../../../types.ts"
import { getRelationDomain, getRelationMedium, type TopologyDomain, type TopologyMedium } from "../topology-domain.ts"
import { deleteNetworkRelation, saveNetworkRelation } from "../relation-operations.ts"

export type TopologyConnectionSheetProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
	sourceAsset?: AssetRecord
	targetAsset?: AssetRecord
	interfaces: AssetInterfaceRecord[]
	domain: TopologyDomain
	relation?: AssetRelationRecord
	readOnly: boolean
	onSaved: (relation: AssetRelationRecord) => void | Promise<void>
	onDeleted: (relationId: string) => void | Promise<void>
}

export function TopologyConnectionSheet({
	open,
	onOpenChange,
	sourceAsset,
	targetAsset,
	interfaces,
	domain,
	relation,
	readOnly,
	onSaved,
	onDeleted,
}: TopologyConnectionSheetProps) {
	const sourceInterfaces = useMemo(
		() => interfaces.filter((item) => item.asset === sourceAsset?.id),
		[interfaces, sourceAsset?.id]
	)
	const targetInterfaces = useMemo(
		() => interfaces.filter((item) => item.asset === targetAsset?.id),
		[interfaces, targetAsset?.id]
	)
	const [sourceInterface, setSourceInterface] = useState("")
	const [targetInterface, setTargetInterface] = useState("")
	const [selectedDomain, setSelectedDomain] = useState<TopologyDomain>(domain)
	const [medium, setMedium] = useState<TopologyMedium>("wired")
	const [label, setLabel] = useState("")
	const [saving, setSaving] = useState(false)
	const [deleting, setDeleting] = useState(false)
	const [error, setError] = useState("")

	useEffect(() => {
		if (!open) return
		setSourceInterface(getMetadataString(relation?.metadata, "source_interface"))
		setTargetInterface(getMetadataString(relation?.metadata, "target_interface"))
		setSelectedDomain(getRelationDomain(relation?.metadata) ?? domain)
		setMedium(getRelationMedium(relation?.metadata) ?? "wired")
		setLabel(relation?.label ?? "")
		setError("")
	}, [domain, open, relation])

	async function handleSave(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (readOnly) {
			setError("只读账号不能修改网络关系。")
			return
		}
		const user = pb.authStore.record?.id
		if (!user || !sourceAsset || !targetAsset) {
			setError("连接端点或当前账号无效，请重新选择。")
			return
		}
		setSaving(true)
		setError("")
		const result = await saveNetworkRelation({
			readOnly,
			relationId: relation?.id,
			input: {
				user,
				sourceAsset: sourceAsset.id,
				targetAsset: targetAsset.id,
				sourceInterface,
				targetInterface,
				domain: selectedDomain,
				medium,
				interfaces,
				metadata: relation?.metadata,
				label,
			},
			collection: getRelationCollection(),
		})
		setSaving(false)
		if (result.status === "saved") {
			await onSaved(result.relation)
			onOpenChange(false)
			return
		}
		setError(getSaveError(result))
	}

	async function handleDelete() {
		if (!relation || readOnly) return
		setDeleting(true)
		setError("")
		const result = await deleteNetworkRelation({
			readOnly,
			relationId: relation.id,
			collection: getRelationCollection(),
		})
		setDeleting(false)
		if (result.status === "deleted") {
			await onDeleted(relation.id)
			onOpenChange(false)
			return
		}
		setError(result.status === "failed" ? getErrorMessage(result.error) : "只读账号不能删除网络关系。")
	}

	const missingInterfaces = sourceInterfaces.length === 0 || targetInterfaces.length === 0
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="w-[min(100vw-1rem,30rem)] gap-0 overflow-y-auto p-0">
				<SheetHeader className="border-b border-border pr-14">
					<SheetTitle>{relation ? "编辑网络连接" : "新建网络连接"}</SheetTitle>
					<SheetDescription>
						{sourceAsset?.name ?? "起点待确认"} → {targetAsset?.name ?? "终点待确认"}
					</SheetDescription>
				</SheetHeader>

				<form className="grid flex-1 content-start gap-4 p-4" onSubmit={handleSave}>
					<div className="grid gap-2">
						<Label htmlFor="topology-source-interface">起点网口</Label>
						<Select value={sourceInterface} onValueChange={setSourceInterface} disabled={readOnly || !sourceAsset}>
							<SelectTrigger id="topology-source-interface">
								<SelectValue placeholder="选择真实网口" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{sourceInterfaces.map((item) => (
										<SelectItem key={item.id} value={item.id}>
											{formatInterface(item)}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>

					<div className="grid gap-2">
						<Label htmlFor="topology-target-interface">终点网口</Label>
						<Select value={targetInterface} onValueChange={setTargetInterface} disabled={readOnly || !targetAsset}>
							<SelectTrigger id="topology-target-interface">
								<SelectValue placeholder="选择真实网口" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{targetInterfaces.map((item) => (
										<SelectItem key={item.id} value={item.id}>
											{formatInterface(item)}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div className="grid gap-2">
							<Label htmlFor="topology-domain">网络</Label>
							<Select
								value={selectedDomain}
								onValueChange={(value) => setSelectedDomain(value as TopologyDomain)}
								disabled={readOnly}
							>
								<SelectTrigger id="topology-domain">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value="home">家庭网络</SelectItem>
										<SelectItem value="technology">科技网</SelectItem>
									</SelectGroup>
								</SelectContent>
							</Select>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="topology-medium">连接介质</Label>
							<Select value={medium} onValueChange={(value) => setMedium(value as TopologyMedium)} disabled={readOnly}>
								<SelectTrigger id="topology-medium">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value="wired">网线</SelectItem>
										<SelectItem value="wifi">Wi-Fi</SelectItem>
										<SelectItem value="fiber">光纤</SelectItem>
									</SelectGroup>
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="grid gap-2">
						<Label htmlFor="topology-relation-label">连接名称</Label>
						<Input
							id="topology-relation-label"
							value={label}
							onChange={(event) => setLabel(event.target.value)}
							placeholder="可选，例如 LAN 1 → NAS"
							disabled={readOnly}
						/>
					</div>

					{missingInterfaces ? (
						<Alert>
							<AlertTriangleIcon aria-hidden="true" />
							<AlertTitle>需要先补充真实网口</AlertTitle>
							<AlertDescription className="grid gap-2">
								<span>没有网口的设备不能建立确认关系。</span>
								<div className="flex flex-wrap gap-2">
									{sourceAsset && sourceInterfaces.length === 0 ? (
										<Button asChild variant="outline" size="sm">
											<Link href={prependBasePath(`/assets/${sourceAsset.id}`)}>打开 {sourceAsset.name}</Link>
										</Button>
									) : null}
									{targetAsset && targetInterfaces.length === 0 ? (
										<Button asChild variant="outline" size="sm">
											<Link href={prependBasePath(`/assets/${targetAsset.id}`)}>打开 {targetAsset.name}</Link>
										</Button>
									) : null}
								</div>
							</AlertDescription>
						</Alert>
					) : null}

					{error ? (
						<Alert className="border-destructive/35">
							<AlertTriangleIcon aria-hidden="true" />
							<AlertTitle>关系未保存</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					) : null}

					<SheetFooter className="mt-2 flex-row items-center justify-end border-t border-border px-0 pt-4">
						{relation && !readOnly ? (
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button type="button" variant="destructive" className="me-auto">
										<Trash2Icon aria-hidden="true" data-icon="inline-start" />
										删除
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>删除这条真实网络关系？</AlertDialogTitle>
										<AlertDialogDescription>
											删除后拓扑和资产关系中都会移除，节点本身不会被删除。
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>取消</AlertDialogCancel>
										<AlertDialogAction
											disabled={deleting}
											className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
											onClick={handleDelete}
										>
											{deleting ? "删除中" : "确认删除"}
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						) : null}
						{!readOnly ? (
							<Button type="submit" disabled={saving || missingInterfaces || !sourceInterface || !targetInterface}>
								{saving ? "保存中" : relation ? "保存修改" : "创建连接"}
							</Button>
						) : null}
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	)
}

function getRelationCollection() {
	const collection = pb.collection<AssetRelationRecord>("asset_relations")
	return {
		create: (payload: Record<string, unknown>) => collection.create(payload),
		update: (id: string, payload: Record<string, unknown>) => collection.update(id, payload),
		delete: (id: string) => collection.delete(id),
	}
}

function formatInterface(item: AssetInterfaceRecord) {
	return [item.name, item.speed_mbps ? formatSpeed(item.speed_mbps) : "", item.ipv4 || item.mac]
		.filter(Boolean)
		.join(" · ")
}

function formatSpeed(speedMbps: number) {
	return speedMbps >= 1000 ? `${Number((speedMbps / 1000).toFixed(1))} Gbps` : `${speedMbps} Mbps`
}

function getMetadataString(metadata: Record<string, unknown> | undefined, key: string) {
	const value = metadata?.[key]
	return typeof value === "string" ? value : ""
}

function getSaveError(result: Awaited<ReturnType<typeof saveNetworkRelation>>) {
	if (result.status === "forbidden") return "只读账号不能修改网络关系。"
	if (result.status === "invalid") {
		if (result.reason === "same-asset") return "不能把设备连接到自己。"
		if (result.reason === "interface-ownership") return "网口与所选设备不匹配，请重新选择。"
		return "双方都必须选择真实网口。"
	}
	return result.status === "failed" ? getErrorMessage(result.error) : "关系保存失败。"
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : "请检查字段、权限或 Hub 日志。"
}
