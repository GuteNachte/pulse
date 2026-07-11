import { ContainerIcon, CopyIcon, DownloadIcon, MonitorCogIcon, RefreshCwIcon, RocketIcon } from "lucide-react"
import { useState } from "react"
import { Link } from "@/components/router"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { copyToClipboard } from "@/lib/utils"
import { MobileList, MobileListItem, MobileSection, MobileStatusTag, type MobileStatusTone } from "./mobile-ui"

export type MobileAgentPlatformItem = {
	id: string
	title: string
	description: string
	icon: "windows" | "linux"
	badges: string[]
	commandLabel: string
	command: string
	actions?: MobileAgentInstallAction[]
	capability: {
		badge: string
		collect: string[]
		operate: string[]
	}
	updateStats: {
		upgradeable: number
		current: number
		blocked: number
	}
	summaries: MobileAgentUpdateItem[]
	releases: MobileAgentReleaseItem[]
	emptySummaryText: string
	emptyReleaseText: string
}

export type MobileAgentInstallAction = {
	id: string
	title: string
	description: string
	label: string
	content: string
	filename?: string
	downloadLabel?: string
	badges?: string[]
}

export type MobileAgentUpdateItem = {
	id: string
	systemName: string
	systemHref: string
	statusLabel: string
	statusTone: MobileStatusTone
	precheckLabel?: string
	precheckTone?: MobileStatusTone
	lastFailed: boolean
	reason: string
	currentVersion: string
	targetVersion: string
	platformLabel: string
	lastUpdateStatus?: "succeeded" | "failed"
	lastUpdateLabel?: string
	lastUpdateDetail?: string
	actionLabel: string
	canRequest: boolean
	updating: boolean
	onRequest: () => void
}

export type MobileAgentReleaseItem = {
	id: string
	version: string
	statusLabel: string
	statusTone: MobileStatusTone
	meta: string
	notes?: string
	disabledReason?: string
	downloadUrl?: string
}

export function MobileAgentPlatformList({ items }: { items: MobileAgentPlatformItem[] }) {
	return (
		<div className="grid gap-4 md:hidden">
			{items.map((item) => (
				<MobileAgentPlatformCard key={item.id} item={item} />
			))}
		</div>
	)
}

function MobileAgentPlatformCard({ item }: { item: MobileAgentPlatformItem }) {
	const Icon = item.icon === "windows" ? MonitorCogIcon : ContainerIcon
	const [commandOpen, setCommandOpen] = useState(false)
	const actions = item.actions?.length
		? item.actions
		: [
				{
					id: item.id,
					title: item.title,
					description: "复制当前安装模板到目标机器执行。",
					label: "复制",
					content: item.command,
				},
			]

	return (
		<section className="grid gap-3 rounded-lg border border-border/70 bg-surface-soft p-3">
			<div className="rounded-md border border-border/70 bg-card p-3">
				<div className="flex min-w-0 items-start gap-3">
					<div className="grid size-10 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft">
						<Icon className="size-4 text-muted-foreground" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="text-[15px] font-semibold leading-tight ">{item.title}</div>
						<p className="mt-1 text-pretty text-xs leading-relaxed text-muted-foreground">{item.description}</p>
						<div className="mt-2 flex flex-wrap gap-1.5">
							{item.badges.map((badge) => (
								<Badge key={badge} variant="outline" className="h-5 px-1.5 text-[11px]">
									{badge}
								</Badge>
							))}
						</div>
					</div>
				</div>
			</div>

			<div className="flex flex-wrap items-center gap-1.5 rounded-md bg-card px-3 py-2 text-xs text-muted-foreground">
				<MobileAgentInlineStat
					label="有更新"
					value={item.updateStats.upgradeable}
					tone={item.updateStats.upgradeable ? "warning" : "default"}
				/>
				<MobileAgentInlineStat label="已最新" value={item.updateStats.current} />
				<MobileAgentInlineStat
					label="阻塞"
					value={item.updateStats.blocked}
					tone={item.updateStats.blocked ? "destructive" : "default"}
				/>
			</div>

			<div className="grid gap-2 rounded-md bg-card p-3">
				<div className="flex items-center justify-between gap-2">
					<div className="text-sm font-medium">安装方式</div>
					<Badge variant="outline">{item.commandLabel}</Badge>
				</div>
				<div className="grid grid-cols-2 gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="min-h-10 justify-center"
						onClick={() => setCommandOpen((open) => !open)}
					>
						{commandOpen ? "收起模板" : "展开模板"}
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="min-h-10 justify-center"
						onClick={() => copyToClipboard(item.command)}
					>
						<CopyIcon className="me-1.5 size-4" />
						复制默认
					</Button>
				</div>
				{commandOpen && (
					<pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/70 bg-surface-soft p-3 font-mono text-xs leading-relaxed text-muted-foreground">
						{item.command}
					</pre>
				)}
				{actions.length > 1 && (
					<div className="mt-2 grid gap-2">
						{actions.map((action) => (
							<div key={action.id} className="rounded-md border border-border/70 bg-surface-soft p-3">
								<div className="text-sm font-medium">{action.title}</div>
								<p className="mt-1 text-xs leading-relaxed text-muted-foreground">{action.description}</p>
								{action.badges?.length ? (
									<div className="mt-2 flex flex-wrap gap-1.5">
										{action.badges.map((badge) => (
											<Badge
												key={badge}
												variant="outline"
												className="h-auto min-h-6 whitespace-normal text-left text-[11px]"
											>
												{badge}
											</Badge>
										))}
									</div>
								) : null}
								<div className="mt-3 grid grid-cols-2 gap-2">
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="min-h-10 justify-center bg-card"
										onClick={() => copyToClipboard(action.content)}
									>
										<CopyIcon className="me-1.5 size-4" />
										{action.label}
									</Button>
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="min-h-10 justify-center bg-card"
										disabled={!action.filename}
										onClick={() => action.filename && downloadTextFile(action.filename, action.content)}
									>
										<DownloadIcon className="me-1.5 size-4" />
										{action.downloadLabel || "下载"}
									</Button>
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			<MobileAgentCapabilityBlock item={item} />
			<MobileAgentUpdatesBlock item={item} />
			<MobileAgentReleaseBlock item={item} />
		</section>
	)
}

function downloadTextFile(filename: string, content: string) {
	const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
	const url = URL.createObjectURL(blob)
	const link = document.createElement("a")
	link.href = url
	link.download = filename
	document.body.appendChild(link)
	link.click()
	document.body.removeChild(link)
	URL.revokeObjectURL(url)
}

function MobileAgentCapabilityBlock({ item }: { item: MobileAgentPlatformItem }) {
	return (
		<div className="grid gap-2 rounded-md bg-card p-3">
			<div className="flex items-center justify-between gap-2">
				<div className="text-sm font-medium">支持功能</div>
				<Badge variant="outline">{item.capability.badge}</Badge>
			</div>
			<MobileAgentCapabilityChips title="采集" items={item.capability.collect} />
			<MobileAgentCapabilityChips title="操作" items={item.capability.operate} />
		</div>
	)
}

function MobileAgentCapabilityChips({ title, items }: { title: string; items: string[] }) {
	return (
		<div className="grid gap-1.5">
			<div className="text-xs text-muted-foreground">{title}</div>
			<div className="flex flex-wrap gap-1.5">
				{items.map((item) => (
					<Badge key={item} variant="secondary" className="h-auto min-h-6 whitespace-normal text-left font-normal">
						{item}
					</Badge>
				))}
			</div>
		</div>
	)
}

function MobileAgentUpdatesBlock({ item }: { item: MobileAgentPlatformItem }) {
	return (
		<MobileSection title="Agent 更新" count={`${item.summaries.length} 台`}>
			{item.summaries.length ? (
				<MobileList>
					{item.summaries.map((summary) => (
						<MobileAgentUpdateCard key={summary.id} item={summary} />
					))}
				</MobileList>
			) : (
				<div className="rounded-md bg-card px-3 py-4 text-sm text-muted-foreground shadow-none">
					{item.emptySummaryText}
				</div>
			)}
		</MobileSection>
	)
}

function MobileAgentUpdateCard({ item }: { item: MobileAgentUpdateItem }) {
	return (
		<MobileListItem>
			<div className="flex min-w-0 items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					<Link
						href={item.systemHref}
						className="-my-2 -ms-2 inline-flex min-h-10 max-w-full items-center rounded-md px-2 text-[15px] font-semibold transition-[background-color,color,transform] hover:bg-surface-soft hover:text-foreground active:scale-[0.96]"
					>
						<span className="truncate">{item.systemName}</span>
					</Link>
					<p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.reason}</p>
				</div>
				<MobileStatusTag tone={item.statusTone}>{item.statusLabel}</MobileStatusTag>
			</div>
			<div className="mt-3 flex flex-wrap gap-1.5">
				{item.precheckLabel && (
					<MobileStatusTag tone={item.precheckTone ?? "neutral"}>{item.precheckLabel}</MobileStatusTag>
				)}
				{item.lastFailed && <MobileStatusTag tone="danger">上次失败</MobileStatusTag>}
				<Badge variant="outline">实际 {item.currentVersion || "未知"}</Badge>
				<Badge variant="outline">目标 {item.targetVersion || "无"}</Badge>
				<Badge variant="outline">{item.platformLabel}</Badge>
			</div>
			{item.statusLabel === "更新中" && <MobileInlineProgress />}
			{item.lastUpdateLabel && (
				<div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
					<MobileStatusTag tone={item.lastUpdateStatus === "failed" ? "danger" : "success"}>
						{item.lastUpdateLabel}
					</MobileStatusTag>
					{item.lastUpdateDetail && <span className="min-w-0 break-words">{item.lastUpdateDetail}</span>}
				</div>
			)}
			<Button
				type="button"
				variant="outline"
				size="sm"
				className="mt-3 min-h-10 w-full justify-center"
				disabled={!item.canRequest || item.updating}
				onClick={item.onRequest}
			>
				<RocketIcon className="me-1.5 size-4" />
				{item.actionLabel}
			</Button>
		</MobileListItem>
	)
}

function MobileInlineProgress() {
	return (
		<div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-strong">
			<div className="operation-progress-bar h-full w-1/3 rounded-full bg-primary" />
		</div>
	)
}

function MobileAgentReleaseBlock({ item }: { item: MobileAgentPlatformItem }) {
	return (
		<MobileSection title="版本仓库" count={`${item.releases.length} 个`}>
			{item.releases.length ? (
				<MobileList>
					{item.releases.map((release) => (
						<MobileAgentReleaseCard key={release.id} item={release} />
					))}
				</MobileList>
			) : (
				<div className="rounded-md bg-card px-3 py-4 text-sm text-muted-foreground shadow-none">
					{item.emptyReleaseText}
				</div>
			)}
		</MobileSection>
	)
}

function MobileAgentReleaseCard({ item }: { item: MobileAgentReleaseItem }) {
	return (
		<MobileListItem>
			<div className="flex min-w-0 items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					<div className="truncate text-[15px] font-semibold">{item.version}</div>
					<div className="mt-1 text-xs text-muted-foreground">{item.meta}</div>
				</div>
				<MobileStatusTag tone={item.statusTone}>{item.statusLabel}</MobileStatusTag>
			</div>
			{item.notes && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.notes}</p>}
			{item.disabledReason && (
				<p className="mt-2 text-xs leading-relaxed text-muted-foreground">禁用原因：{item.disabledReason}</p>
			)}
			{item.downloadUrl && (
				<div className="mt-2 flex gap-1.5 break-all font-mono text-xs leading-relaxed text-muted-foreground">
					<DownloadIcon className="mt-0.5 size-3.5 shrink-0" />
					{item.downloadUrl}
				</div>
			)}
		</MobileListItem>
	)
}

export function MobileAgentStatusSummary({
	upgradeable,
	current,
	blocked,
	skipped,
	onRefresh,
}: {
	upgradeable: number
	current: number
	blocked: number
	skipped: number
	onRefresh: () => void
}) {
	return (
		<section className="grid gap-3 rounded-lg border border-border/70 bg-surface-soft p-3">
			<div className="grid grid-cols-2 gap-2">
				<MobileAgentStatusTile label="有更新" value={upgradeable} tone={upgradeable ? "warning" : "default"} />
				<MobileAgentStatusTile label="已最新" value={current} />
				<MobileAgentStatusTile label="阻塞" value={blocked} tone={blocked ? "destructive" : "default"} />
				<MobileAgentStatusTile label="跳过" value={skipped} />
			</div>
			<Button variant="outline" size="sm" className="min-h-10 w-full justify-center bg-card" onClick={onRefresh}>
				<RefreshCwIcon className="me-2 size-4" />
				刷新版本
			</Button>
		</section>
	)
}

function MobileAgentStatusTile({
	label,
	value,
	tone = "default",
}: {
	label: string
	value: number
	tone?: "default" | "warning" | "destructive"
}) {
	const valueClass =
		tone === "destructive"
			? "text-destructive"
			: tone === "warning"
				? "text-amber-700 dark:text-amber-300"
				: "text-foreground"
	return (
		<div className="rounded-md bg-card px-3 py-2.5">
			<div className="text-xs text-muted-foreground">{label}</div>
			<div className={`mt-1 text-lg font-semibold leading-none tabular-nums ${valueClass}`}>{value}</div>
		</div>
	)
}

function MobileAgentInlineStat({
	label,
	value,
	tone = "default",
}: {
	label: string
	value: number
	tone?: "default" | "warning" | "destructive"
}) {
	const valueClass =
		tone === "destructive"
			? "text-destructive"
			: tone === "warning"
				? "text-amber-700 dark:text-amber-300"
				: "text-foreground"
	return (
		<span className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-surface-soft px-2 py-1">
			<span>{label}</span>
			<span className={`font-semibold tabular-nums ${valueClass}`}>{value}</span>
		</span>
	)
}
