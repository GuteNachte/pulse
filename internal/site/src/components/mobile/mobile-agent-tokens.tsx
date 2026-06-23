import { AlertTriangleIcon, CopyIcon, RotateCwIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	MobileList,
	MobileListItem,
	MobileEmptyState,
	MobileSection,
	MobileStatusTag,
	MobileSummaryStrip,
	type MobileStatusTone,
} from "./mobile-ui"

export type MobileAgentTokenItem = {
	id: string
	systemName: string
	tokenPreview: string
	statusLabel: string
	statusTone: MobileStatusTone
	bound: boolean
}

export function MobileAgentTokenList({
	items,
	stats,
	onCopyYaml,
	onCopyEnv,
	onRotate,
	onUnbind,
}: {
	items: MobileAgentTokenItem[]
	stats: { total: number; connected: number; bound: number; pending: number }
	onCopyYaml: (item: MobileAgentTokenItem) => void
	onCopyEnv: (item: MobileAgentTokenItem) => void
	onRotate: (item: MobileAgentTokenItem) => void
	onUnbind: (item: MobileAgentTokenItem) => void
}) {
	return (
		<div className="grid gap-3 md:hidden">
			<div className="rounded-lg border border-border/70 bg-surface-soft p-2">
				<div className="px-1 py-1.5">
					<div className="text-[15px] font-semibold leading-tight">Agent 接入 Token</div>
					<p className="mt-1 text-pretty text-xs leading-relaxed text-muted-foreground">
						默认只显示摘要。复制 YAML 或环境变量时才会读取完整 Token。
					</p>
				</div>
				<MobileSummaryStrip
					className="mt-2"
					items={[
						{ label: "全部", value: stats.total },
						{ label: "已连接", value: stats.connected, tone: stats.connected ? "success" : "neutral" },
						{ label: "已绑定", value: stats.bound, tone: stats.bound ? "info" : "neutral" },
					]}
				/>
				<div className="mt-2 flex items-start gap-2 rounded-md border border-amber-500/25 bg-card px-3 py-2 text-xs leading-relaxed text-muted-foreground">
					<AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-300" />
					<span className="text-pretty">轮换会让旧 Token 立即失效；解绑后 Agent 需要重新完成设备绑定。</span>
				</div>
			</div>
			<MobileSection title="接入 Token" count={`${items.length} 个`}>
				{items.length ? (
					<MobileList>
						{items.map((item) => (
							<MobileAgentTokenCard
								key={item.id}
								item={item}
								onCopyYaml={() => onCopyYaml(item)}
								onCopyEnv={() => onCopyEnv(item)}
								onRotate={() => onRotate(item)}
								onUnbind={() => onUnbind(item)}
							/>
						))}
					</MobileList>
				) : (
					<MobileEmptyState>暂无 Agent 接入 Token</MobileEmptyState>
				)}
			</MobileSection>
		</div>
	)
}

function MobileAgentTokenCard({
	item,
	onCopyYaml,
	onCopyEnv,
	onRotate,
	onUnbind,
}: {
	item: MobileAgentTokenItem
	onCopyYaml: () => void
	onCopyEnv: () => void
	onRotate: () => void
	onUnbind: () => void
}) {
	return (
		<MobileListItem className="bg-card">
			<div className="grid min-w-0 gap-2">
				<div className="flex min-w-0 items-start justify-between gap-3">
					<div className="min-w-0 flex-1">
						<div className="truncate text-[15px] font-semibold">{item.systemName}</div>
						<div className="mt-1 text-xs text-muted-foreground">{item.bound ? "已绑定设备指纹" : "等待设备绑定"}</div>
					</div>
					<MobileStatusTag tone={item.statusTone}>{item.statusLabel}</MobileStatusTag>
				</div>
				<div className="break-all rounded-md bg-surface-soft px-3 py-2 font-mono text-xs leading-relaxed text-muted-foreground">
					{item.tokenPreview}
				</div>
			</div>
			<div className="mt-3 grid grid-cols-2 gap-2 rounded-md bg-surface-soft p-1.5">
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="min-h-10 justify-center bg-card transition-transform active:scale-[0.96]"
					onClick={onCopyYaml}
				>
					<CopyIcon className="me-1.5 size-4" />
					YAML
				</Button>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="min-h-10 justify-center bg-card transition-transform active:scale-[0.96]"
					onClick={onCopyEnv}
				>
					<CopyIcon className="me-1.5 size-4" />
					环境变量
				</Button>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="min-h-10 justify-center bg-card transition-transform active:scale-[0.96]"
					onClick={onRotate}
				>
					<RotateCwIcon className="me-1.5 size-4" />
					轮换
				</Button>
				{item.bound ? (
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="min-h-10 justify-center bg-card text-destructive transition-transform hover:text-destructive active:scale-[0.96]"
						onClick={onUnbind}
					>
						<Trash2Icon className="me-1.5 size-4" />
						解绑
					</Button>
				) : (
					<div className="flex min-h-10 items-center justify-center rounded-md bg-card px-3 text-center text-xs font-medium text-muted-foreground">
						未绑定
					</div>
				)}
			</div>
		</MobileListItem>
	)
}
