import { t } from "@lingui/core/macro"
import { Trans } from "@lingui/react/macro"
import {
	AtSignIcon,
	KeyRoundIcon,
	LoaderCircle,
	LockIcon,
	LogInIcon,
	RefreshCwIcon,
	ShieldCheckIcon,
	UserIcon,
} from "lucide-react"
import { useCallback, useMemo, useState, type InputHTMLAttributes, type ReactNode } from "react"
import * as v from "valibot"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/otp"
import { pb } from "@/lib/api"
import { $authenticated } from "@/lib/stores"
import { cn } from "@/lib/utils"
import { toast } from "../ui/use-toast"

const honeypot = v.literal("")
const OTP_LENGTH = 6

type MfaChallenge = {
	identity: string
	mfaId: string
	otpId: string
}

type AuthFormOutput = {
	password: string
	passwordConfirm?: string
	username?: string
	email?: string
	identity?: string
}

type MfaAuthError = {
	status?: number
	message?: string
	response?: {
		code?: number
		mfaId?: string
		message?: string
	}
}

export type AuthFlowStage = "idle" | "submitting" | "admin-created" | "mfa-required" | "authenticated" | "error"

type LoginErrorCategory =
	| "hub_unreachable"
	| "invalid_credentials"
	| "mfa_required"
	| "mfa_invalid"
	| "permission_denied"
	| "session_expired"
	| "first_run_incomplete"
	| "rate_limited"
	| "unknown"

type LoginErrorInfo = {
	category: LoginErrorCategory
	title: string
	description: string
}

export const showLoginFaliedToast = (
	error: LoginErrorInfo | string = {
		category: "unknown",
		title: "登录失败",
		description: t`Please check your credentials and try again`,
	}
) => {
	const info =
		typeof error === "string"
			? {
					category: "unknown" as const,
					title: "登录失败",
					description: error,
				}
			: error
	toast({
		title: info.title,
		description: info.description,
		variant: "destructive",
	})
}

export function UserAuthForm({
	className,
	isFirstRun,
	onStageChange,
	...props
}: {
	className?: string
	isFirstRun: boolean
	onStageChange?: (stage: AuthFlowStage) => void
}) {
	const [isLoading, setIsLoading] = useState<boolean>(false)
	const [isResendingOtp, setIsResendingOtp] = useState<boolean>(false)
	const [errors, setErrors] = useState<Record<string, string | undefined>>({})
	const [mfaChallenge, setMfaChallenge] = useState<MfaChallenge | null>(null)
	const [otpCode, setOtpCode] = useState("")
	const schemas = useMemo(() => createAuthSchemas(), [])
	const setStage = useCallback((stage: AuthFlowStage) => onStageChange?.(stage), [onStageChange])

	const startMfaChallenge = useCallback(
		async (identity: string, mfaId: string) => {
			const otpResponse = await pb.collection("users").requestOTP(identity)
			setMfaChallenge({ identity, mfaId, otpId: otpResponse.otpId })
			setOtpCode("")
			setErrors({})
			setStage("mfa-required")
			toast({
				title: "需要二次验证",
				description: "验证码已发送到账号邮箱，请输入 6 位验证码完成登录。",
			})
		},
		[setStage]
	)

	const handleSubmit = useCallback(
		async (e: React.FormEvent<HTMLFormElement>) => {
			e.preventDefault()
			setIsLoading(true)
			try {
				const formData = new FormData(e.target as HTMLFormElement)
				const data = Object.fromEntries(formData)
				const Schema = isFirstRun ? schemas.RegisterSchema : schemas.LoginSchema
				const result = v.safeParse(Schema, data)
				if (!result.success) {
					const fieldErrors: Record<string, string | undefined> = {}
					for (const issue of result.issues) {
						const fieldKey = issue.path?.[0]?.key
						if (typeof fieldKey === "string") {
							fieldErrors[fieldKey] = issue.message
						}
					}
					setErrors(fieldErrors)
					setStage("error")
					return
				}
				setStage("submitting")
				const output = result.output as AuthFormOutput
				const { password, passwordConfirm } = output
				if (isFirstRun) {
					// check that passwords match
					if (password !== passwordConfirm) {
						const msg = "两次输入的密码不一致。"
						setErrors({ passwordConfirm: msg })
						setStage("error")
						return
					}
					const { username, email } = output
					await pb.send("/api/pulse/create-user", {
						method: "POST",
						body: JSON.stringify({ username: username ?? "", email: email ?? "", password }),
					})
					setStage("admin-created")
					try {
						await pb.collection("users").authWithPassword(email ?? "", password)
					} catch (err: unknown) {
						const mfaId = getMfaId(err)
						if (!mfaId) {
							throw err
						}
						await startMfaChallenge(email ?? "", mfaId)
						return
					}
				} else {
					try {
						await pb.collection("users").authWithPassword(output.identity ?? "", password)
					} catch (err: unknown) {
						const mfaId = getMfaId(err)
						if (!mfaId) {
							throw err
						}
						await startMfaChallenge(output.identity ?? "", mfaId)
						return
					}
				}
				setStage("authenticated")
				if (isFirstRun) {
					toast({
						title: "初始化完成",
						description: "首个管理员已创建，正在进入 Pulse。",
					})
				}
				$authenticated.set(true)
			} catch (err: unknown) {
				const info = getLoginErrorInfo(err, { isFirstRun })
				setErrors({ root: info.description })
				setStage("error")
				showLoginFaliedToast(info)
			} finally {
				setIsLoading(false)
			}
		},
		[isFirstRun, schemas, setStage, startMfaChallenge]
	)

	const handleMfaSubmit = useCallback(
		async (e: React.FormEvent<HTMLFormElement>) => {
			e.preventDefault()
			if (!mfaChallenge) {
				return
			}
			const code = normalizeOtpCode(otpCode)
			if (code.length !== OTP_LENGTH) {
				setErrors({ otp: "请输入 6 位验证码。" })
				return
			}
			setIsLoading(true)
			try {
				await pb.collection("users").authWithOTP(mfaChallenge.otpId, code, { mfaId: mfaChallenge.mfaId })
				setStage("authenticated")
				$authenticated.set(true)
			} catch (err: unknown) {
				const info = getOtpLoginErrorInfo(err)
				setErrors({ otp: info.description })
				showLoginFaliedToast(info)
			} finally {
				setIsLoading(false)
			}
		},
		[mfaChallenge, otpCode, setStage]
	)

	const handleResendOtp = useCallback(async () => {
		if (!mfaChallenge) {
			return
		}
		setIsResendingOtp(true)
		try {
			const otpResponse = await pb.collection("users").requestOTP(mfaChallenge.identity)
			setMfaChallenge({ ...mfaChallenge, otpId: otpResponse.otpId })
			setOtpCode("")
			setErrors({})
			toast({
				title: "验证码已重新发送",
				description: "请使用最新收到的 6 位验证码完成登录。",
			})
		} catch (err: unknown) {
			const info = getOtpRequestErrorInfo(err)
			setErrors({ otp: info.description })
			showLoginFaliedToast(info)
		} finally {
			setIsResendingOtp(false)
		}
	}, [mfaChallenge])

	const resetMfaChallenge = useCallback(() => {
		setMfaChallenge(null)
		setOtpCode("")
		setErrors({})
		setStage("idle")
	}, [])

	if (mfaChallenge) {
		return (
			<div
				className={cn("grid gap-3 rounded-lg border border-border/70 bg-surface-soft p-2 shadow-none", className)}
				{...props}
			>
				<form onSubmit={handleMfaSubmit} onChange={() => setErrors({})}>
					<div className="grid gap-3">
						<div className="grid gap-2 rounded-md border border-border/70 bg-card px-3 py-3 text-center shadow-none">
							<div className="mx-auto flex size-10 items-center justify-center rounded-md border border-border/70 bg-surface-soft">
								<ShieldCheckIcon className="size-5 text-primary" />
							</div>
							<div className="grid gap-1">
								<h2 className="text-base font-semibold ">二次验证</h2>
								<p className="text-pretty text-sm text-muted-foreground">
									请输入发送到账号邮箱的 6 位验证码。验证码会短时间内过期。
								</p>
							</div>
						</div>
						<div className="grid justify-center gap-2 rounded-md border border-border/70 bg-card px-3 py-3">
							<div className="text-center text-xs font-medium text-muted-foreground">邮箱验证码</div>
							<InputOTP
								value={otpCode}
								onChange={(value) => setOtpCode(normalizeOtpCode(value))}
								maxLength={OTP_LENGTH}
								disabled={isLoading || isResendingOtp}
								autoFocus
								containerClassName="justify-center"
							>
								<InputOTPGroup>
									{Array.from({ length: OTP_LENGTH }).map((_, index) => (
										<InputOTPSlot key={index} index={index} />
									))}
								</InputOTPGroup>
							</InputOTP>
							{errors?.otp && (
								<p role="alert" className="max-w-72 px-1 text-center text-xs font-medium text-destructive">
									{errors.otp}
								</p>
							)}
						</div>
						<div className="grid gap-2 rounded-md border border-border/70 bg-card p-2">
							<button className={cn(buttonVariants(), "h-11 w-full")} disabled={isLoading || isResendingOtp}>
								{isLoading ? (
									<LoaderCircle className="me-2 h-4 w-4 animate-spin" />
								) : (
									<KeyRoundIcon className="me-2 h-4 w-4" />
								)}
								验证并登录
							</button>
							<button
								type="button"
								className={cn(buttonVariants({ variant: "outline" }), "h-10")}
								disabled={isLoading || isResendingOtp}
								onClick={handleResendOtp}
							>
								{isResendingOtp ? (
									<LoaderCircle className="me-2 h-4 w-4 animate-spin" />
								) : (
									<RefreshCwIcon className="me-2 h-4 w-4" />
								)}
								重新发送
							</button>
							<button
								type="button"
								className={cn(buttonVariants({ variant: "ghost" }), "h-10 text-muted-foreground")}
								disabled={isLoading || isResendingOtp}
								onClick={resetMfaChallenge}
							>
								返回登录
							</button>
						</div>
						{errors?.root && (
							<p
								role="alert"
								className="rounded-lg border border-destructive/30 bg-card px-3 py-2 text-sm font-medium text-destructive shadow-none"
							>
								{errors.root}
							</p>
						)}
					</div>
				</form>
			</div>
		)
	}

	return (
		<div
			className={cn("grid gap-3 rounded-lg border border-border/70 bg-surface-soft p-2 shadow-none", className)}
			{...props}
		>
			<form onSubmit={handleSubmit} onChange={() => setErrors({})}>
				<div className="grid gap-3">
					{isFirstRun ? (
						<>
							<AuthField
								icon={<UserIcon className="size-4" />}
								id="username"
								name="username"
								label={<Trans>Username</Trans>}
								required
								placeholder="用户名"
								type="text"
								autoCapitalize="none"
								autoComplete="username"
								autoCorrect="off"
								disabled={isLoading}
								error={errors?.username}
							/>
							<AuthField
								icon={<AtSignIcon className="size-4" />}
								id="email"
								name="email"
								label={<Trans>Email</Trans>}
								required
								placeholder="邮箱"
								type="email"
								autoCapitalize="none"
								autoComplete="email"
								autoCorrect="off"
								disabled={isLoading}
								error={errors?.email}
							/>
						</>
					) : (
						<AuthField
							icon={<UserIcon className="size-4" />}
							id="identity"
							name="identity"
							label="账号"
							required
							placeholder="用户名或邮箱"
							type="text"
							autoCapitalize="none"
							autoComplete="username"
							autoCorrect="off"
							disabled={isLoading}
							error={errors?.identity}
						/>
					)}
					<AuthField
						icon={<LockIcon className="size-4" />}
						id="pass"
						name="password"
						label={<Trans>Password</Trans>}
						placeholder={t`Password`}
						required
						type="password"
						autoComplete="current-password"
						disabled={isLoading}
						error={errors?.password}
					/>
					{isFirstRun && (
						<AuthField
							icon={<LockIcon className="size-4" />}
							id="pass2"
							name="passwordConfirm"
							label={<Trans>Confirm password</Trans>}
							placeholder={t`Confirm password`}
							required
							type="password"
							autoComplete="current-password"
							disabled={isLoading}
							error={errors?.passwordConfirm}
						/>
					)}
					<input
						id="website"
						type="text"
						name="website"
						tabIndex={-1}
						autoComplete="off"
						aria-hidden="true"
						className="hidden"
						data-1p-ignore
						data-lpignore="true"
						data-bwignore
						data-form-type="other"
						data-protonpass-ignore
					/>
					<div className="grid gap-2 rounded-lg border border-border/70 bg-card p-2">
						<button className={cn(buttonVariants(), "h-11 w-full")} disabled={isLoading}>
							{isLoading ? (
								<LoaderCircle className="me-2 h-4 w-4 animate-spin" />
							) : (
								<LogInIcon className="me-2 h-4 w-4" />
							)}
							{isFirstRun ? t`Create account` : t`Sign in`}
						</button>
					</div>
					{errors?.root && (
						<p
							role="alert"
							className="rounded-lg border border-destructive/30 bg-card px-3 py-2 text-sm font-medium text-destructive shadow-none"
						>
							{errors.root}
						</p>
					)}
				</div>
			</form>
		</div>
	)
}

type AuthFieldProps = InputHTMLAttributes<HTMLInputElement> & {
	error?: string
	icon: ReactNode
	label: ReactNode
}

function AuthField({ className, error, icon, id, label, ...inputProps }: AuthFieldProps) {
	return (
		<div
			className={cn(
				"grid gap-2 rounded-lg border border-border/70 bg-card p-2 shadow-none",
				error && "border-destructive/35 bg-card"
			)}
		>
			<div className="flex min-w-0 items-center gap-2 px-1 text-muted-foreground">
				<span className="grid size-5 shrink-0 place-items-center">{icon}</span>
				<Label htmlFor={id} className="truncate text-xs font-medium">
					{label}
				</Label>
			</div>
			<Input
				id={id}
				aria-invalid={Boolean(error)}
				className={cn("h-10 bg-card px-3.5 shadow-none", className)}
				{...inputProps}
			/>
			{error && (
				<p role="alert" className="px-1 text-xs font-medium text-destructive">
					{error}
				</p>
			)}
		</div>
	)
}

function normalizeOtpCode(value: string) {
	return value.replace(/\D/g, "").slice(0, OTP_LENGTH)
}

function getMfaId(error: unknown) {
	const mfaId = (error as MfaAuthError)?.response?.mfaId
	return typeof mfaId === "string" && mfaId.length > 0 ? mfaId : undefined
}

function getLoginErrorInfo(error: unknown, options?: { isFirstRun?: boolean }): LoginErrorInfo {
	const authError = error as MfaAuthError
	if (getMfaId(error)) {
		return loginError("mfa_required", "需要二次验证", "该账号需要二次验证，请输入邮箱验证码完成登录。")
	}
	if (authError?.status === 0) {
		return loginError(
			"hub_unreachable",
			"Hub 连接失败",
			"无法连接到 Pulse Hub，请检查 Hub 地址、端口、防火墙，以及当前设备是否能访问 Hub。"
		)
	}
	if (authError?.status === 429) {
		return loginError("rate_limited", "登录被限速", "登录失败次数过多，请稍后再试。")
	}
	if (options?.isFirstRun && (authError?.status === 403 || authError?.status === 404 || authError?.status === 409)) {
		return loginError(
			"first_run_incomplete",
			"初始化状态已变化",
			"当前 Hub 已完成初始化或初始化入口不可用，请刷新后使用管理员账号登录。"
		)
	}
	if (authError?.status === 401) {
		return loginError("session_expired", "登录已过期", "登录状态已过期，请重新登录。")
	}
	if (authError?.status === 403) {
		return loginError("permission_denied", "权限不足", "当前账号没有权限进入 Pulse。")
	}
	if (authError?.status === 400) {
		return loginError("invalid_credentials", "账号或密码错误", "账号或密码不正确。")
	}
	return loginError("unknown", "登录失败", "登录请求失败，请稍后重试；如果问题持续存在，请查看 Hub 日志。")
}

function getOtpRequestErrorInfo(error: unknown): LoginErrorInfo {
	const authError = error as MfaAuthError
	if (authError?.status === 0) {
		return loginError("hub_unreachable", "Hub 连接失败", "无法连接到 Pulse Hub，验证码没有发送成功。")
	}
	if (authError?.status === 400 || authError?.status === 404) {
		return loginError("mfa_required", "验证码发送失败", "请使用绑定邮箱登录，或检查账号是否已配置邮箱验证码。")
	}
	return loginError("unknown", "验证码发送失败", "验证码发送失败，请稍后重试。")
}

function getOtpLoginErrorInfo(error: unknown): LoginErrorInfo {
	const authError = error as MfaAuthError
	if (authError?.status === 0) {
		return loginError("hub_unreachable", "Hub 连接失败", "无法连接到 Pulse Hub，验证码没有提交成功。")
	}
	if (authError?.status === 400 || authError?.status === 401 || authError?.status === 403) {
		return loginError("mfa_invalid", "验证码无效", "验证码无效或已过期，请确认后重试。")
	}
	return loginError("unknown", "验证码验证失败", "验证码验证失败，请稍后重试。")
}

function loginError(category: LoginErrorCategory, title: string, description: string): LoginErrorInfo {
	return { category, title, description }
}

function createAuthSchemas() {
	const usernameSchema = v.pipe(
		v.string(),
		v.trim(),
		v.minLength(3, t`Username must be at least 3 characters.`),
		v.maxLength(32, t`Username must be less than 32 characters.`),
		v.regex(/^[a-zA-Z0-9_.-]+$/, t`Username can only contain letters, numbers, _.-`)
	)
	const identitySchema = v.pipe(v.string(), v.trim(), v.minLength(1, t`Username or email is required.`))
	const emailSchema = v.pipe(v.string(), v.rfcEmail(t`Invalid email address.`))
	const passwordSchema = v.pipe(
		v.string(),
		v.minLength(8, t`Password must be at least 8 characters.`),
		v.maxBytes(72, t`Password must be less than 72 bytes.`)
	)

	return {
		LoginSchema: v.looseObject({
			website: honeypot,
			identity: identitySchema,
			password: passwordSchema,
		}),
		RegisterSchema: v.looseObject({
			website: honeypot,
			username: usernameSchema,
			email: emailSchema,
			password: passwordSchema,
			passwordConfirm: passwordSchema,
		}),
	}
}
