import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { ASSET_TYPE_OPTIONS } from "@/modules/asset-center/asset-schema"
import { getAssetIcon } from "@/modules/asset-center/components/asset-card"
import type { AssetType } from "@/types"

export type AssetTypePickerProps = {
	selectedType: AssetType
	onSelect: (type: AssetType) => void
}

export function AssetTypePicker({ selectedType, onSelect }: AssetTypePickerProps) {
	const groups = useAssetTypeGroups()
	const selectedGroup = groups.find(([, items]) => items.some((item) => item.value === selectedType))?.[0]
	const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(selectedGroup ? [selectedGroup] : []))

	useEffect(() => {
		if (!selectedGroup) return
		setOpenGroups((current) => {
			if (current.has(selectedGroup)) return current
			const next = new Set(current)
			next.add(selectedGroup)
			return next
		})
	}, [selectedGroup])

	function toggleGroup(group: string) {
		setOpenGroups((current) => {
			const next = new Set(current)
			if (next.has(group)) {
				next.delete(group)
			} else {
				next.add(group)
			}
			return next
		})
	}

	return (
		<div className="min-h-0 overflow-y-auto pr-1">
			<div className="grid gap-2">
				{groups.map(([group, items]) => (
					<div key={group} className="rounded-lg border border-border/70 bg-card">
						<button
							type="button"
							onClick={() => toggleGroup(group)}
							className="flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left"
							aria-expanded={openGroups.has(group)}
						>
							<span className="flex min-w-0 items-center gap-2">
								{openGroups.has(group) ? (
									<ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
								) : (
									<ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
								)}
								<span className="font-medium text-foreground">{group}</span>
							</span>
							<span className="rounded-md border border-border/70 bg-surface-soft px-1.5 py-0.5 text-[11px] text-muted-foreground">
								{items.length}
							</span>
						</button>
						{openGroups.has(group) && (
							<div className="grid gap-2 border-t border-border/70 p-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
								{items.map((item) => {
									const Icon = getAssetIcon(item.value)
									const active = selectedType === item.value
									return (
										<button
											key={item.value}
											type="button"
											onClick={() => onSelect(item.value)}
											className={cn(
												"grid min-h-20 gap-2 rounded-md border p-3 text-left transition-[border-color,background-color,box-shadow]",
												active
													? "border-foreground/30 bg-surface-soft shadow-xs"
													: "border-border/70 bg-card hover:border-border hover:bg-surface-soft/70"
											)}
										>
											<div className="flex items-center gap-2">
												<div className="grid size-9 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground">
													<Icon className="size-4" />
												</div>
												<div className="font-medium text-foreground">{item.label}</div>
											</div>
											<div className="line-clamp-2 text-xs leading-5 text-muted-foreground">{item.description}</div>
										</button>
									)
								})}
							</div>
						)}
					</div>
				))}
			</div>
		</div>
	)
}

export function AssetTypeRail({ selectedType, onSelect }: AssetTypePickerProps) {
	return (
		<div className="grid content-start gap-2 rounded-lg border border-border/70 bg-surface-soft p-2">
			{ASSET_TYPE_OPTIONS.map((item) => {
				const Icon = getAssetIcon(item.value)
				const active = selectedType === item.value
				return (
					<button
						key={item.value}
						type="button"
						onClick={() => onSelect(item.value)}
						className={cn(
							"flex min-h-10 items-center gap-2 rounded-md px-2.5 text-left text-sm transition-colors",
							active ? "bg-card font-medium text-foreground shadow-xs" : "text-muted-foreground hover:bg-card/70"
						)}
					>
						<Icon className="size-4 shrink-0" />
						<span className="truncate">{item.label}</span>
					</button>
				)
			})}
		</div>
	)
}

function useAssetTypeGroups() {
	return useMemo(() => {
		const result = new Map<string, typeof ASSET_TYPE_OPTIONS>()
		for (const item of ASSET_TYPE_OPTIONS) {
			result.set(item.group, [...(result.get(item.group) ?? []), item])
		}
		return [...result.entries()]
	}, [])
}
