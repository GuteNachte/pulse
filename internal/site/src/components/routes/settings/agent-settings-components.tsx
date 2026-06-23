import { getPagePath } from "@nanostores/router"
import {
	ChevronDownIcon,
	ContainerIcon,
	CopyIcon,
	DownloadIcon,
	FileCode2Icon,
	FolderIcon,
	MonitorCogIcon,
	RocketIcon,
	SlidersHorizontalIcon,
} from "lucide-react"
import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import { OperationConfirmDialog } from "@/components/operation-confirm-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { $router, Link } from "@/components/router"
import {
	AGENT_VERSION,
	buildWindowsAgentFullInstallScript,
	buildDefaultWindowsAgentDownloadURL,
	buildLinuxAgentPairCompose,
	buildUnraidAgentTemplate,
	buildWindowsInstallCommand,
	DEFAULT_WINDOWS_AGENT_INSTALL_OPTIONS,
	DEFAULT_LINUX_AGENT_DATA_DIR,
	DEFAULT_LINUX_AGENT_IMAGE,
	FLYNAS_LINUX_AGENT_DATA_DIR,
	type LinuxAgentDockerSocketMode,
	type LinuxAgentInstallOptions,
	getLinuxInstallDefaults,
	UNRAID_LINUX_AGENT_DATA_DIR,
	type WindowsAgentInstallOptions,
} from "@/lib/agent-install"
import { isReadOnlyUser } from "@/lib/api"
import { SystemStatus } from "@/lib/enums"
import { cn, copyToClipboard } from "@/lib/utils"
import { compareVersionStrings, selectAgentUpdateTarget } from "../system/agent-update-utils"
import type { InstallProfile } from "./agent-install-profiles"
import type { AgentReleaseRecord, SystemUpdateSummary } from "./agent-update-summary"

type AgentInstallTarget = "windows-host" | "linux-generic" | "flynas" | "unraid"
type WindowsPreviewMode = "command" | "script"

const linuxInstallTargetMeta = {
	"linux-generic": {
		label: "通用 Linux",
		title: "Linux 通用容器版",
		dataDir: DEFAULT_LINUX_AGENT_DATA_DIR,
		filename: "pulse-agent-linux.yml",
		downloadLabel: "下载 yml",
	},
	flynas: {
		label: "飞牛 / NAS",
		title: "飞牛 / NAS 容器版",
		dataDir: FLYNAS_LINUX_AGENT_DATA_DIR,
		filename: "pulse-agent-flynas.yml",
		downloadLabel: "下载 yml",
	},
	unraid: {
		label: "Unraid",
		title: "Unraid XML 下载命令",
		dataDir: UNRAID_LINUX_AGENT_DATA_DIR,
		filename: "pulse-agent-unraid.xml.cmd",
		downloadLabel: "下载命令",
	},
} satisfies Record<
	Exclude<AgentInstallTarget, "windows-host">,
	{ label: string; title: string; dataDir: string; filename: string; downloadLabel: string }
>

const defaultInstallOptions = {
	dockerSocketMode: "rw",
	includeHostRoot: true,
	includeDmi: true,
	includeGpu: true,
} satisfies Required<LinuxAgentInstallOptions>

type AgentPlatformColumnProps = {
	icon: typeof RocketIcon
	title: string
	description: string
	profile: InstallProfile
	summaries: SystemUpdateSummary[]
	releases: AgentReleaseRecord[]
	platformLabel: string
	emptyReleaseText: string
	emptySummaryText: string
	updatingSystemId: string
	requestedUpdateTargets: Record<string, string>
	onRequestUpdate: (item: SystemUpdateSummary) => void
	capabilityGroup: (typeof agentCapabilityGroups)[number]
}

export function AgentPlatformColumn({
	icon: Icon,
	title,
	description,
	profile,
	capabilityGroup,
	summaries,
	releases,
	platformLabel,
	emptyReleaseText,
	emptySummaryText,
	updatingSystemId,
	requestedUpdateTargets,
	onRequestUpdate,
}: AgentPlatformColumnProps) {
	const upgradeable = summaries.filter((item) => item.updateKind === "upgrade" && item.precheckStatus === "ready")
	const current = summaries.filter((item) => item.updateKind === "current")
	const blocked = summaries.filter((item) => item.precheckStatus === "blocked")

	return (
		<section className="grid content-start gap-3 overflow-hidden rounded-lg border border-border/70 bg-surface-soft shadow-none">
			<div className="border-b border-border/70 bg-card px-4 py-3">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="min-w-0">
						<div className="flex items-center gap-2 text-base font-semibold tracking-tight">
							<span className="grid size-8 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft">
								<Icon className="size-4 text-muted-foreground" />
							</span>
							{title}
						</div>
						<p className="mt-2 text-pretty text-xs leading-relaxed text-muted-foreground">{description}</p>
					</div>
					<Badge variant="outline">Agent {AGENT_VERSION}</Badge>
				</div>
			</div>

			<div className="grid gap-3 p-3">
				<SectionBlock title="安装方式">
					<div className="mb-2 flex flex-wrap gap-2">
						<Badge variant="outline">Agent 主动连接 Hub</Badge>
						<Badge variant="outline">每台机器独立 Token</Badge>
					</div>
					<InstallProfileCard profile={profile} />
				</SectionBlock>

				<SectionBlock title="支持功能">
					<CapabilityGroupCard group={capabilityGroup} />
				</SectionBlock>

				<SectionBlock
					title="Agent 更新"
					actions={
						<div className="flex flex-wrap gap-1.5">
							<Badge variant={upgradeable.length ? "warning" : "outline"}>有更新 {upgradeable.length}</Badge>
							<Badge variant="outline">已最新 {current.length}</Badge>
							<Badge variant={blocked.length ? "destructive" : "outline"}>阻塞 {blocked.length}</Badge>
						</div>
					}
				>
					<div className="grid gap-2">
						{summaries.length ? (
							summaries.map((item) => (
								<SystemUpdateRow
									key={item.system.id}
									item={item}
									updating={updatingSystemId === item.system.id}
									requestedTargetVersion={requestedUpdateTargets[item.system.id]}
									onRequest={() => onRequestUpdate(item)}
								/>
							))
						) : (
							<p className="rounded-lg border border-border/70 bg-card p-3 text-sm text-muted-foreground shadow-none">
								{emptySummaryText}
							</p>
						)}
					</div>
				</SectionBlock>

				<SectionBlock title="版本仓库">
					<ReleaseRepository releases={releases} platformLabel={platformLabel} emptyText={emptyReleaseText} />
				</SectionBlock>
			</div>
		</section>
	)
}

export function AgentInstallWorkbench({ releases, hubUrl }: { releases: AgentReleaseRecord[]; hubUrl: string }) {
	const [target, setTarget] = useState<AgentInstallTarget>("linux-generic")
	const [windowsPreviewMode, setWindowsPreviewMode] = useState<WindowsPreviewMode>("command")
	const [windowsOptions, setWindowsOptions] = useState<Required<WindowsAgentInstallOptions>>(
		DEFAULT_WINDOWS_AGENT_INSTALL_OPTIONS
	)
	const [dataDirs, setDataDirs] = useState(() => ({
		"linux-generic": DEFAULT_LINUX_AGENT_DATA_DIR,
		flynas: FLYNAS_LINUX_AGENT_DATA_DIR,
		unraid: UNRAID_LINUX_AGENT_DATA_DIR,
	}))
	const [installOptions, setInstallOptions] = useState<Required<LinuxAgentInstallOptions>>(defaultInstallOptions)
	const windowsRelease = useMemo(() => selectAgentUpdateTarget(releases, "windows", "amd64").target, [releases])
	const linuxRelease = useMemo(() => selectAgentUpdateTarget(releases, "linux", "amd64").target, [releases])
	const windowsVersion = windowsRelease?.version || AGENT_VERSION
	const linuxVersion = linuxRelease?.version || AGENT_VERSION
	const windowsDownloadUrl = windowsRelease?.download_url || buildDefaultWindowsAgentDownloadURL(hubUrl)
	const linuxImage = linuxRelease?.download_url || DEFAULT_LINUX_AGENT_IMAGE
	const isLinuxTarget = target !== "windows-host"
	const selectedLinuxTarget = isLinuxTarget ? linuxInstallTargetMeta[target] : null
	const preview = useMemo(() => {
		if (target === "windows-host") {
			const release = {
				version: windowsVersion,
				url: windowsDownloadUrl,
			}
			if (windowsPreviewMode === "script") {
				return buildWindowsAgentFullInstallScript({
					token: "<TOKEN>",
					agentHubURL: hubUrl,
					release,
					options: windowsOptions,
				})
			}
			return buildWindowsInstallCommand("<TOKEN>", hubUrl, release, windowsOptions)
		}
		const meta = linuxInstallTargetMeta[target]
		const dataDir = dataDirs[target]
		const defaults = getLinuxInstallDefaults(target)
		if (target === "unraid") {
			return buildUnraidAgentTemplate({
				token: "<TOKEN>",
				agentHubURL: hubUrl,
				image: linuxImage,
				version: linuxVersion,
				dataDir,
				installOptions,
			})
		}
		return buildLinuxAgentPairCompose({
			code: "<TOKEN>",
			agentHubURL: hubUrl,
			image: linuxImage,
			version: linuxVersion,
			dataDir,
			title: defaults.title,
			includeHeader: true,
			installOptions,
		})
	}, [
		target,
		hubUrl,
		windowsVersion,
		windowsDownloadUrl,
		windowsPreviewMode,
		windowsOptions,
		dataDirs,
		linuxImage,
		linuxVersion,
		installOptions,
	])
	const previewFilename =
		target === "windows-host"
			? windowsPreviewMode === "script"
				? "pulse-agent-windows.ps1"
				: undefined
			: selectedLinuxTarget?.filename

	useEffect(() => {
		if (target === "windows-host") return
		const defaultDir = linuxInstallTargetMeta[target].dataDir
		setDataDirs((current) => (current[target] ? current : { ...current, [target]: defaultDir }))
	}, [target])

	const updateOption = <K extends keyof Required<LinuxAgentInstallOptions>>(
		key: K,
		value: Required<LinuxAgentInstallOptions>[K]
	) => {
		setInstallOptions((current) => ({ ...current, [key]: value }))
	}
	const updateWindowsOption = <K extends keyof Required<WindowsAgentInstallOptions>>(
		key: K,
		value: Required<WindowsAgentInstallOptions>[K]
	) => {
		setWindowsOptions((current) => ({ ...current, [key]: value }))
	}

	return (
		<section className="hidden overflow-hidden rounded-lg border border-border/70 bg-surface-soft shadow-none md:block">
			<div className="border-b border-border/70 bg-card px-5 py-4">
				<div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
					<div className="min-w-0">
						<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
							<span className="grid size-8 place-items-center rounded-md border border-border/70 bg-surface-soft">
								<SlidersHorizontalIcon className="size-4 text-muted-foreground" />
							</span>
							Agent 安装工作台
						</div>
						<p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
							选择目标平台和开放给容器的采集入口，右侧安装模板会实时变化；真实可用能力仍以 Agent 上报的采集诊断为准。
						</p>
					</div>
					<Badge variant="outline" className="rounded-md">
						Agent {AGENT_VERSION}
					</Badge>
				</div>
			</div>

			<div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(520px,1.2fr)]">
				<div className="grid content-start gap-3">
					<WorkbenchPanel title="安装目标" icon={MonitorCogIcon}>
						<Tabs value={target} onValueChange={(value) => setTarget(value as AgentInstallTarget)}>
							<TabsList className="grid w-full grid-cols-4">
								<TabsTrigger value="windows-host">Windows</TabsTrigger>
								<TabsTrigger value="linux-generic">Linux</TabsTrigger>
								<TabsTrigger value="flynas">飞牛</TabsTrigger>
								<TabsTrigger value="unraid">Unraid</TabsTrigger>
							</TabsList>
						</Tabs>
						<div className="grid gap-2 rounded-md bg-surface-soft p-3 text-sm text-muted-foreground">
							<div className="font-medium text-foreground">
								{target === "windows-host" ? "Windows 主机版" : getLinuxInstallDefaults(target).title}
							</div>
							<p className="leading-relaxed">
								{target === "windows-host"
									? "安装为 Windows Service，采集能力由主机权限、Windows API 和 Agent 运行状态决定。"
									: target === "unraid"
										? "先运行下载命令，把 XML 模板写入 Unraid 的模板目录，再在 Docker 页面导入使用。"
										: "先固定专用数据目录，再通过配对模板或直接运行命令启动。容器版通过挂载、设备映射和 capability 决定可接触的宿主机信息。"}
							</p>
						</div>
					</WorkbenchPanel>

					{target === "windows-host" && (
						<>
							<WorkbenchPanel title="脚本形态" icon={FileCode2Icon}>
								<Tabs
									value={windowsPreviewMode}
									onValueChange={(value) => setWindowsPreviewMode(value as WindowsPreviewMode)}
								>
									<TabsList className="grid w-full grid-cols-2">
										<TabsTrigger value="command">一行命令</TabsTrigger>
										<TabsTrigger value="script">完整脚本</TabsTrigger>
									</TabsList>
								</Tabs>
								<div className="rounded-md bg-surface-soft p-3 text-xs leading-relaxed text-muted-foreground">
									一行命令适合直接复制执行；完整脚本适合审阅、保存或手动调整后执行。两种形态使用同一组选项。
								</div>
							</WorkbenchPanel>

							<WorkbenchPanel title="安装参数" icon={FolderIcon}>
								<WindowsPathInput
									id="windows-agent-install-dir"
									label="安装目录"
									value={windowsOptions.installDir}
									onChange={(value) => updateWindowsOption("installDir", value)}
								/>
								<WindowsPathInput
									id="windows-agent-data-dir"
									label="数据目录"
									value={windowsOptions.dataDir}
									onChange={(value) => updateWindowsOption("dataDir", value)}
								/>
								<WindowsPathInput
									id="windows-agent-log-dir"
									label="日志目录"
									value={windowsOptions.logDir}
									onChange={(value) => updateWindowsOption("logDir", value)}
								/>
							</WorkbenchPanel>

							<WorkbenchPanel title="执行选项" icon={SlidersHorizontalIcon}>
								<CapabilitySwitch
									label="重装时清理旧数据"
									description="开启后脚本会删除旧 DATA_DIR 再重新配对；关闭后保留历史凭据和本地状态。"
									checked={windowsOptions.cleanData}
									onCheckedChange={(checked) => updateWindowsOption("cleanData", checked)}
								/>
								<CapabilitySwitch
									label="缺失时自动安装 NSSM"
									description="开启后会通过 WinGet 安装 NSSM；关闭后目标机器必须已经存在 nssm。"
									checked={windowsOptions.installNssm}
									onCheckedChange={(checked) => updateWindowsOption("installNssm", checked)}
								/>
								<CapabilitySwitch
									label="安装后立即启动服务"
									description="关闭后只注册 pulse-agent 服务，需要后续手动启动。"
									checked={windowsOptions.startService}
									onCheckedChange={(checked) => updateWindowsOption("startService", checked)}
								/>
								<CapabilitySwitch
									label="添加出站防火墙规则"
									description="默认关闭。仅在目标机器有严格出站限制时打开。"
									checked={windowsOptions.addFirewallRule}
									onCheckedChange={(checked) => updateWindowsOption("addFirewallRule", checked)}
								/>
							</WorkbenchPanel>
						</>
					)}

					{isLinuxTarget && selectedLinuxTarget && (
						<>
							<WorkbenchPanel title="数据目录" icon={FolderIcon}>
								<Label htmlFor="agent-data-dir" className="text-xs text-muted-foreground">
									Agent 专用数据目录
								</Label>
								<Input
									id="agent-data-dir"
									value={dataDirs[target]}
									onChange={(event) => setDataDirs((current) => ({ ...current, [target]: event.target.value }))}
									className="font-mono text-xs"
								/>
								<div className="text-xs leading-relaxed text-muted-foreground">
									当前预设：{selectedLinuxTarget.dataDir}
								</div>
							</WorkbenchPanel>

							<WorkbenchPanel title="采集入口" icon={SlidersHorizontalIcon}>
								<div className="grid gap-2">
									<div className="grid gap-1.5 rounded-md bg-surface-soft p-3">
										<div className="flex items-center justify-between gap-3">
											<div>
												<div className="text-sm font-medium">Docker socket</div>
												<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
													rw 可监控并控制容器，ro 只读监控，关闭后不会挂载 Docker socket。
												</p>
											</div>
											<Select
												value={installOptions.dockerSocketMode}
												onValueChange={(value) => updateOption("dockerSocketMode", value as LinuxAgentDockerSocketMode)}
											>
												<SelectTrigger className="w-32 bg-card">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="rw">读写</SelectItem>
													<SelectItem value="ro">只读</SelectItem>
													<SelectItem value="none">关闭</SelectItem>
												</SelectContent>
											</Select>
										</div>
									</div>

									<CapabilitySwitch
										label="宿主机只读挂载"
										description="挂载 /:/host:ro，给主机级指标、磁盘和部分 SMART 识别提供入口。"
										checked={installOptions.includeHostRoot}
										onCheckedChange={(checked) => updateOption("includeHostRoot", checked)}
									/>
									<CapabilitySwitch
										label="DMI / 内存硬件详情"
										description="挂载 /sys/firmware/dmi 和 /dev/mem，并加入 CAP_SYS_RAWIO。"
										checked={installOptions.includeDmi}
										onCheckedChange={(checked) => updateOption("includeDmi", checked)}
									/>
									<CapabilitySwitch
										label="GPU / 核显设备"
										description="映射 /dev/dri 并加入 CAP_PERFMON，用于 Intel / AMD 核显基础指标。"
										checked={installOptions.includeGpu}
										onCheckedChange={(checked) => updateOption("includeGpu", checked)}
									/>
								</div>
							</WorkbenchPanel>
							<WorkbenchPanel title="启动形态" icon={FileCode2Icon}>
								<div className="grid gap-2">
									<div className="grid gap-1.5 rounded-md bg-surface-soft p-3">
										<div className="text-sm font-medium">{target === "unraid" ? "模板下载" : "配对安装"}</div>
										<p className="text-xs leading-relaxed text-muted-foreground">
											{target === "unraid"
												? "先运行下载命令写入 XML 模板，再在 Unraid Docker 页面导入部署。"
												: "先执行一次性配对，再把生成的 token 写入专用数据目录。适合飞牛、Unraid 和通用 Linux 的标准接入。"}
										</p>
									</div>
									<div className="grid gap-1.5 rounded-md bg-surface-soft p-3">
										<div className="text-sm font-medium">直接运行</div>
										<p className="text-xs leading-relaxed text-muted-foreground">
											直接复制运行脚本，适合先做本机验证或自定义启动参数。
										</p>
									</div>
								</div>
							</WorkbenchPanel>
						</>
					)}
				</div>

				<div className="grid min-w-0 content-start gap-3">
					<WorkbenchPanel
						title="代码预览"
						icon={FileCode2Icon}
						actions={
							<div className="flex flex-wrap gap-2">
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="min-h-10 bg-card"
									onClick={() => copyToClipboard(preview)}
								>
									<CopyIcon className="me-2 size-4" />
									复制
								</Button>
								{previewFilename && (
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="min-h-10 bg-card"
										onClick={() => downloadTextFile(previewFilename, preview)}
									>
										<DownloadIcon className="me-2 size-4" />
										{selectedLinuxTarget?.downloadLabel || "下载"}
									</Button>
								)}
							</div>
						}
					>
						<pre className="max-h-[620px] min-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/70 bg-surface-soft p-4 font-mono text-xs leading-relaxed text-muted-foreground shadow-none">
							<code>{preview}</code>
						</pre>
					</WorkbenchPanel>
				</div>
			</div>
		</section>
	)
}

export function AgentUpdatesPanel({
	summaries,
	updatingSystemId,
	requestedUpdateTargets,
	onRequestUpdate,
}: {
	summaries: SystemUpdateSummary[]
	updatingSystemId: string
	requestedUpdateTargets: Record<string, string>
	onRequestUpdate: (item: SystemUpdateSummary) => void
}) {
	const upgradeable = summaries.filter((item) => item.updateKind === "upgrade" && item.precheckStatus === "ready")
	const current = summaries.filter((item) => item.updateKind === "current")
	const blocked = summaries.filter((item) => item.precheckStatus === "blocked")

	return (
		<SectionBlock
			title="Agent 更新"
			actions={
				<div className="flex flex-wrap gap-1.5">
					<Badge variant={upgradeable.length ? "warning" : "outline"}>有更新 {upgradeable.length}</Badge>
					<Badge variant="outline">已最新 {current.length}</Badge>
					<Badge variant={blocked.length ? "destructive" : "outline"}>阻塞 {blocked.length}</Badge>
				</div>
			}
		>
			<div className="grid gap-2">
				{summaries.length ? (
					summaries.map((item) => (
						<SystemUpdateRow
							key={item.system.id}
							item={item}
							updating={updatingSystemId === item.system.id}
							requestedTargetVersion={requestedUpdateTargets[item.system.id]}
							onRequest={() => onRequestUpdate(item)}
						/>
					))
				) : (
					<p className="rounded-md bg-surface-soft p-3 text-sm text-muted-foreground shadow-none">
						还没有接入可更新的 Agent。
					</p>
				)}
			</div>
		</SectionBlock>
	)
}

export function AgentReleaseRepositoryPanel({ releases }: { releases: AgentReleaseRecord[] }) {
	const windowsReleases = releases.filter((release) => release.platform === "windows")
	const linuxReleases = releases.filter((release) => release.platform === "linux")
	return (
		<div className="grid gap-3 lg:grid-cols-2">
			<SectionBlock title="Windows 版本仓库">
				<ReleaseRepository
					releases={windowsReleases}
					platformLabel="Windows"
					emptyText="还没有可用 Windows Agent 版本。"
				/>
			</SectionBlock>
			<SectionBlock title="Linux 镜像仓库">
				<ReleaseRepository
					releases={linuxReleases}
					platformLabel="Linux 镜像"
					emptyText="还没有可用 Linux 容器镜像版本。"
				/>
			</SectionBlock>
		</div>
	)
}

export function ConfirmUpdateDialog({
	pendingUpdate,
	updating,
	onOpenChange,
	onConfirm,
}: {
	pendingUpdate: SystemUpdateSummary | null
	updating: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: () => void
}) {
	return (
		<OperationConfirmDialog
			open={Boolean(pendingUpdate)}
			onOpenChange={onOpenChange}
			title="确认请求 Agent 更新"
			description="Hub 会根据版本仓库记录生成更新参数。Agent 会先判断版本号，已经是最新版时只回报状态，不会重新安装。"
			confirmLabel="确认请求"
			running={updating}
			progressTitle="正在发送更新请求"
			progressDescription="请求会写入操作记录，Agent 接收后再执行下载、校验和重启。"
			onConfirm={onConfirm}
		>
			<div className="grid gap-1.5 text-sm">
				<div className="font-medium">{pendingUpdate?.system.name}</div>
				<div className="mt-1 text-muted-foreground">
					{pendingUpdate?.currentVersion || "未知"} -&gt; {pendingUpdate?.targetRelease?.version || "未知"}
				</div>
				{pendingUpdate?.targetRelease?.checksum && (
					<div className="mt-1 break-all text-muted-foreground">{pendingUpdate.targetRelease.checksum}</div>
				)}
			</div>
		</OperationConfirmDialog>
	)
}

function WorkbenchPanel({
	title,
	icon: Icon,
	actions,
	children,
}: {
	title: string
	icon: typeof RocketIcon
	actions?: ReactNode
	children: ReactNode
}) {
	return (
		<section className="rounded-lg border border-border/70 bg-card p-3 shadow-none">
			<div className="mb-3 flex min-h-10 flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-2 text-sm font-semibold">
					<span className="grid size-8 place-items-center rounded-md border border-border/70 bg-surface-soft">
						<Icon className="size-4 text-muted-foreground" />
					</span>
					{title}
				</div>
				{actions}
			</div>
			<div className="grid gap-3">{children}</div>
		</section>
	)
}

function CapabilitySwitch({
	label,
	description,
	checked,
	onCheckedChange,
}: {
	label: string
	description: string
	checked: boolean
	onCheckedChange: (checked: boolean) => void
}) {
	return (
		<div className="flex min-h-16 items-center justify-between gap-3 rounded-md bg-surface-soft p-3">
			<div className="min-w-0">
				<div className="text-sm font-medium">{label}</div>
				<p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
			</div>
			<Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
		</div>
	)
}

function WindowsPathInput({
	id,
	label,
	value,
	onChange,
}: {
	id: string
	label: string
	value: string
	onChange: (value: string) => void
}) {
	return (
		<div className="grid gap-1.5">
			<Label htmlFor={id} className="text-xs text-muted-foreground">
				{label}
			</Label>
			<Input id={id} value={value} onChange={(event) => onChange(event.target.value)} className="font-mono text-xs" />
		</div>
	)
}

export const agentCapabilityGroups = [
	{
		title: "Windows 主机版",
		badge: "Windows Service",
		collect: [
			"CPU / 内存 / 磁盘 / 网络基础指标",
			"Windows 服务状态",
			"手动添加的软件运行状态",
			"Docker 容器状态",
			"核显型号和占用率",
		],
		operate: ["手动添加的服务启动 / 停止 / 重启", "同机 Docker 容器启动 / 停止 / 重启", "Agent 版本升级"],
	},
	{
		title: "Linux / NAS Docker 容器版",
		badge: "Docker",
		collect: [
			"CPU / 内存 / 根磁盘 / 网络基础指标",
			"Docker / Podman 容器状态",
			"Docker 版本",
			"S.M.A.R.T.（取决于容器权限）",
			"核显型号和占用率（取决于 /dev/dri 权限）",
		],
		operate: ["同机容器启动 / 停止 / 重启", "Compose 堆栈启动 / 停止 / 重启", "Agent 版本更新"],
	},
]

const installProfileIcons = {
	windows: MonitorCogIcon,
	linux: ContainerIcon,
} satisfies Record<InstallProfile["icon"], typeof RocketIcon>

function InstallProfileCard({ profile }: { profile: InstallProfile }) {
	const Icon = installProfileIcons[profile.icon]
	const [commandOpen, setCommandOpen] = useState(false)
	const actions = profile.actions?.length
		? profile.actions
		: [
				{
					id: profile.id,
					title: profile.title,
					description: "复制当前安装模板到目标机器执行。",
					label: "复制模板",
					content: profile.command,
				},
			]
	return (
		<div className="grid gap-3 rounded-md bg-surface-soft p-3 shadow-none">
			<div className="flex flex-wrap items-center gap-2">
				<Icon className="size-4 text-muted-foreground" />
				<span className="font-medium">{profile.title}</span>
			</div>
			<div className="flex flex-wrap gap-2">
				{profile.badges.map((badge) => (
					<Badge key={badge} variant="outline">
						{badge}
					</Badge>
				))}
			</div>
			<div className="grid gap-2">
				<div className="flex flex-wrap items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						className="min-h-10 flex-1 justify-between gap-2 sm:flex-none sm:min-w-44"
						aria-expanded={commandOpen}
						onClick={() => setCommandOpen((open) => !open)}
					>
						<span>{commandOpen ? `收起${profile.commandLabel}` : `展开${profile.commandLabel}`}</span>
						<ChevronDownIcon className={cn("size-4 transition-transform", commandOpen && "rotate-180")} />
					</Button>
					<Button variant="outline" size="sm" className="min-h-10" onClick={() => copyToClipboard(profile.command)}>
						<CopyIcon className="me-2 size-4" />
						复制默认模板
					</Button>
				</div>
				{commandOpen && (
					<pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/70 bg-surface-soft p-3 text-xs leading-relaxed shadow-none">
						<code>{profile.command}</code>
					</pre>
				)}
			</div>
			{actions.length > 1 && (
				<div className="grid gap-2">
					{actions.map((action) => (
						<div key={action.id} className="rounded-md border border-border/70 bg-card p-3 shadow-none">
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div className="min-w-0">
									<div className="text-sm font-medium">{action.title}</div>
									<p className="mt-1 text-xs leading-relaxed text-muted-foreground">{action.description}</p>
									{action.badges?.length ? (
										<div className="mt-2 flex flex-wrap gap-1.5">
											{action.badges.map((badge) => (
												<Badge key={badge} variant="outline" className="h-auto min-h-6 whitespace-normal text-left">
													{badge}
												</Badge>
											))}
										</div>
									) : null}
								</div>
								<div className="flex shrink-0 flex-wrap gap-2">
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="min-h-10"
										onClick={() => copyToClipboard(action.content)}
									>
										<CopyIcon className="me-2 size-4" />
										{action.label}
									</Button>
									{action.filename && (
										<Button
											type="button"
											variant="outline"
											size="sm"
											className="min-h-10"
											onClick={() => downloadTextFile(action.filename || "pulse-agent.txt", action.content)}
										>
											<DownloadIcon className="me-2 size-4" />
											{action.downloadLabel || "下载"}
										</Button>
									)}
								</div>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
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

function SectionBlock({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
	return (
		<section className="rounded-lg border border-border/70 bg-card p-3 shadow-none">
			<div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
				<div className="text-sm font-semibold">{title}</div>
				{actions}
			</div>
			<div className="mt-2">{children}</div>
		</section>
	)
}

function CapabilityGroupCard({ group }: { group: (typeof agentCapabilityGroups)[number] }) {
	return (
		<div className="grid content-start gap-3 rounded-md bg-surface-soft p-3 shadow-none">
			<div className="flex flex-wrap items-center gap-2">
				<span className="font-medium">{group.title}</span>
				<Badge variant="outline">{group.badge}</Badge>
			</div>
			<CapabilityColumn title="采集" items={group.collect} />
			<CapabilityColumn title="操作" items={group.operate} />
		</div>
	)
}

function CapabilityColumn({ title, items }: { title: string; items: string[] }) {
	return (
		<div>
			<div className="mb-1 text-xs font-medium text-muted-foreground">{title}</div>
			<div className="flex flex-wrap gap-1.5">
				{items.map((item) => (
					<Badge key={item} variant="secondary" className="justify-start whitespace-normal text-left font-normal">
						{item}
					</Badge>
				))}
			</div>
		</div>
	)
}

function ReleaseRepository({
	releases,
	platformLabel,
	emptyText,
}: {
	releases: AgentReleaseRecord[]
	platformLabel: string
	emptyText: string
}) {
	if (!releases.length) {
		return <p className="rounded-md bg-surface-soft p-3 text-sm text-muted-foreground shadow-none">{emptyText}</p>
	}
	return (
		<div className="grid gap-2">
			{releases.map((release) => (
				<div key={release.id} className="grid gap-2 rounded-md bg-surface-soft p-3 shadow-none">
					<div className="min-w-0">
						<div className="flex flex-wrap items-center gap-2">
							<span className="font-medium">{release.version}</span>
							<Badge variant={release.enabled ? "success" : "outline"}>{release.enabled ? "启用" : "禁用"}</Badge>
							<Badge variant="outline">
								{platformLabel}/{release.arch || "all"} - {release.channel}
							</Badge>
						</div>
						{release.notes && <p className="mt-1 text-sm text-muted-foreground">{release.notes}</p>}
						{!release.enabled && release.disabled_reason && (
							<p className="mt-1 text-sm text-muted-foreground">禁用原因：{release.disabled_reason}</p>
						)}
						{release.download_url && (
							<p className="mt-1 flex items-center gap-1.5 break-all text-xs text-muted-foreground">
								<DownloadIcon className="size-3.5 shrink-0" />
								{release.download_url}
							</p>
						)}
					</div>
				</div>
			))}
		</div>
	)
}

function SystemUpdateRow({
	item,
	updating,
	requestedTargetVersion,
	onRequest,
}: {
	item: SystemUpdateSummary
	updating: boolean
	requestedTargetVersion?: string
	onRequest: () => void
}) {
	const waitingForResult =
		Boolean(requestedTargetVersion) &&
		Boolean(item.currentVersion) &&
		compareVersionStrings(item.currentVersion, requestedTargetVersion || "") < 0
	const canRequest =
		!waitingForResult &&
		item.updateKind === "upgrade" &&
		item.precheckStatus === "ready" &&
		Boolean(item.targetRelease?.download_url) &&
		!isReadOnlyUser()
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-soft p-3 shadow-none">
			<div className="min-w-0">
				<div className="flex flex-wrap items-center gap-2">
					<Link
						href={getPagePath($router, "system", { id: item.system.id })}
						className="-my-2 -ms-2 inline-flex min-h-10 items-center rounded-md px-2 font-medium transition-[background-color,color,transform] hover:bg-card hover:text-foreground active:scale-[0.96]"
					>
						{item.system.name}
					</Link>
					<Badge variant={waitingForResult ? "warning" : item.updateVariant}>
						{waitingForResult ? "更新中" : item.updateLabel}
					</Badge>
					{item.updateKind !== "current" && (
						<Badge variant={precheckVariant[item.precheckStatus]}>{getPrecheckLabel(item)}</Badge>
					)}
					{item.lastFailed && !waitingForResult && <Badge variant="destructive">上次更新失败</Badge>}
				</div>
				<p className="mt-1 text-sm text-muted-foreground">
					{waitingForResult
						? `更新请求已发送，等待 Agent 拉取镜像并上报 ${requestedTargetVersion}。`
						: item.precheckReason}
				</p>
				{waitingForResult && <InlineProgress />}
				{item.lastUpdateLabel && (
					<div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
						<Badge variant={item.lastUpdate?.status === "failed" ? "destructive" : "success"}>
							{item.lastUpdateLabel}
						</Badge>
						{item.lastUpdateDetail && <span className="min-w-0 break-words">{item.lastUpdateDetail}</span>}
					</div>
				)}
			</div>
			<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
				<Badge variant="outline">实际 {item.currentVersion || "未知"}</Badge>
				<Badge variant="outline">目标 {item.targetVersion || "无"}</Badge>
				<Badge variant="outline">
					{item.platform}/{item.arch || "all"}
				</Badge>
				<Button size="sm" variant="outline" disabled={!canRequest || updating} onClick={onRequest}>
					<RocketIcon className="me-2 size-4" />
					{getUpdateActionLabel(item, updating, waitingForResult)}
				</Button>
			</div>
		</div>
	)
}

function InlineProgress() {
	return (
		<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-soft">
			<div className="operation-progress-bar h-full w-1/3 rounded-full bg-primary" />
		</div>
	)
}

function getUpdateActionLabel(item: SystemUpdateSummary, updating: boolean, waitingForResult = false) {
	if (updating) return "请求中..."
	if (waitingForResult) return "更新中"
	if (item.updateKind === "current") return "无需更新"
	if (item.updateKind === "ahead") return "高于目标"
	if (item.precheckStatus === "ready") return "更新"
	if (item.system.status !== SystemStatus.Up) return "设备离线"
	if (!item.canSelfUpdate) return "不支持更新"
	if (!item.targetRelease) return "无目标版本"
	return "暂不可用"
}

function getPrecheckLabel(item: SystemUpdateSummary) {
	if (item.updateKind === "current") return "已最新"
	return precheckLabel[item.precheckStatus]
}

const precheckLabel = {
	ready: "可更新",
	blocked: "阻塞",
	skip: "跳过",
} as const

const precheckVariant = {
	ready: "warning",
	blocked: "destructive",
	skip: "outline",
} as const
