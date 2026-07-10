import { Trans } from "@lingui/react/macro"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import { type FormEvent, memo, type ReactElement, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/use-toast"
import { isReadOnlyUser, pb } from "@/lib/api"
import { Os } from "@/lib/enums"
import {
	DEFAULT_PRIMARY_USE,
	DEFAULT_SYSTEM_ROLE,
	getPrimaryUseLabel,
	getSystemDisplayName,
	getSystemHostname,
	primaryUseOptions,
	systemAttributeOptions,
} from "@/lib/system-roles"
import { cn, tokenMap, useBrowserStorage } from "@/lib/utils"
import { HOST_ASSET_TYPES, getMetadataString } from "@/modules/asset-center/asset-schema"
import type { AssetRecord, SystemRecord } from "@/types"
import {
	copyDockerCompose,
	copyPairingDockerCompose,
	copyPairingDockerRun,
	copyPairingFlynasCompose,
	copyPairingUnraidTemplate,
	downloadPairingFlynasCompose,
	downloadPairingUnraidTemplate,
	copyPairingWindowsCommand,
	copyWindowsCommand,
	type DropdownItem,
	InstallDropdown,
} from "./install-dropdowns"
import { DropdownMenu, DropdownMenuTrigger } from "./ui/dropdown-menu"
import { DockerIcon, WindowsIcon } from "./ui/icons"
import { InputCopy } from "./ui/input-copy"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"

type InstallTab = "windows-host" | "linux-container"

type PairingCodeResponse = {
	id: string
	code: string
	asset?: string
	target_ip?: string
	expected_ip?: string
	connect_ip?: string
	reported_ips?: string[]
	hostname?: string
	fingerprint_summary?: string
	agent_profile?: string
	platform?: string
	arch?: string
	agent_version?: string
	install_method?: string
	run_mode?: string
	expires_at: string
	used: boolean
	system?: string
	used_at?: string
	used_by?: string
}

export function AddSystemDialog({
	open,
	setOpen,
	initialAssetId = "",
}: {
	open: boolean
	setOpen: (open: boolean) => void
	initialAssetId?: string
}) {
	if (isReadOnlyUser()) {
		return null
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			{open && <SystemDialog setOpen={setOpen} initialAssetId={initialAssetId} />}
		</Dialog>
	)
}

export const SystemDialog = ({
	setOpen,
	system,
	initialAssetId = "",
}: {
	setOpen: (open: boolean) => void
	system?: SystemRecord
	initialAssetId?: string
}) => {
	const [tab, setTab] = useBrowserStorage<InstallTab>("as-tab", "linux-container")
	const [token, setToken] = useState(system?.token ?? "")
	const [createdSystem, setCreatedSystem] = useState<SystemRecord | null>(null)
	const [pendingPairedSystem, setPendingPairedSystem] = useState<SystemRecord | null>(null)
	const [pairingCode, setPairingCode] = useState<PairingCodeResponse | null>(null)
	const [pairingStatusMessage, setPairingStatusMessage] = useState("")
	const [isSaving, setIsSaving] = useState(false)
	const [isCheckingPairing, setIsCheckingPairing] = useState(false)
	const [targetIp, setTargetIp] = useState("")
	const [displayNameInput, setDisplayNameInput] = useState(system?.display_name ?? "")
	const [selectedRole, setSelectedRole] = useState(getInitialSystemRole(system?.role))
	const [selectedPrimaryUse, setSelectedPrimaryUse] = useState(getInitialPrimaryUse(system?.primary_use))
	const [isNas, setIsNas] = useState(Boolean(system?.is_nas))
	const [description, setDescription] = useState(system?.description ?? "")
	const [suppressOfflineAlerts, setSuppressOfflineAlerts] = useState(
		system ? Boolean(system.suppress_offline_alerts) : true
	)
	const [assets, setAssets] = useState<AssetRecord[]>([])
	const [assetsLoaded, setAssetsLoaded] = useState(false)
	const [selectedAssetId, setSelectedAssetId] = useState(system?.asset || initialAssetId)
	const selectedAsset = assets.find((asset) => asset.id === selectedAssetId)
	const isBusy = isSaving || isCheckingPairing
	const installReady = Boolean(system || pairingCode)
	const readyToConfirmPairing = Boolean(
		!system && pairingCode?.used && pendingPairedSystem?.status === "up" && !createdSystem
	)
	const currentWizardStep = getCurrentInstallWizardStep({
		createdSystem: Boolean(createdSystem),
		pairingCode,
		pendingPairedSystem,
		readyToConfirmPairing,
		targetIp,
	})
	const displayName = getSystemDisplayName(system)
	const systemInstallTab = system ? getSystemInstallTab(system) : undefined
	const activeTab = systemInstallTab ?? tab

	useEffect(() => {
		if (!["windows-host", "linux-container"].includes(tab)) {
			setTab("linux-container")
		}
	}, [tab, setTab])

	useEffect(() => {
		setAssetsLoaded(false)
		pb.collection<AssetRecord>("assets")
			.getFullList({ sort: "type,name", requestKey: null })
			.then((records) => {
				setAssets(records.filter(isAgentConnectableAsset))
				setAssetsLoaded(true)
			})
			.catch((error) => {
				console.error("load assets for system dialog", error)
				setAssets([])
				setAssetsLoaded(true)
			})
	}, [])

	useEffect(() => {
		setSelectedAssetId(system?.asset || initialAssetId)
	}, [system?.asset, initialAssetId])

	useEffect(() => {
		if (system || pairingCode || !selectedAsset) return
		const assetIp = getAssetAgentTargetIp(selectedAsset)
		if (assetIp) {
			setTargetIp(assetIp)
		}
	}, [pairingCode, selectedAsset, system])

	useEffect(() => {
		;(async () => {
			if (!system) {
				setToken("")
				return
			}
			if (tokenMap.has(system.id)) {
				const cachedToken = tokenMap.get(system.id)
				if (cachedToken) {
					return setToken(cachedToken)
				}
			}
			const { token } = await pb.send<{ token: string }>(
				`/api/pulse/agent-tokens/system/${encodeURIComponent(system.id)}/secret`,
				{ requestKey: null }
			)
			tokenMap.set(system.id, token)
			setToken(token)
		})()
	}, [system?.id])

	function buildSystemConfig() {
		const userId = pb.authStore.record?.id
		if (!userId) {
			throw new Error("当前登录状态无效，请重新登录后再试。")
		}

		return {
			users: userId,
			role: selectedRole || DEFAULT_SYSTEM_ROLE,
			display_name: displayNameInput.trim(),
			primary_use: selectedPrimaryUse || DEFAULT_PRIMARY_USE,
			is_nas: isNas,
			description,
			custom_role: "",
			suppress_offline_alerts: suppressOfflineAlerts,
			pairing_confirmed: true,
			asset: selectedAssetId || "",
		}
	}

	function validateNewSystemAssetSelection() {
		if (!system && !selectedAssetId) {
			throw new Error("请先在关联资产里选择资产中心已有资产，再创建安装会话。")
		}
		if (!system && selectedAssetId && !assetsLoaded) {
			throw new Error("资产候选正在加载，请稍后再创建安装会话。")
		}
		const matchedAsset = selectedAssetId ? assets.find((asset) => asset.id === selectedAssetId) : undefined
		if (!system && selectedAssetId && !matchedAsset) {
			throw new Error("当前选择的资产类型不能安装 Agent。请在资产中心选择物理主机、NAS、服务器或迷你主机。")
		}
		if (!system && matchedAsset && !getAssetAgentTargetIp(matchedAsset)) {
			throw new Error("请先在资产中心为该资产填写 IPv4，再创建 Agent 安装会话。")
		}
	}

	async function createPairingSession({ showToast = true }: { showToast?: boolean } = {}) {
		validateNewSystemAssetSelection()
		const expectedIp = (selectedAsset ? getAssetAgentTargetIp(selectedAsset) : "") || targetIp.trim()
		if (!expectedIp) {
			throw new Error("请填写目标机器 IP。")
		}
		setTargetIp(expectedIp)
		const response = await pb.send<PairingCodeResponse>("/api/pulse/pairing-codes", {
			method: "POST",
			body: { target_ip: expectedIp, asset: selectedAssetId },
		})
		setPairingCode(response)
		setPendingPairedSystem(null)
		setPairingStatusMessage("")
		if (showToast) {
			toast({ title: "安装会话已创建", description: "请复制安装命令到目标机器执行，完成后点击检测安装。" })
		}
		return response
	}

	async function ensurePairingSessionForCopy() {
		if (pairingCode) {
			return pairingCode
		}
		return await createPairingSession({ showToast: false })
	}

	async function copyNewSystemPairingCommand(copyCommand: (code: string) => Promise<void>) {
		try {
			setIsSaving(true)
			const response = await ensurePairingSessionForCopy()
			await copyCommand(response.code)
		} catch (error) {
			if (!isExpectedSystemDialogValidationError(error)) {
				console.error(error)
			}
			toast({
				title: "复制安装命令失败",
				description: getSystemDialogErrorMessage(error),
				variant: "destructive",
			})
		} finally {
			setIsSaving(false)
		}
	}

	async function handleSubmit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault()
		if (createdSystem) {
			setOpen(false)
			return
		}

		try {
			setIsSaving(true)
			validateNewSystemAssetSelection()
			if (system) {
				await pb.collection("systems").update(system.id, buildSystemConfig())
				toast({ title: "机器已保存", description: `${displayName} 的配置已更新。` })
				setOpen(false)
				return
			}

			await createPairingSession()
		} catch (error) {
			if (!isExpectedSystemDialogValidationError(error)) {
				console.error(error)
			}
			toast({
				title: system ? "保存机器失败" : "创建安装会话失败",
				description: getSystemDialogErrorMessage(error),
				variant: "destructive",
			})
		} finally {
			setIsSaving(false)
		}
	}

	async function detectPairing() {
		if (!pairingCode) {
			return
		}
		try {
			setIsCheckingPairing(true)
			const current = await pb.send<PairingCodeResponse>(`/api/pulse/pairing-codes/${pairingCode.id}`, {
				method: "GET",
			})
			setPairingCode(current)
			if (isPairingCodeExpired(current)) {
				const message = "配对码已过期，请关闭弹窗后重新添加机器，生成新的安装会话。"
				setPairingStatusMessage(message)
				toast({ title: "配对码已过期", description: message, variant: "destructive" })
				return
			}
			if (!current?.used || !current.system) {
				setPendingPairedSystem(null)
				setPairingStatusMessage("还未检测到 Agent。请确认目标机器已经执行安装命令，并且能访问当前 Hub 地址。")
				toast({
					title: "还未检测到 Agent",
					description: "请确认目标机器已经执行安装命令，并且能访问当前 Hub 地址。",
				})
				return
			}
			const pairedSystem = (await pb.collection("systems").getOne(current.system, {
				fields: "id,name,status,info,updated",
			})) as SystemRecord
			setPendingPairedSystem(pairedSystem)
			if (pairedSystem.status !== "up") {
				setPairingStatusMessage("Hub 已收到配对请求，正在等待 Agent 上线。请稍后再点检测安装。")
				toast({
					title: "已完成配对，等待 Agent 上线",
					description: "Hub 已收到配对请求，但还没有检测到 Agent 在线。请稍后再点检测安装。",
				})
				return
			}
			setPairingStatusMessage("已检测到 Agent 在线。请核对下方身份信息，确认无误后点击“确认添加”。")
			toast({ title: "检测到 Agent 在线", description: "请核对机器身份信息后确认添加。" })
		} catch (error) {
			console.error(error)
			toast({
				title: "检测安装失败",
				description: getSystemDialogErrorMessage(error),
				variant: "destructive",
			})
		} finally {
			setIsCheckingPairing(false)
		}
	}

	async function confirmPairing() {
		if (!pairingCode?.system || !pendingPairedSystem) {
			await detectPairing()
			return
		}
		if (pendingPairedSystem.status !== "up") {
			setPairingStatusMessage("Agent 还未在线，请稍后再点检测安装。")
			return
		}
		try {
			setIsSaving(true)
			const updated = (await pb.collection("systems").update(pairingCode.system, buildSystemConfig())) as SystemRecord
			setCreatedSystem(updated)
			setPairingStatusMessage("")
			toast({ title: "添加成功", description: `${getSystemDisplayName(updated)} 已连接 Hub。` })
		} catch (error) {
			console.error(error)
			toast({
				title: "确认添加失败",
				description: getSystemDialogErrorMessage(error),
				variant: "destructive",
			})
		} finally {
			setIsSaving(false)
		}
	}

	return (
		<DialogContent
			onInteractOutside={(event) => {
				if (isManualCopyDialogTarget(event.target)) {
					event.preventDefault()
				}
			}}
			className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border-border/70 bg-card p-0 shadow-none sm:max-w-[34rem]"
		>
			<Tabs value={activeTab} onValueChange={(value) => !system && setTab(value as InstallTab)}>
				<DialogHeader className="border-b border-border/70 px-5 py-4 pr-12">
					<DialogTitle className="max-w-100 truncate text-lg font-semibold">
						{system ? <Trans>Edit system</Trans> : <Trans>Add system</Trans>}
					</DialogTitle>
					<DialogDescription className="sr-only">
						{system
							? "编辑机器显示名称、类型、用途、NAS 标签和告警加入状态，并查看当前 Agent 安装令牌。"
							: "创建一次性 Agent 安装会话，复制安装命令到目标机器执行后检测安装状态。"}
					</DialogDescription>
					{system ? (
						<div className="mt-2 inline-flex w-fit items-center rounded-md border border-border/70 bg-surface-soft px-2.5 py-1 text-xs font-medium text-muted-foreground">
							{getInstallTabLabel(activeTab)}
						</div>
					) : (
						<TabsList className="mt-3 grid w-full grid-cols-2 rounded-lg bg-surface-card p-1">
							<TabsTrigger value="windows-host">Windows</TabsTrigger>
							<TabsTrigger value="linux-container">Linux 容器</TabsTrigger>
						</TabsList>
					)}
				</DialogHeader>
				<div className="px-5 pt-4">
					{!system ? <InstallWizardSteps currentStep={currentWizardStep} /> : null}
					{!system && (
						<>
							<TabsContent value="windows-host" tabIndex={-1} className="mt-3">
								<DialogDescription className="rounded-lg border border-border/70 bg-surface-soft px-3 py-2.5 text-sm leading-relaxed text-muted-foreground">
									先选择机器类型和主要用途，再复制命令到目标 Windows 机器执行。机器名称由 Agent 上报的真实主机名生成。
								</DialogDescription>
							</TabsContent>
							<TabsContent value="linux-container" tabIndex={-1} className="mt-3">
								<DialogDescription className="rounded-lg border border-border/70 bg-surface-soft px-3 py-2.5 text-sm leading-relaxed text-muted-foreground">
									先选择机器类型和主要用途，再复制 Compose 或 docker run 到 Linux、飞牛或 NAS 执行。容器默认使用 host
									网络。
								</DialogDescription>
							</TabsContent>
						</>
					)}
				</div>
				<form onSubmit={handleSubmit} className="px-5 pb-5">
					<div className="mt-4 mb-4 grid items-center gap-x-4 gap-y-3 rounded-lg border border-border/70 bg-surface-soft p-3 shadow-none xs:grid-cols-[auto_1fr]">
						{system && (
							<>
								<Label htmlFor="display_name" className="text-muted-foreground xs:text-end">
									显示名称
								</Label>
								<Input
									id="display_name"
									name="display_name"
									value={displayNameInput}
									onChange={(event) => setDisplayNameInput(event.target.value)}
									placeholder={getSystemHostname(system)}
									disabled={Boolean(createdSystem)}
								/>
								<Label className="text-muted-foreground xs:text-end">真实主机名</Label>
								<div className="flex min-h-10 items-center rounded-md border border-border/70 bg-card px-3 text-sm shadow-none">
									<span className="truncate" title={getSystemHostname(system)}>
										{getSystemHostname(system)}
									</span>
								</div>
							</>
						)}
						{!system && (
							<>
								<Label htmlFor="display_name" className="text-muted-foreground xs:text-end">
									显示名称
								</Label>
								<Input
									id="display_name"
									name="display_name"
									value={displayNameInput}
									onChange={(event) => setDisplayNameInput(event.target.value)}
									placeholder="可选，留空则使用 Agent 主机名"
									disabled={Boolean(createdSystem)}
								/>
								<Label htmlFor="target_ip" className="text-muted-foreground xs:text-end">
									目标 IP
								</Label>
								<Input
									id="target_ip"
									name="target_ip"
									value={targetIp}
									onChange={(event) => setTargetIp(event.target.value)}
									placeholder="例如 192.168.1.5"
									inputMode="decimal"
									autoComplete="off"
									required
									disabled={Boolean(pairingCode) || Boolean(selectedAsset)}
								/>
							</>
						)}
						<Label htmlFor="role" className="text-muted-foreground xs:text-end">
							机器类型
						</Label>
						<Select name="role" value={selectedRole} onValueChange={setSelectedRole} disabled={Boolean(createdSystem)}>
							<SelectTrigger id="role">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{systemAttributeOptions.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Label htmlFor="asset" className="text-muted-foreground xs:text-end">
							关联资产
						</Label>
						<Select
							name="asset"
							value={selectedAssetId || "none"}
							onValueChange={(value) => setSelectedAssetId(value === "none" ? "" : value)}
							disabled={Boolean(createdSystem) || (!system && Boolean(pairingCode))}
						>
							<SelectTrigger id="asset">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none" disabled={!system}>
									{system ? "不关联资产" : assets.length ? "请选择资产" : "资产中心暂无可接入资产"}
								</SelectItem>
								{assets.map((asset) => (
									<SelectItem key={asset.id} value={asset.id}>
										{getAssetSelectLabel(asset)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Label htmlFor="primary_use" className="text-muted-foreground xs:text-end">
							主要用途
						</Label>
						<Select
							name="primary_use"
							value={selectedPrimaryUse}
							onValueChange={setSelectedPrimaryUse}
							disabled={Boolean(createdSystem)}
						>
							<SelectTrigger id="primary_use">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{primaryUseOptions.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<div className="xs:col-start-2">
							<div className="flex min-h-10 items-center gap-3 rounded-md border border-border/70 bg-card px-3 py-2 text-sm shadow-none">
								<Checkbox
									id="nas"
									checked={isNas}
									onCheckedChange={(checked) => setIsNas(checked === true)}
									disabled={Boolean(createdSystem)}
								/>
								<Label htmlFor="nas" className="font-medium">
									NAS
								</Label>
							</div>
						</div>
						<Label htmlFor="description" className="text-muted-foreground xs:text-end">
							说明
						</Label>
						<Input
							id="description"
							name="description"
							value={description}
							onChange={(event) => setDescription(event.target.value)}
							placeholder="简单说明这台机器承担的具体任务"
							disabled={Boolean(createdSystem)}
						/>
						<div className="xs:col-start-2">
							<div className="flex min-h-10 items-center gap-3 rounded-md border border-border/70 bg-card px-3 py-2 text-sm shadow-none">
								<Checkbox
									id="offline_alerts"
									checked={!suppressOfflineAlerts}
									onCheckedChange={(checked) => setSuppressOfflineAlerts(checked !== true)}
									disabled={Boolean(createdSystem)}
								/>
								<Label htmlFor="offline_alerts" className="font-medium">
									加入告警
								</Label>
							</div>
						</div>
						{system && (
							<>
								<Label htmlFor="tkn" className="whitespace-pre text-muted-foreground xs:text-end">
									<Trans>Token</Trans>
								</Label>
								<InputCopy value={token} id="tkn" name="tkn" />
							</>
						)}
					</div>
					{!system && (
						<div className="mb-4 rounded-lg border border-border/70 bg-surface-soft p-3 text-sm text-muted-foreground shadow-none">
							<div>
								{createdSystem
									? `添加成功：${getSystemDisplayName(createdSystem)} 已连接 Hub。`
									: pairingCode
										? `配对码 ${pairingCode.code} 已生成，10 分钟内有效，只允许 ${getPairingTargetIp(pairingCode, targetIp)} 这台机器配对。目标机器执行安装命令后点击“检测安装”。`
										: `请填写目标机器 IP，Hub 会校验 Agent 配对请求来源，避免安装到错误机器。当前选择：${getPrimaryUseLabel(selectedPrimaryUse)}。`}
							</div>
							{pairingStatusMessage ? (
								<div className="mt-2 rounded-md border border-border/70 bg-card px-2.5 py-2 text-foreground shadow-none">
									{pairingStatusMessage}
								</div>
							) : null}
						</div>
					)}
					{!system && pairingCode?.used ? (
						<PairingIdentityPanel pairingCode={pairingCode} pendingSystem={pendingPairedSystem} />
					) : null}
					<DialogFooter className="-mx-5 mt-5 flex flex-col justify-end gap-x-2 gap-y-3 border-t border-border/70 bg-surface-soft px-5 pt-4 pb-5 sm:flex-row sm:items-center">
						<TabsContent value="windows-host" className="contents">
							<CopyButton
								text="复制 Windows 主机版命令"
								icon={<WindowsIcon className="size-4" />}
								onClick={async () => {
									if (system) {
										await copyWindowsCommand(token)
										return
									}
									await copyNewSystemPairingCommand(copyPairingWindowsCommand)
								}}
								disabled={Boolean(createdSystem) || isBusy || (system && !installReady)}
							/>
						</TabsContent>
						<TabsContent value="linux-container" className="contents">
							<CopyButton
								text="复制 Linux 容器版 Compose"
								onClick={async () => {
									if (system) {
										await copyDockerCompose(token)
										return
									}
									await copyNewSystemPairingCommand(copyPairingDockerCompose)
								}}
								icon={<DockerIcon className="size-4 -me-0.5" />}
								disabled={Boolean(createdSystem) || isBusy || (system && !installReady)}
								dropdownItems={
									!system
										? [
												{
													text: "复制 docker run 直接命令",
													onClick: async () => copyNewSystemPairingCommand(copyPairingDockerRun),
												},
												{
													text: "复制飞牛 / NAS Compose",
													onClick: async () => copyNewSystemPairingCommand(copyPairingFlynasCompose),
												},
												{
													text: "下载飞牛 / NAS yml",
													onClick: async () => copyNewSystemPairingCommand(downloadPairingFlynasCompose),
												},
												{
													text: "复制 Unraid 下载命令",
													onClick: async () => copyNewSystemPairingCommand(copyPairingUnraidTemplate),
												},
												{
													text: "下载 Unraid 下载命令",
													onClick: async () => copyNewSystemPairingCommand(downloadPairingUnraidTemplate),
												},
											]
										: undefined
								}
							/>
						</TabsContent>
						<Button
							type={!system && pairingCode && !createdSystem ? "button" : createdSystem ? "button" : "submit"}
							disabled={isSaving || isCheckingPairing}
							onClick={async () => {
								if (createdSystem) {
									setOpen(false)
									return
								}
								if (!system && pairingCode) {
									if (readyToConfirmPairing) {
										await confirmPairing()
									} else {
										await detectPairing()
									}
								}
							}}
						>
							{system ? (
								<Trans>Save system</Trans>
							) : createdSystem ? (
								"完成"
							) : readyToConfirmPairing ? (
								isSaving ? (
									"确认中..."
								) : (
									"确认添加"
								)
							) : pairingCode ? (
								isCheckingPairing ? (
									"检测中..."
								) : (
									"检测安装"
								)
							) : isSaving ? (
								"创建中..."
							) : (
								"添加"
							)}
						</Button>
					</DialogFooter>
				</form>
			</Tabs>
		</DialogContent>
	)
}

interface CopyButtonProps {
	text: string
	onClick: () => void
	dropdownItems?: DropdownItem[]
	icon?: ReactElement
	disabled?: boolean
}

const CopyButton = memo((props: CopyButtonProps) => {
	return (
		<div className="flex min-w-0 gap-0 rounded-md shadow-none sm:min-w-[12rem]">
			<Button
				type="button"
				variant="outline"
				onClick={props.onClick}
				disabled={props.disabled}
				className={cn(
					"flex min-w-0 grow items-center justify-center gap-2 border-border/70 bg-card hover:bg-surface-soft",
					props.dropdownItems?.length && "rounded-e-none dark:border-e-0"
				)}
			>
				<span className="truncate">{props.text}</span> {props.icon}
			</Button>
			{props.dropdownItems?.length ? (
				<>
					<div className="h-full w-px bg-border"></div>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								type="button"
								variant="outline"
								className="rounded-s-none border-s-0 border-border/70 bg-card px-2 hover:bg-surface-soft"
								disabled={props.disabled}
								aria-label="更多安装命令"
								title="更多安装命令"
							>
								<ChevronDownIcon />
							</Button>
						</DropdownMenuTrigger>
						<InstallDropdown items={props.dropdownItems} />
					</DropdownMenu>
				</>
			) : null}
		</div>
	)
})

const installWizardSteps = [
	{ step: 1, label: "类型" },
	{ step: 2, label: "目标" },
	{ step: 3, label: "会话" },
	{ step: 4, label: "安装" },
	{ step: 5, label: "确认" },
] as const

function InstallWizardSteps({ currentStep }: { currentStep: number }) {
	return (
		<div className="grid grid-cols-5 gap-1.5 rounded-lg bg-surface-soft p-1.5">
			{installWizardSteps.map((item) => {
				const isDone = item.step < currentStep
				const isActive = item.step === currentStep
				return (
					<div
						key={item.step}
						className={cn(
							"flex min-h-10 min-w-0 items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-xs font-medium transition-colors",
							isActive
								? "bg-card text-foreground shadow-none"
								: isDone
									? "text-emerald-700 dark:text-emerald-300"
									: "text-muted-foreground"
						)}
					>
						<span
							className={cn(
								"flex size-4 shrink-0 items-center justify-center rounded-sm border text-[10px] tabular-nums",
								isDone
									? "border-emerald-600 bg-emerald-600 text-white"
									: isActive
										? "border-foreground text-foreground"
										: "border-border text-muted-foreground"
							)}
						>
							{isDone ? <CheckIcon className="size-3" /> : item.step}
						</span>
						<span className="truncate">{item.label}</span>
					</div>
				)
			})}
		</div>
	)
}

function PairingIdentityPanel({
	pairingCode,
	pendingSystem,
}: {
	pairingCode: PairingCodeResponse
	pendingSystem: SystemRecord | null
}) {
	const statusLabel = pendingSystem?.status === "up" ? "在线" : pendingSystem ? "等待上线" : "已配对"
	const rows: Array<[string, string | undefined]> = [
		["机器名称", pendingSystem ? getSystemDisplayName(pendingSystem) : pairingCode.used_by || pairingCode.hostname],
		["主机名", pairingCode.hostname || pairingCode.used_by],
		["目标 IP", getPairingTargetIp(pairingCode, "")],
		["连接 IP", pairingCode.connect_ip],
		["Agent 上报 IP", pairingCode.reported_ips?.length ? pairingCode.reported_ips.join(" / ") : ""],
		["指纹摘要", pairingCode.fingerprint_summary],
		["Agent Profile", pairingCode.agent_profile],
		["平台 / 架构", compactJoin([pairingCode.platform, pairingCode.arch], " / ")],
		["Agent 版本", pairingCode.agent_version],
		["安装方式", compactJoin([pairingCode.install_method, pairingCode.run_mode], " / ")],
	]

	return (
		<div className="mb-4 rounded-lg border border-border/70 bg-surface-soft p-3 text-sm shadow-none">
			<div className="mb-2 flex items-center justify-between gap-3">
				<div className="font-medium">核对机器身份</div>
				<div
					className={cn(
						"rounded-full border px-2 py-0.5 text-xs",
						pendingSystem?.status === "up"
							? "border-emerald-500/25 bg-card text-emerald-700 dark:text-emerald-300"
							: "border-border/70 bg-card text-muted-foreground"
					)}
				>
					{statusLabel}
				</div>
			</div>
			<dl className="grid gap-2 rounded-md border border-border/70 bg-card p-2 shadow-none xs:grid-cols-[6rem_1fr]">
				{rows.map(([label, value]) => (
					<div key={label} className="contents">
						<dt className="text-muted-foreground xs:text-end">{label}</dt>
						<dd className="min-w-0 break-all text-foreground">{formatPairingValue(value)}</dd>
					</div>
				))}
			</dl>
			<p className="mt-3 text-xs leading-relaxed text-muted-foreground">
				只有这些信息和目标机器一致时才确认添加；确认后才会写入机器类型、主要用途、NAS 和告警配置。
			</p>
		</div>
	)
}

function getSystemDialogErrorMessage(error: unknown) {
	const response = (
		error as { data?: { message?: string; data?: Record<string, { message?: string }> }; message?: string }
	)?.data
	const fieldMessages = response?.data
		? Object.entries(response.data)
				.map(([field, value]) => `${field}: ${value?.message || "填写内容无效"}`)
				.filter(Boolean)
		: []
	if (fieldMessages.length) {
		return fieldMessages.join("；")
	}
	return response?.message || (error as Error)?.message || "请检查机器类型、主要用途、Token 是否有效，或稍后重试。"
}

function isExpectedSystemDialogValidationError(error: unknown) {
	return (
		error instanceof Error &&
		(error.message === "请填写目标机器 IP。" ||
			error.message === "请先在关联资产里选择资产中心已有资产，再创建安装会话。" ||
			error.message === "资产候选正在加载，请稍后再创建安装会话。" ||
			error.message === "当前选择的资产类型不能安装 Agent。请在资产中心选择物理主机、NAS、服务器或迷你主机。" ||
			error.message === "请先在资产中心为该资产填写 IPv4，再创建 Agent 安装会话。")
	)
}

function isAgentConnectableAsset(asset: AssetRecord) {
	return HOST_ASSET_TYPES.includes(asset.type)
}

function getAssetAgentTargetIp(asset: AssetRecord) {
	return getMetadataString(asset.metadata, "fixed_ipv4") || asset.management_ip?.trim() || ""
}

function getAssetSelectLabel(asset: AssetRecord) {
	const targetIp = getAssetAgentTargetIp(asset)
	return targetIp ? `${asset.name} · ${targetIp}` : `${asset.name} · 未填 IPv4`
}

function getSystemInstallTab(system: SystemRecord): InstallTab {
	const cap = system.info?.cap
	const profile = cap?.agent_profile?.toLowerCase()
	const runMode = cap?.run_mode?.toLowerCase()
	const installMethod = cap?.install_method?.toLowerCase()
	const platform = cap?.platform?.toLowerCase()

	if (
		profile === "windows-host" ||
		runMode === "windows_service" ||
		installMethod === "host" ||
		platform === "windows" ||
		system.info?.os === Os.Windows
	) {
		return "windows-host"
	}

	return "linux-container"
}

function getInstallTabLabel(tab: InstallTab) {
	return tab === "windows-host" ? "Windows 主机版" : "Linux 容器版"
}

function getInitialSystemRole(value?: string) {
	return value && systemAttributeOptions.some((option) => option.value === value) ? value : DEFAULT_SYSTEM_ROLE
}

function getInitialPrimaryUse(value?: string) {
	return value && primaryUseOptions.some((option) => option.value === value) ? value : DEFAULT_PRIMARY_USE
}

function isPairingCodeExpired(pairingCode: PairingCodeResponse | null) {
	if (!pairingCode?.expires_at) {
		return false
	}
	const expiresAt = new Date(pairingCode.expires_at).getTime()
	return Number.isFinite(expiresAt) && expiresAt <= Date.now()
}

function getPairingTargetIp(pairingCode: PairingCodeResponse, fallback: string) {
	return pairingCode.target_ip || pairingCode.expected_ip || fallback.trim()
}

function formatPairingValue(value: unknown) {
	if (typeof value !== "string") {
		return "未上报"
	}
	const trimmed = value.trim()
	return trimmed || "未上报"
}

function compactJoin(values: Array<string | undefined>, separator: string) {
	return values
		.map((value) => value?.trim())
		.filter(Boolean)
		.join(separator)
}

function isManualCopyDialogTarget(target: EventTarget | null) {
	return target instanceof Element && Boolean(target.closest('[data-manual-copy-dialog="true"]'))
}

function getCurrentInstallWizardStep({
	createdSystem,
	pairingCode,
	pendingPairedSystem,
	readyToConfirmPairing,
	targetIp,
}: {
	createdSystem: boolean
	pairingCode: PairingCodeResponse | null
	pendingPairedSystem: SystemRecord | null
	readyToConfirmPairing: boolean
	targetIp: string
}) {
	if (createdSystem) {
		return 5
	}
	if (readyToConfirmPairing || pairingCode?.used || pendingPairedSystem) {
		return 5
	}
	if (pairingCode) {
		return 4
	}
	if (targetIp.trim()) {
		return 3
	}
	return 2
}
