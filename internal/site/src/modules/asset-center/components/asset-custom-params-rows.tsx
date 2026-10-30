import { PlusIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { getAssetParamLabel } from "../asset-param-labels"

// 2026-10-04 自定义资产自由模板（docs/asset-create-flow-redesign.md）：
// "其他"分组的手动创建——必填与可选核心字段之外，全是自由 key-value 参数行，
// 添加一行多一行、随时删除；受控组件，键变更直接写回表单 metadata。
// 2026-10-05 参数中文化：有中文名映射的已知参数名只读展示（下方小字保留原键名），仅自建行可改参数名。

export function AssetCustomParamsRows({
	metadata,
	coveredKeys,
	onChange,
}: {
	metadata: Record<string, string>
	coveredKeys: Set<string>
	onChange: (next: Record<string, string>) => void
}) {
	const extraEntries = Object.entries(metadata).filter(([key]) => !coveredKeys.has(key))

	function rebuild(mapFn: (entries: [string, string][]) => [string, string][]) {
		const next: Record<string, string> = {}
		for (const [key, value] of mapFn(Object.entries(metadata))) {
			if (!key) continue
			next[key] = value
		}
		onChange(next)
	}

	function renameKey(oldKey: string, nextKey: string) {
		const key = nextKey.trim()
		// 空名或与已有键冲突时保持原键，避免静默合并
		if (!key || (key !== oldKey && Object.hasOwn(metadata, key))) return
		rebuild((entries) => entries.map(([k, v]) => (k === oldKey ? [key, v] : [k, v])))
	}

	function addRow() {
		let index = 1
		while (Object.hasOwn(metadata, `参数${index}`)) index += 1
		onChange({ ...metadata, [`参数${index}`]: "" })
	}

	return (
		<div className="grid content-start gap-2">
			{extraEntries.length === 0 && (
				<p className="text-xs leading-5 text-muted-foreground">
					还没有自定义参数。点"添加一行"就能记录任何想记的参数，例如购入价格、保修截止、摆放位置。
				</p>
			)}
			{extraEntries.map(([key, value]) => {
				const chineseLabel = getAssetParamLabel(key)
				const keyEditable = !chineseLabel
				return (
					<div key={key} className="grid gap-1.5 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-start sm:gap-2">
						<div className="grid gap-0.5">
							<Input
								value={chineseLabel ?? key}
								readOnly={!keyEditable}
								onChange={(event) => renameKey(key, event.target.value)}
								placeholder="参数名"
								className={cn("h-8", keyEditable ? "font-mono text-xs" : "text-sm")}
							/>
							{chineseLabel && <span className="px-1 font-mono text-[10px] text-muted-foreground/70">{key}</span>}
						</div>
						<Input
							value={value}
							onChange={(event) =>
								rebuild((entries) => entries.map(([k, v]) => (k === key ? [k, event.target.value] : [k, v])))
							}
							placeholder="参数值"
							className="h-8 text-sm"
						/>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
							onClick={() => rebuild((entries) => entries.filter(([k]) => k !== key))}
							aria-label={`删除参数 ${chineseLabel ?? key}`}
						>
							<Trash2Icon className="size-4" />
						</Button>
					</div>
				)
			})}
			<Button type="button" variant="outline" onClick={addRow} className="justify-start gap-1.5">
				<PlusIcon className="size-4" />
				添加一行
			</Button>
		</div>
	)
}
