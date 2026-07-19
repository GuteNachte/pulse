import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
	DEFAULT_ASSET_LOCATION_PRESETS,
	buildLocationPath,
	buildLocationPresetParts,
	buildLocationPresetPath,
	getLocationPresetParentPath,
	type LooseLocationGroup,
} from "@/modules/asset-center/asset-location"
import {
	buildAssetLocationPresetSelection,
	customLocationOptionValue,
	noSecondLocationOptionValue,
	type AssetLocationPresetSelection,
} from "@/modules/asset-center/asset-location-dialog"
import { AssetFormField, AssetMetaTag } from "@/modules/asset-center/components/asset-form-fields"
import { Button } from "@/components/ui/button"
import type { AssetLocationRecord } from "@/types"

export function AssetLocationSettingsDialog({
	open,
	onOpenChange,
	locations,
	looseLocationGroups,
	saving,
	readOnly,
	onArchiveLooseLocations,
	onCreatePreset,
	onValidationError,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	locations: AssetLocationRecord[]
	looseLocationGroups: LooseLocationGroup[]
	saving: boolean
	readOnly: boolean
	onArchiveLooseLocations: () => void
	onCreatePreset: (selection: AssetLocationPresetSelection) => void
	onValidationError: (title: string) => void
}) {
	const rootPresets = useMemo(() => DEFAULT_ASSET_LOCATION_PRESETS.filter((preset) => !preset.parentName), [])
	const [rootSelection, setRootSelection] = useState(rootPresets[0]?.name ?? "")
	const [secondSelection, setSecondSelection] = useState("")
	const [customRoot, setCustomRoot] = useState("")
	const [customSecond, setCustomSecond] = useState("")
	const locationsByPath = useMemo(() => {
		const next = new Map<string, AssetLocationRecord>()
		for (const location of locations) {
			const path = buildLocationPath(location, locations)
			if (path) next.set(path, location)
		}
		return next
	}, [locations])
	const presetItems = useMemo(
		() =>
			DEFAULT_ASSET_LOCATION_PRESETS.map((preset) => {
				const path = buildLocationPresetPath(preset)
				const parentPath = getLocationPresetParentPath(preset)
				const parts = buildLocationPresetParts(preset)
				return { preset, path, parentPath, level: Math.min(parts.length, 2), existing: locationsByPath.get(path) }
			}),
		[locationsByPath]
	)
	const rootPresetItems = useMemo(() => presetItems.filter((item) => item.level === 1), [presetItems])
	const secondPresetItems = useMemo(() => {
		if (rootSelection === customLocationOptionValue) return []
		return presetItems.filter((item) => item.level === 2 && item.parentPath === rootSelection)
	}, [presetItems, rootSelection])
	const presetGroups = useMemo(
		() =>
			rootPresetItems.map((root) => ({
				root,
				children: presetItems.filter((item) => item.level === 2 && item.parentPath === root.path),
			})),
		[presetItems, rootPresetItems]
	)
	const selection = buildAssetLocationPresetSelection({
		rootSelection,
		secondSelection,
		customRoot,
		customSecond,
		rootPresets,
		secondPresets: secondPresetItems.map((item) => item.preset),
	})

	useEffect(() => {
		if (!open) return
		setRootSelection(rootPresets[0]?.name ?? "")
		setSecondSelection("")
		setCustomRoot("")
		setCustomSecond("")
	}, [open, rootPresets])

	function handleCreatePreset() {
		if (!selection.rootName) {
			onValidationError("请选择或填写位置")
			return
		}
		if (secondSelection === customLocationOptionValue && !selection.secondName) {
			onValidationError("请填写自定义房间或子位置")
			return
		}
		onCreatePreset(selection)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[86vh] max-w-3xl flex-col overflow-hidden">
				<DialogHeader>
					<DialogTitle>位置</DialogTitle>
					<DialogDescription>维护位置与房间 / 子位置，资产录入时直接复用。</DialogDescription>
				</DialogHeader>
				<div className="grid min-h-0 gap-4 overflow-y-auto pr-1 md:grid-cols-[minmax(0,1fr)_20rem]">
					<div className="grid content-start gap-3">
						<div className="grid gap-2 rounded-lg border border-border/70 bg-card p-3">
							<div className="flex items-center justify-between gap-3 text-sm">
								<div className="font-medium text-foreground">预设位置</div>
								<AssetMetaTag>{rootPresetItems.length} 个位置</AssetMetaTag>
							</div>
							<div className="grid gap-2">
								{presetGroups.map((group) => (
									<div key={group.root.path} className="grid gap-1.5 rounded-md bg-surface-soft p-2">
										<div className="flex items-center justify-between gap-2">
											<div className="text-sm font-medium text-foreground">{group.root.preset.name}</div>
											<span className="text-xs text-muted-foreground">{group.children.length} 个房间</span>
										</div>
										<div className="flex flex-wrap gap-1">
											{group.children.map((item) => (
												<span
													key={item.path}
													className={cn(
														"rounded-md border px-1.5 py-0.5 text-xs",
														item.existing
															? "border-border/70 bg-card text-foreground"
															: "border-dashed border-border/70 text-muted-foreground"
													)}
												>
													{item.preset.name}
												</span>
											))}
										</div>
									</div>
								))}
							</div>
						</div>
						{looseLocationGroups.length > 0 && (
							<div className="grid gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
								<div className="flex items-center justify-between gap-3">
									<div className="min-w-0">
										<div className="text-sm font-medium">待归档位置</div>
									</div>
									<Button
										variant="outline"
										size="sm"
										onClick={onArchiveLooseLocations}
										disabled={saving || readOnly}
										className="h-8 shrink-0 border-amber-300 bg-white px-2 text-xs text-amber-900 hover:bg-amber-100"
									>
										归档全部
									</Button>
								</div>
								<div className="flex flex-wrap gap-1.5">
									{looseLocationGroups.slice(0, 8).map((group) => (
										<AssetMetaTag key={group.name} tone="warning">
											{group.name} · {group.count}
										</AssetMetaTag>
									))}
									{looseLocationGroups.length > 8 && (
										<AssetMetaTag tone="warning">另 {looseLocationGroups.length - 8} 个</AssetMetaTag>
									)}
								</div>
							</div>
						)}
					</div>
					<div className="grid content-start gap-3 rounded-lg border border-border/70 bg-surface-soft p-3">
						<div className="text-sm font-medium text-foreground">新增预设</div>
						<AssetFormField label="位置" required>
							<select
								value={rootSelection}
								onChange={(event) => {
									setRootSelection(event.target.value)
									setSecondSelection("")
									setCustomSecond("")
								}}
								className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
							>
								{rootPresetItems.map((item) => (
									<option key={item.path} value={item.preset.name}>
										{item.preset.name}
									</option>
								))}
								<option value={customLocationOptionValue}>自定义</option>
							</select>
						</AssetFormField>
						{rootSelection === customLocationOptionValue && (
							<AssetFormField label="自定义位置" required>
								<Input
									value={customRoot}
									placeholder="例如 家、公司、父母家"
									onChange={(event) => setCustomRoot(event.target.value)}
								/>
							</AssetFormField>
						)}
						<AssetFormField label="房间 / 子位置">
							<select
								value={secondSelection}
								onChange={(event) => setSecondSelection(event.target.value)}
								className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
							>
								<option value="">选择房间或子位置</option>
								<option value={noSecondLocationOptionValue}>只新增位置</option>
								{secondPresetItems.map((item) => (
									<option key={item.path} value={item.preset.name}>
										{item.preset.name}
									</option>
								))}
								<option value={customLocationOptionValue}>自定义</option>
							</select>
						</AssetFormField>
						{secondSelection === customLocationOptionValue && (
							<AssetFormField label="自定义房间或子位置" required>
								<Input
									value={customSecond}
									placeholder="例如 客厅、卧室、书房"
									onChange={(event) => setCustomSecond(event.target.value)}
								/>
							</AssetFormField>
						)}
						<div className="rounded-md border border-border/70 bg-card p-3 text-sm text-muted-foreground">
							将新增：<span className="font-medium text-foreground">{selection.rootName || "未选择"}</span>
							{selection.secondName && (
								<>
									{" "}
									/ <span className="font-medium text-foreground">{selection.secondName}</span>
								</>
							)}
						</div>
						<Button onClick={handleCreatePreset} disabled={saving || readOnly}>
							{saving ? "添加中" : "新增预设"}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	)
}
