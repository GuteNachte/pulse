import { t } from "@lingui/core/macro"
import { Trans } from "@lingui/react/macro"
import { redirectPage } from "@nanostores/router"
import {
	AlertTriangleIcon,
	CopyIcon,
	KeyIcon,
	MoreHorizontalIcon,
	RotateCwIcon,
	ServerIcon,
	ShieldCheckIcon,
	Trash2Icon,
	WifiIcon,
} from "lucide-react"
import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { MobileAgentTokenList, type MobileAgentTokenItem } from "@/components/mobile/mobile-agent-tokens"
import { $router } from "@/components/router"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TableEmptyRow } from "@/components/ui/empty-state"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { toast } from "@/components/ui/use-toast"
import { isReadOnlyUser, pb } from "@/lib/api"
import { ConnectionType, SystemStatus } from "@/lib/enums"
import { syncAgentHubURLFromRuntime } from "@/lib/runtime-info"
import { copyToClipboard, getAgentHubURL, tokenMap } from "@/lib/utils"

type AgentTokenItem = {
	id: string
	system: string
	system_name: string
	token_preview: string
	status?: SystemStatus
	connection_type?: ConnectionType
	bound: boolean
}

const SettingsFingerprintsPage = memo(() => {
	if (isReadOnlyUser()) {
		redirectPage($router, "settings", { name: "general" })
	}
	const [fingerprints, setFingerprints] = useState<AgentTokenItem[]>([])
	const stats = useMemo(() => getTokenStats(fingerprints), [fingerprints])

	const loadFingerprints = useCallback(async () => {
		const data = await pb.send<{ items: AgentTokenItem[] }>("/api/pulse/agent-tokens", { requestKey: null })
		setFingerprints(data.items)
	}, [])

	useEffect(() => {
		loadFingerprints().catch((error) => {
			console.error(error)
			toast({ title: "加载 Agent Token 失败", description: "请稍后重试。", variant: "destructive" })
		})
	}, [loadFingerprints])

	useEffect(() => {
		let unsubscribe: (() => void) | undefined
		;(async () => {
			unsubscribe = await pb.collection("fingerprints").subscribe("*", () => {
				loadFingerprints().catch((error) => {
					console.error(error)
				})
			})
		})()
		return () => unsubscribe?.()
	}, [loadFingerprints])

	return (
		<>
			<SectionIntro stats={stats} />
			<SectionTable fingerprints={fingerprints} stats={stats} onRefresh={loadFingerprints} />
		</>
	)
})

const SectionIntro = memo(({ stats }: { stats: TokenStats }) => {
	return (
		<div className="hidden md:block">
			<div className="rounded-lg border border-border/70 bg-surface-soft p-2 shadow-none">
				<div className="rounded-md border border-border/70 bg-card p-3 shadow-none">
					<div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
						<div className="min-w-0">
							<h3 className="text-lg font-semibold ">Agent 接入 Token</h3>
							<p className="mt-1 max-w-2xl text-pretty text-sm text-muted-foreground">
								管理每台 Agent 的接入凭据、设备绑定和轮换动作。页面默认只显示 Token 摘要，完整 Token
								仅在复制安装配置时按需读取。
							</p>
						</div>
						<div className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border/70 bg-surface-soft px-3 text-xs text-muted-foreground shadow-none">
							<ShieldCheckIcon className="size-4" />
							<span>密钥默认脱敏</span>
						</div>
					</div>
				</div>
				<div className="mt-2 grid pulse-card-gap md:grid-cols-4">
					<TokenStatCard label="Token 总数" value={`${stats.total} 个`} detail="当前可见接入凭据" />
					<TokenStatCard label="已连接 Agent" value={`${stats.connected} 个`} detail="Agent 在线" />
					<TokenStatCard label="已绑定设备" value={`${stats.bound} 个`} detail="已记录设备指纹" />
					<TokenStatCard label="等待接入" value={`${stats.pending} 个`} detail="未完成 Agent 连接" />
				</div>
			</div>
		</div>
	)
})

const SectionTable = memo(
	({
		fingerprints = [],
		stats,
		onRefresh,
	}: {
		fingerprints: AgentTokenItem[]
		stats: TokenStats
		onRefresh: () => Promise<void>
	}) => {
		const isReadOnly = isReadOnlyUser()
		const mobileItems = useMemo<MobileAgentTokenItem[]>(
			() =>
				fingerprints.map((fingerprint) => {
					const status = getBindingStatus(fingerprint)
					return {
						id: fingerprint.id,
						systemName: fingerprint.system_name || fingerprint.system,
						tokenPreview: fingerprint.token_preview,
						statusLabel: status.label,
						statusTone: status.mobileTone,
						bound: fingerprint.bound,
					}
				}),
			[fingerprints]
		)
		const fingerprintById = useMemo(
			() => new Map(fingerprints.map((fingerprint) => [fingerprint.id, fingerprint])),
			[fingerprints]
		)

		const headerCols = useMemo(
			() => [
				{
					label: "设备",
					Icon: ServerIcon,
					w: "11em",
				},
				{
					label: "接入 Token",
					Icon: KeyIcon,
					w: "20em",
				},
				{
					label: "连接状态",
					Icon: WifiIcon,
					w: "14em",
				},
			],
			[]
		)
		const getFingerprintFromMobileItem = (item: MobileAgentTokenItem) => fingerprintById.get(item.id)
		const copyMobileYaml = async (item: MobileAgentTokenItem) => {
			const fingerprint = getFingerprintFromMobileItem(item)
			if (fingerprint) {
				await copyFingerprintYaml(fingerprint)
			}
		}
		const copyMobileEnv = async (item: MobileAgentTokenItem) => {
			const fingerprint = getFingerprintFromMobileItem(item)
			if (fingerprint) {
				await copyFingerprintEnv(fingerprint)
			}
		}
		const rotateMobileToken = (item: MobileAgentTokenItem) => {
			const fingerprint = getFingerprintFromMobileItem(item)
			if (fingerprint) {
				updateFingerprint(fingerprint, "rotate", onRefresh)
			}
		}
		const unbindMobileFingerprint = (item: MobileAgentTokenItem) => {
			const fingerprint = getFingerprintFromMobileItem(item)
			if (fingerprint) {
				updateFingerprint(fingerprint, "unbind", onRefresh)
			}
		}

		return (
			<>
				<MobileAgentTokenList
					items={mobileItems}
					stats={stats}
					onCopyYaml={copyMobileYaml}
					onCopyEnv={copyMobileEnv}
					onRotate={rotateMobileToken}
					onUnbind={unbindMobileFingerprint}
				/>
				<div className="mt-4 hidden rounded-lg border border-border/70 bg-surface-soft p-2 shadow-none md:block">
					<div className="mb-2 flex items-start gap-2 rounded-md border border-amber-500/25 bg-card px-3 py-2 text-sm text-amber-800 shadow-none dark:text-amber-300">
						<AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
						<div className="min-w-0">
							<div className="font-medium">敏感凭据</div>
							<p className="mt-0.5 text-pretty text-xs leading-relaxed">
								复制 YAML 或环境变量会读取完整 Token。轮换后旧 Token 立即失效，解除绑定后 Agent 需要重新完成设备绑定。
							</p>
						</div>
					</div>
					<div className="w-full overflow-auto rounded-md border border-border/70 bg-card shadow-none">
						<Table>
							<TableHeader className="bg-surface-soft">
								<TableRow className="border-border/70 bg-surface-soft hover:bg-surface-soft">
									{headerCols.map((col) => (
										<TableHead key={col.label} style={{ minWidth: col.w }}>
											<span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
												<col.Icon className="size-4" />
												{col.label}
											</span>
										</TableHead>
									))}
									{!isReadOnly && (
										<TableHead className="w-0">
											<span className="sr-only">
												<Trans>Actions</Trans>
											</span>
										</TableHead>
									)}
								</TableRow>
							</TableHeader>
							<TableBody>
								{fingerprints.length ? (
									fingerprints.map((fingerprint) => (
										<TableRow key={fingerprint.id} className="hover:bg-surface-soft">
											<TableCell className="max-w-60 py-3 ps-5">
												<div className="min-w-0">
													<div className="truncate font-medium">{fingerprint.system_name || fingerprint.system}</div>
													<div className="mt-1 text-xs text-muted-foreground">
														{fingerprint.bound ? "已绑定设备指纹" : "等待设备绑定"}
													</div>
												</div>
											</TableCell>
											<TableCell className="py-3">
												<div className="inline-flex max-w-full rounded-md bg-surface-soft px-2.5 py-1.5 font-mono text-xs text-muted-foreground shadow-none">
													<span className="truncate">{fingerprint.token_preview}</span>
												</div>
											</TableCell>
											<TableCell className="py-3">
												<BindingStatus fingerprint={fingerprint} />
											</TableCell>
											{!isReadOnly && (
												<TableCell className="px-4 py-3 xl:px-2">
													<ActionsButtonTable fingerprint={fingerprint} onRefresh={onRefresh} />
												</TableCell>
											)}
										</TableRow>
									))
								) : (
									<TableEmptyRow
										colSpan={isReadOnly ? 3 : 4}
										loading={false}
										loadingText="正在读取 Agent 接入 Token"
										emptyText="暂无 Agent 接入 Token"
									/>
								)}
							</TableBody>
						</Table>
					</div>
				</div>
			</>
		)
	}
)

function BindingStatus({ fingerprint }: { fingerprint: AgentTokenItem }) {
	const status = getBindingStatus(fingerprint)
	return (
		<Badge variant={status.badgeVariant} className="h-6 px-2.5">
			{status.label}
		</Badge>
	)
}

function getBindingStatus(fingerprint: AgentTokenItem): {
	label: string
	badgeVariant: "success" | "warning" | "outline"
	mobileTone: MobileAgentTokenItem["statusTone"]
} {
	const connectionType = fingerprint.connection_type
	const status = fingerprint.status
	if (connectionType === ConnectionType.WebSocket && status === SystemStatus.Up) {
		return { label: "Agent 已连接", badgeVariant: "success", mobileTone: "success" }
	}
	if (connectionType === ConnectionType.WebSocket) {
		return { label: "Agent 未连接", badgeVariant: "warning", mobileTone: "warning" }
	}
	return { label: "等待 Agent 连接", badgeVariant: "outline", mobileTone: "neutral" }
}

async function updateFingerprint(
	fingerprint: AgentTokenItem,
	action: "rotate" | "unbind",
	onRefresh: () => Promise<void>
) {
	try {
		await pb.send(`/api/pulse/agent-tokens/${encodeURIComponent(fingerprint.id)}/${action}`, {
			method: "POST",
			requestKey: null,
		})
		tokenMap.delete(fingerprint.system)
		toast({
			title: action === "rotate" ? "Token 已轮换" : "设备绑定已解除",
			description: action === "rotate" ? "旧 Token 已失效，Agent 需要使用新 Token 重新接入。" : "当前设备指纹已清空。",
		})
		await onRefresh()
	} catch (error: unknown) {
		toast({
			title: t`Error`,
			description: (error as Error).message,
		})
	}
}

const ActionsButtonTable = memo(
	({ fingerprint, onRefresh }: { fingerprint: AgentTokenItem; onRefresh: () => Promise<void> }) => {
		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="icon" className="size-10 transition-transform active:scale-[0.96]" data-nolink>
						<span className="sr-only">
							<Trans>Open menu</Trans>
						</span>
						<MoreHorizontalIcon className="w-5" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onClick={() => copyFingerprintYaml(fingerprint)}>
						<CopyIcon className="me-2.5 size-4" />
						复制 YAML
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => copyFingerprintEnv(fingerprint)}>
						<CopyIcon className="me-2.5 size-4" />
						复制环境变量
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem onSelect={() => updateFingerprint(fingerprint, "rotate", onRefresh)}>
						<RotateCwIcon className="me-2.5 size-4" />
						轮换接入 Token
					</DropdownMenuItem>
					{fingerprint.bound && (
						<DropdownMenuItem onSelect={() => updateFingerprint(fingerprint, "unbind", onRefresh)}>
							<Trash2Icon className="me-2.5 size-4" />
							解除当前设备绑定
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		)
	}
)

async function getAgentTokenSecret(fingerprint: AgentTokenItem) {
	const data = await pb.send<{ system: string; token: string }>(
		`/api/pulse/agent-tokens/${encodeURIComponent(fingerprint.id)}/secret`,
		{ requestKey: null }
	)
	tokenMap.set(data.system, data.token)
	return data.token
}

async function getFingerprintEnvVar(fingerprint: AgentTokenItem) {
	const token = await getAgentTokenSecret(fingerprint)
	try {
		const info = await syncAgentHubURLFromRuntime()
		return `HUB_URL=${info.agent_hub_url || getAgentHubURL()}\nTOKEN=${token}`
	} catch (error) {
		console.error(error)
		return `HUB_URL=${getAgentHubURL()}\nTOKEN=${token}`
	}
}

async function copyFingerprintEnv(fingerprint: AgentTokenItem) {
	await copyToClipboard(await getFingerprintEnvVar(fingerprint))
}

async function copyFingerprintYaml(fingerprint: AgentTokenItem) {
	await copyToClipboard((await getFingerprintEnvVar(fingerprint)).replaceAll("=", ": "))
}

type TokenStats = {
	total: number
	connected: number
	bound: number
	pending: number
}

function getTokenStats(items: AgentTokenItem[]): TokenStats {
	const connected = items.filter(
		(item) => item.connection_type === ConnectionType.WebSocket && item.status === SystemStatus.Up
	).length
	const bound = items.filter((item) => item.bound).length
	return {
		total: items.length,
		connected,
		bound,
		pending: Math.max(0, items.length - connected),
	}
}

function TokenStatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
	return (
		<div className="min-w-0 rounded-md bg-card px-3 py-2.5 shadow-none">
			<div className="text-xs text-muted-foreground">{label}</div>
			<div className="mt-1 truncate text-lg font-semibold tabular-nums">{value}</div>
			<div className="mt-1 truncate text-xs text-muted-foreground">{detail}</div>
		</div>
	)
}

export default SettingsFingerprintsPage
