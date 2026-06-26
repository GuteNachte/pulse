import { t } from "@lingui/core/macro"
import {
	AlertTriangleIcon,
	CheckCircle2Icon,
	Clock3Icon,
	Globe2Icon,
	LoaderCircleIcon,
	RefreshCwIcon,
	ServerIcon,
	ShieldCheckIcon,
	WifiOffIcon,
} from "lucide-react"
import { useCallback, useEffect, useState, type ReactNode } from "react"
import { UserAuthForm, type AuthFlowStage } from "@/components/login/auth-form"
import { Button } from "@/components/ui/button"
import { pb } from "@/lib/api"
import { pageTitle } from "@/lib/branding"
import { clearStoredHubUrl, isAndroidApp, readStoredHubUrl } from "@/lib/mobile-runtime"
import { fetchPublicPulseInfo } from "@/lib/runtime-info"
import type { PulseInfo } from "@/types"
import { Logo } from "../logo"
import { ModeToggle } from "../mode-toggle"

export default function Login() {
	const [isFirstRun, setFirstRun] = useState(false)
	const [hubUrl, setHubUrl] = useState("")
	const [isCheckingHub, setIsCheckingHub] = useState(true)
	const [hubError, setHubError] = useState("")
	const [runtimeInfo, setRuntimeInfo] = useState<PulseInfo | null>(null)
	const [authStage, setAuthStage] = useState<AuthFlowStage>("idle")

	const refreshFirstRunStatus = useCallback(async () => {
		setIsCheckingHub(true)
		setHubError("")
		try {
			const [{ firstRun }, info] = await Promise.all([
				pb.send<{ firstRun: boolean }>("/api/pulse/first-run", { requestKey: null }),
				fetchPublicPulseInfo().catch(() => null),
			])
			setFirstRun(firstRun)
			setRuntimeInfo(info)
			setAuthStage("idle")
		} catch (error) {
			setHubError(getHubConnectionError(error))
			setRuntimeInfo(null)
		} finally {
			setIsCheckingHub(false)
		}
	}, [])

	useEffect(() => {
		document.title = pageTitle(t`Login`)

		refreshFirstRunStatus().catch(console.error)
		if (isAndroidApp()) {
			readStoredHubUrl().then(setHubUrl).catch(console.error)
		}
	}, [refreshFirstRunStatus])

	async function changeHubUrl() {
		await clearStoredHubUrl()
		window.location.reload()
	}

	return (
		<div className="grid min-h-svh place-items-center bg-surface-soft px-4 py-8 sm:px-6 lg:px-8">
			<div className="absolute right-3 top-3">
				<ModeToggle />
			</div>
			<div className="grid w-full max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_25rem] lg:items-stretch">
				<section className="hidden overflow-hidden rounded-lg border border-border/70 bg-card p-5 shadow-none lg:grid">
					<div className="flex h-full min-h-[34rem] flex-col justify-between gap-8">
						<div>
							<div className="inline-flex items-center rounded-md border border-border/70 bg-surface-soft px-3 py-2">
								<Logo className="text-xl" />
							</div>
							<div className="mt-10 max-w-xl">
								<div className="text-xs font-medium text-muted-foreground">Pulse 运维控制台</div>
								<h1 className="mt-2 text-balance text-4xl font-semibold tracking-tight text-foreground">
									登录后查看机器、网站、容器和告警状态。
								</h1>
								<p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
									登录入口只读取公开初始化状态和 Hub 运行信息。具体机器、Token、审计和告警数据会在认证后按权限加载。
								</p>
							</div>
						</div>
						<div className="grid gap-2">
							<LoginSignal
								icon={<ServerIcon className="size-4" />}
								label="Hub"
								value={hubError ? "连接失败" : isCheckingHub ? "检测中" : "已连接"}
								tone={hubError ? "danger" : isCheckingHub ? "neutral" : "success"}
							/>
							<LoginSignal
								icon={<ShieldCheckIcon className="size-4" />}
								label="初始化"
								value={isCheckingHub ? "检测中" : isFirstRun ? "首次配置" : "已完成"}
								tone={isFirstRun ? "warning" : isCheckingHub ? "neutral" : "success"}
							/>
							<LoginSignal
								icon={<Globe2Icon className="size-4" />}
								label="运行环境"
								value={formatRuntimeInfo(runtimeInfo)}
							/>
						</div>
					</div>
				</section>

				<section className="mx-auto grid w-full max-w-md content-center gap-4 rounded-lg border border-border/70 bg-card p-4 shadow-none sm:p-5">
					<div className="text-center lg:hidden">
						<h1 className="mb-1">
							<Logo className="mx-auto justify-center text-xl" />
						</h1>
						<p className="text-xs text-muted-foreground">Pulse 运维控制台</p>
					</div>
					<div className="rounded-lg border border-border/70 bg-surface-soft p-2">
						<div className="rounded-md border border-border/70 bg-card px-3 py-2.5">
							<div className="flex min-w-0 items-start justify-between gap-3">
								<div className="min-w-0">
									<div className="text-xs font-medium text-muted-foreground">
										{isFirstRun ? "首次初始化" : "账号登录"}
									</div>
									<div className="mt-1 text-lg font-semibold tracking-tight">
										{isFirstRun ? "创建首个管理员" : "登录 Pulse"}
									</div>
								</div>
								<div className="grid size-9 shrink-0 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground">
									{isFirstRun ? <ShieldCheckIcon className="size-4" /> : <ServerIcon className="size-4" />}
								</div>
							</div>
						</div>
					</div>
					{isFirstRun && !hubError && !isCheckingHub && (
						<FirstRunSetupSteps runtimeInfo={runtimeInfo} stage={authStage} />
					)}
					{(isCheckingHub || hubError) && (
						<HubConnectionStatus
							loading={isCheckingHub}
							error={hubError}
							hubUrl={hubUrl || getCurrentHubUrl()}
							onRetry={() => refreshFirstRunStatus().catch(console.error)}
							onChangeHubUrl={() => changeHubUrl().catch(console.error)}
						/>
					)}
					{!hubError && !isCheckingHub && (
						<UserAuthForm isFirstRun={isFirstRun} onStageChange={isFirstRun ? setAuthStage : undefined} />
					)}
					{isAndroidApp() && hubUrl && !hubError && !isCheckingHub && (
						<div className="grid gap-2 rounded-lg border border-border/70 bg-surface-soft p-2 text-xs text-muted-foreground">
							<div className="grid gap-2 rounded-md border border-border/70 bg-card p-3">
								<div className="min-w-0">
									<span>当前 Hub：</span>
									<span className="break-all font-medium text-foreground">{hubUrl}</span>
								</div>
								<Button type="button" variant="outline" size="sm" onClick={() => changeHubUrl().catch(console.error)}>
									修改 Hub 地址
								</Button>
							</div>
						</div>
					)}
				</section>
			</div>
		</div>
	)
}

function LoginSignal({
	icon,
	label,
	value,
	tone = "neutral",
}: {
	icon: ReactNode
	label: string
	value: string
	tone?: "success" | "warning" | "danger" | "neutral"
}) {
	return (
		<div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border/70 bg-surface-soft p-1.5">
			<div className="flex min-w-0 items-center gap-2">
				<div className="grid size-8 shrink-0 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground">
					{icon}
				</div>
				<div className="min-w-0 truncate text-sm text-muted-foreground">{label}</div>
			</div>
			<div
				className={
					tone === "success"
						? "shrink-0 text-sm font-semibold text-emerald-600 dark:text-emerald-300"
						: tone === "warning"
							? "shrink-0 text-sm font-semibold text-amber-600 dark:text-amber-300"
							: tone === "danger"
								? "shrink-0 text-sm font-semibold text-red-600 dark:text-red-300"
								: "shrink-0 text-sm font-semibold text-foreground"
				}
			>
				{value}
			</div>
		</div>
	)
}

type SetupStepState = "done" | "active" | "pending" | "error"

function FirstRunSetupSteps({ runtimeInfo, stage }: { runtimeInfo: PulseInfo | null; stage: AuthFlowStage }) {
	const adminDone = stage === "admin-created" || stage === "mfa-required" || stage === "authenticated"
	const steps: { title: string; description: string; state: SetupStepState }[] = [
		{ title: "连接 Hub", description: formatRuntimeInfo(runtimeInfo), state: "done" },
		{
			title: "创建管理员",
			description: "创建首个管理员账号后，初始化入口会自动关闭。",
			state: stage === "error" ? "error" : adminDone ? "done" : stage === "submitting" ? "active" : "active",
		},
		{
			title: "二次验证",
			description: "如果 Hub 已开启 MFA，会进入邮箱验证码验证。",
			state: stage === "mfa-required" ? "active" : stage === "authenticated" ? "done" : "pending",
		},
		{
			title: "进入 Pulse",
			description: "登录成功后到关于页查看上线自检；公开入口不会暴露安全配置。",
			state: stage === "authenticated" ? "done" : "pending",
		},
	]
	return (
		<div className="grid gap-3 rounded-lg border border-border/70 bg-surface-soft p-2">
			<div className="rounded-md border border-border/70 bg-card p-3">
				<div className="flex items-start gap-2">
					<ShieldCheckIcon className="mt-0.5 size-4 text-primary" />
					<div className="min-w-0">
						<div className="text-sm font-medium">首次初始化</div>
						<div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
							清库或新部署时只会出现一次。完成后再次访问初始化接口会被 Hub 拒绝。
						</div>
					</div>
				</div>
				<div className="grid gap-2">
					{steps.map((step) => (
						<div key={step.title} className="grid grid-cols-[auto_1fr] gap-2 text-xs">
							<SetupStepIcon state={step.state} />
							<div className="min-w-0">
								<div className={step.state === "pending" ? "text-muted-foreground" : "font-medium"}>{step.title}</div>
								<div className="mt-0.5 break-words text-muted-foreground">{step.description}</div>
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	)
}

function SetupStepIcon({ state }: { state: SetupStepState }) {
	if (state === "done") {
		return <CheckCircle2Icon className="mt-0.5 size-3.5 text-emerald-600" />
	}
	if (state === "active") {
		return <LoaderCircleIcon className="mt-0.5 size-3.5 animate-spin text-primary" />
	}
	if (state === "error") {
		return <AlertTriangleIcon className="mt-0.5 size-3.5 text-destructive" />
	}
	return <Clock3Icon className="mt-0.5 size-3.5 text-muted-foreground" />
}

function formatRuntimeInfo(info: PulseInfo | null) {
	if (!info) {
		return "Hub 已响应，运行信息暂未读取到。"
	}
	const version = info.v ? `Hub ${info.v}` : "Hub 版本未知"
	const environment =
		info.environment === "production" ? "生产构建" : info.environment === "development" ? "开发构建" : ""
	return [version, environment].filter(Boolean).join(" / ")
}

function HubConnectionStatus({
	loading,
	error,
	hubUrl,
	onRetry,
	onChangeHubUrl,
}: {
	loading: boolean
	error: string
	hubUrl: string
	onRetry: () => void
	onChangeHubUrl: () => void
}) {
	return (
		<div className="grid gap-3 rounded-lg border border-border/70 bg-surface-soft p-2 text-sm">
			<div className="grid gap-3 rounded-md border border-border/70 bg-card p-3">
				<div className="flex items-start gap-2">
					{loading ? (
						<LoaderCircleIcon className="mt-0.5 size-4 animate-spin text-muted-foreground" />
					) : (
						<WifiOffIcon className="mt-0.5 size-4 text-destructive" />
					)}
					<div className="min-w-0">
						<div className="font-medium">{loading ? "正在连接 Hub" : "Hub 连接失败"}</div>
						<div className="mt-1 break-all text-xs text-muted-foreground">{hubUrl}</div>
					</div>
				</div>
				{error && (
					<p className="rounded-md border border-destructive/30 bg-card px-3 py-2 text-xs text-destructive shadow-none">
						{error}
					</p>
				)}
				{!loading && (
					<div className="grid grid-cols-2 gap-2">
						<Button type="button" variant="outline" size="sm" onClick={onRetry}>
							<RefreshCwIcon className="me-2 size-3.5" />
							重试
						</Button>
						{isAndroidApp() ? (
							<Button type="button" variant="outline" size="sm" onClick={onChangeHubUrl}>
								<ServerIcon className="me-2 size-3.5" />
								修改地址
							</Button>
						) : (
							<Button type="button" variant="ghost" size="sm" disabled>
								检查 Hub
							</Button>
						)}
					</div>
				)}
			</div>
		</div>
	)
}

function getCurrentHubUrl() {
	return typeof pb.baseUrl === "string" ? pb.baseUrl : window.location.origin
}

function getHubConnectionError(error: unknown) {
	if (error && typeof error === "object" && "status" in error && (error as { status?: number }).status === 0) {
		return "无法连接到 Pulse Hub。请检查 Hub 地址、端口、防火墙，以及当前设备是否和 Hub 在同一网络。"
	}
	if (error instanceof Error) {
		return error.message
	}
	return "无法读取 Hub 初始化状态，请稍后重试。"
}
