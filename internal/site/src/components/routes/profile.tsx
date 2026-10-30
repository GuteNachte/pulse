import { useEffect, useState } from "react"

import { isAdmin, pb } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx"
import { Label } from "@/components/ui/label"

// 个人资料：账户信息 + 自助修改登录密码（所有用户）。
// 管理员的登录密码与 PocketBase 高级维护后台密码是同一套（后端事务内同步），
// 表单处有重点提示。
export default function Profile() {
	const [identity, setIdentity] = useState<{ username: string; email: string }>({ username: "", email: "" })
	const [currentPassword, setCurrentPassword] = useState("")
	const [newPassword, setNewPassword] = useState("")
	const [confirmPassword, setConfirmPassword] = useState("")
	const [submitting, setSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [success, setSuccess] = useState(false)
	const admin = isAdmin()

	useEffect(() => {
		const record = pb.authStore.record
		if (record) {
			setIdentity({
				username: record.username || record.email || "",
				email: record.email || "",
			})
		}
	}, [])

	function resetForm() {
		setCurrentPassword("")
		setNewPassword("")
		setConfirmPassword("")
	}

	async function submitPassword() {
		setError(null)
		setSuccess(false)
		if (!currentPassword || !newPassword) {
			setError("当前密码与新密码都不能为空。")
			return
		}
		if (newPassword !== confirmPassword) {
			setError("两次输入的新密码不一致。")
			return
		}
		if (newPassword.length < 8) {
			setError("新密码至少需要 8 位。")
			return
		}
		const record = pb.authStore.record
		if (!record) {
			setError("登录状态已失效，请重新登录。")
			return
		}
		setSubmitting(true)
		try {
			await pb.send("/api/pulse/account/password", {
				method: "POST",
				body: JSON.stringify({ currentPassword, newPassword }),
				requestKey: null,
			})
			setSuccess(true)
			resetForm()
		} catch (err) {
			const message = err instanceof Error ? err.message : ""
			if (/当前密码不正确/.test(message)) {
				setError("当前密码不正确。")
			} else if (/至少 8 位/.test(message)) {
				setError("新密码至少需要 8 位。")
			} else {
				setError("密码修改失败，请稍后再试。")
			}
		} finally {
			setSubmitting(false)
		}
	}

	return (
		<Card className="mx-auto mb-14 w-full max-w-2xl rounded-lg border-border/70 bg-card px-4 py-5 shadow-none sm:px-6 sm:py-6">
			<CardHeader className="border-b border-border/70 p-0 pb-4">
				<CardTitle className="text-lg">个人资料</CardTitle>
				<p className="mt-1 text-sm text-muted-foreground">管理你的账户信息与登录密码。</p>
			</CardHeader>
			<CardContent className="pt-4">
				<section className="space-y-3 rounded-lg border border-border/70 bg-surface-soft p-4">
					<div className="text-sm font-semibold">账户信息</div>
					<div className="grid gap-2 sm:grid-cols-2">
						<div>
							<Label htmlFor="profile-username">用户名</Label>
							<input
								id="profile-username"
								readOnly
								className="h-9 w-full rounded-md border border-border bg-muted/40 px-3 text-sm text-muted-foreground"
								value={identity.username}
							/>
						</div>
						<div>
							<Label htmlFor="profile-email">邮箱</Label>
							<input
								id="profile-email"
								readOnly
								className="h-9 w-full rounded-md border border-border bg-muted/40 px-3 text-sm text-muted-foreground"
								value={identity.email}
							/>
						</div>
					</div>
				</section>

				<section className="space-y-3 rounded-lg border border-border/70 bg-surface-soft p-4">
					<div className="text-sm font-semibold">修改登录密码</div>
					{admin ? (
						<p className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
							管理员注意：这个密码同时用于登录 Pulse 和进入高级维护后台（/_/），修改后两处同步生效。请妥善保管。
						</p>
					) : (
						<p className="text-xs leading-5 text-muted-foreground">修改后当前登录保持有效；下次登录请使用新密码。</p>
					)}
					<div className="grid gap-2 sm:grid-cols-3">
						<div>
							<Label htmlFor="pw-current">当前密码</Label>
							<input
								id="pw-current"
								type="password"
								autoComplete="current-password"
								className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
								value={currentPassword}
								onChange={(event) => setCurrentPassword(event.target.value)}
							/>
						</div>
						<div>
							<Label htmlFor="pw-new">新密码（至少 8 位）</Label>
							<input
								id="pw-new"
								type="password"
								autoComplete="new-password"
								className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
								value={newPassword}
								onChange={(event) => setNewPassword(event.target.value)}
							/>
						</div>
						<div>
							<Label htmlFor="pw-confirm">确认新密码</Label>
							<input
								id="pw-confirm"
								type="password"
								autoComplete="new-password"
								className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
								value={confirmPassword}
								onChange={(event) => setConfirmPassword(event.target.value)}
							/>
						</div>
					</div>
					{error && <p className="text-sm text-destructive">{error}</p>}
					{success && (
						<p className="text-sm font-medium text-emerald-600">
							密码已更新。{admin && "高级维护后台（/_/）请使用新密码登录。"}
						</p>
					)}
					<button
						type="button"
						className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
						disabled={submitting}
						onClick={() => {
							submitPassword()
						}}
					>
						{submitting ? "正在更新…" : "更新登录密码"}
					</button>
				</section>
			</CardContent>
		</Card>
	)
}
