import {
	EyeIcon,
	KeyRoundIcon,
	MoreHorizontalIcon,
	PencilIcon,
	PlusIcon,
	RefreshCwIcon,
	ShieldCheckIcon,
	Trash2Icon,
	UserRoundCheckIcon,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { MobileUsersView, type MobileUserItem } from "@/components/mobile/mobile-users"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"
import { pb } from "@/lib/api"
import { SettingsTableEmptyRow } from "./settings-empty-state"

type AppUser = {
	id: string
	username: string
	email: string
	role: AppUserRole
	created: string
	updated: string
}

type AppUserRole = "admin" | "user" | "readonly"

type UserForm = {
	username: string
	email: string
	password: string
	role: AppUserRole
}

const emptyForm: UserForm = {
	username: "",
	email: "",
	password: "",
	role: "user",
}

export default function Users() {
	const [users, setUsers] = useState<AppUser[]>([])
	const [loading, setLoading] = useState(false)
	const [saving, setSaving] = useState(false)
	const [dialogMode, setDialogMode] = useState<"create" | "edit" | "password" | "delete" | null>(null)
	const [selectedUser, setSelectedUser] = useState<AppUser | null>(null)
	const [form, setForm] = useState<UserForm>(emptyForm)
	const { toast } = useToast()

	const currentUserId = pb.authStore.record?.id
	const adminCount = useMemo(() => users.filter((user) => user.role === "admin").length, [users])
	const userCount = users.filter((user) => user.role === "user").length
	const readonlyCount = users.filter((user) => user.role === "readonly").length
	const latestUser = useMemo(
		() =>
			users
				.slice()
				.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
				.at(0),
		[users]
	)
	const mobileUsers = useMemo<MobileUserItem[]>(
		() =>
			users.map((user) => ({
				id: user.id,
				username: user.username,
				email: user.email,
				roleLabel: getRoleLabel(user.role),
				roleTone: getRoleTone(user.role),
				created: formatTime(user.created),
				isCurrent: user.id === currentUserId,
				canDelete: user.id !== currentUserId && !(user.role === "admin" && adminCount <= 1),
			})),
		[adminCount, currentUserId, users]
	)
	const userById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users])

	const loadUsers = useCallback(async () => {
		setLoading(true)
		try {
			const data = await pb.send<{ items: AppUser[] }>("/api/pulse/users", {})
			setUsers(data.items)
		} catch (error) {
			console.error(error)
			toast({ title: "加载用户失败", description: "请确认当前账号拥有管理员权限。", variant: "destructive" })
		} finally {
			setLoading(false)
		}
	}, [toast])

	useEffect(() => {
		loadUsers()
	}, [loadUsers])

	function openCreateDialog() {
		setSelectedUser(null)
		setForm(emptyForm)
		setDialogMode("create")
	}

	function openEditDialog(user: AppUser) {
		setSelectedUser(user)
		setForm({
			username: user.username,
			email: user.email,
			password: "",
			role: user.role || "user",
		})
		setDialogMode("edit")
	}

	function openPasswordDialog(user: AppUser) {
		setSelectedUser(user)
		setForm({ ...emptyForm, password: "" })
		setDialogMode("password")
	}

	function openDeleteDialog(user: AppUser) {
		setSelectedUser(user)
		setDialogMode("delete")
	}

	function getUserFromMobileItem(item: MobileUserItem) {
		return userById.get(item.id)
	}

	function editMobileUser(item: MobileUserItem) {
		const user = getUserFromMobileItem(item)
		if (user) openEditDialog(user)
	}

	function resetMobileUserPassword(item: MobileUserItem) {
		const user = getUserFromMobileItem(item)
		if (user) openPasswordDialog(user)
	}

	function deleteMobileUser(item: MobileUserItem) {
		const user = getUserFromMobileItem(item)
		if (user) openDeleteDialog(user)
	}

	function closeDialog() {
		if (saving) return
		setDialogMode(null)
		setSelectedUser(null)
		setForm(emptyForm)
	}

	async function createUser() {
		setSaving(true)
		try {
			const data = await pb.send<{ item: AppUser }>("/api/pulse/users", {
				method: "POST",
				body: JSON.stringify(form),
			})
			setUsers((items) => [...items, data.item].sort(sortUsers))
			toast({ title: "用户已添加", description: `${data.item.username} 可以使用用户名或邮箱登录。` })
			closeDialog()
		} catch (error) {
			console.error(error)
			toast({ title: "添加用户失败", description: getErrorMessage(error), variant: "destructive" })
		} finally {
			setSaving(false)
		}
	}

	async function updateUser() {
		if (!selectedUser) return
		setSaving(true)
		try {
			const data = await pb.send<{ item: AppUser }>(`/api/pulse/users/${selectedUser.id}`, {
				method: "PATCH",
				body: JSON.stringify({
					username: form.username,
					email: form.email,
					role: form.role,
				}),
			})
			setUsers((items) => items.map((item) => (item.id === data.item.id ? data.item : item)).sort(sortUsers))
			toast({ title: "用户已更新", description: `${data.item.username} 的账号信息已保存。` })
			closeDialog()
		} catch (error) {
			console.error(error)
			toast({ title: "更新用户失败", description: getErrorMessage(error), variant: "destructive" })
		} finally {
			setSaving(false)
		}
	}

	async function resetPassword() {
		if (!selectedUser) return
		setSaving(true)
		try {
			await pb.send(`/api/pulse/users/${selectedUser.id}/password`, {
				method: "POST",
				body: JSON.stringify({ password: form.password }),
			})
			toast({ title: "密码已重置", description: `${selectedUser.username} 可以使用新密码登录。` })
			closeDialog()
		} catch (error) {
			console.error(error)
			toast({ title: "重置密码失败", description: getErrorMessage(error), variant: "destructive" })
		} finally {
			setSaving(false)
		}
	}

	async function deleteUser() {
		if (!selectedUser) return
		setSaving(true)
		try {
			await pb.send(`/api/pulse/users/${selectedUser.id}`, { method: "DELETE" })
			setUsers((items) => items.filter((item) => item.id !== selectedUser.id))
			toast({ title: "用户已删除", description: `${selectedUser.username} 已从系统中移除。` })
			closeDialog()
		} catch (error) {
			console.error(error)
			toast({ title: "删除用户失败", description: getErrorMessage(error), variant: "destructive" })
		} finally {
			setSaving(false)
		}
	}

	const canDeleteSelected =
		selectedUser && selectedUser.id !== currentUserId && !(selectedUser.role === "admin" && adminCount <= 1)

	return (
		<div className="grid gap-4">
			<div className="hidden rounded-lg border border-border/70 bg-surface-soft p-3 shadow-none md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-4">
				<div className="grid gap-1">
					<h3 className="text-lg font-semibold tracking-tight">用户管理</h3>
					<p className="max-w-2xl text-sm text-muted-foreground">
						维护登录账号、角色权限和密码重置。管理员和最后一个管理员的保护规则由 Hub 继续强制执行。
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						className="bg-card transition-transform active:scale-[0.96]"
						onClick={loadUsers}
						disabled={loading}
					>
						<RefreshCwIcon className={`me-2 size-4 ${loading ? "animate-spin" : ""}`} />
						刷新
					</Button>
					<Button size="sm" className="transition-transform active:scale-[0.96]" onClick={openCreateDialog}>
						<PlusIcon className="me-2 size-4" />
						添加用户
					</Button>
				</div>
			</div>

			<DesktopUsersOverview
				total={users.length}
				adminCount={adminCount}
				userCount={userCount}
				readonlyCount={readonlyCount}
				latestUser={latestUser}
				currentUsername={users.find((user) => user.id === currentUserId)?.username}
			/>

			<MobileUsersView
				items={mobileUsers}
				loading={loading}
				onRefresh={loadUsers}
				onCreate={openCreateDialog}
				onEdit={editMobileUser}
				onResetPassword={resetMobileUserPassword}
				onDelete={deleteMobileUser}
			/>

			<RoleExplanationPanel />

			<div className="hidden overflow-hidden rounded-lg border border-border/70 bg-card shadow-none md:block">
				<Table>
					<TableHeader>
						<TableRow className="bg-surface-soft hover:bg-surface-soft">
							<TableHead>用户名</TableHead>
							<TableHead>邮箱</TableHead>
							<TableHead className="w-28">角色</TableHead>
							<TableHead className="w-44">创建时间</TableHead>
							<TableHead className="w-16 text-right">操作</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{users.length ? (
							users.map((user) => (
								<TableRow key={user.id} className="hover:bg-surface-soft">
									<TableCell>
										<div className="flex min-w-0 items-center gap-2">
											<span className="truncate font-medium">{user.username || "-"}</span>
											{user.id === currentUserId && (
												<Badge variant="secondary" className="h-5 shrink-0 px-2 text-[11px]">
													当前账号
												</Badge>
											)}
										</div>
									</TableCell>
									<TableCell className="text-muted-foreground">{user.email || "未设置邮箱"}</TableCell>
									<TableCell>
										<Badge
											variant={user.role === "admin" ? "default" : user.role === "readonly" ? "outline" : "secondary"}
											className="h-6 px-2.5"
										>
											{getRoleLabel(user.role)}
										</Badge>
									</TableCell>
									<TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
										{formatTime(user.created)}
									</TableCell>
									<TableCell className="text-right">
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button
													variant="ghost"
													size="icon"
													className="size-10 transition-transform active:scale-[0.96]"
												>
													<MoreHorizontalIcon className="size-4" />
													<span className="sr-only">打开菜单</span>
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end">
												<DropdownMenuItem onSelect={() => openEditDialog(user)}>
													<PencilIcon className="me-2 size-4" />
													编辑
												</DropdownMenuItem>
												<DropdownMenuItem onSelect={() => openPasswordDialog(user)}>
													<KeyRoundIcon className="me-2 size-4" />
													重置密码
												</DropdownMenuItem>
												<DropdownMenuSeparator />
												<DropdownMenuItem
													className="text-destructive focus:text-destructive"
													disabled={user.id === currentUserId || (user.role === "admin" && adminCount <= 1)}
													onSelect={() => openDeleteDialog(user)}
												>
													<Trash2Icon className="me-2 size-4" />
													删除
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									</TableCell>
								</TableRow>
							))
						) : (
							<SettingsTableEmptyRow
								colSpan={5}
								loading={loading}
								loadingText="正在读取用户列表"
								emptyText="暂无用户"
							/>
						)}
					</TableBody>
				</Table>
			</div>

			<Dialog open={dialogMode === "create" || dialogMode === "edit"} onOpenChange={(open) => !open && closeDialog()}>
				<DialogContent className="overflow-hidden p-0 sm:max-w-lg">
					<DialogHeader className="border-b border-border/70 px-5 py-4">
						<DialogTitle>{dialogMode === "create" ? "添加用户" : "编辑用户"}</DialogTitle>
						<DialogDescription>用户名和邮箱都可以作为登录账号，邮箱不需要验证。</DialogDescription>
					</DialogHeader>
					<div className="bg-surface-soft px-5 py-4">
						<UserFields
							form={form}
							setForm={setForm}
							includePassword={dialogMode === "create"}
							disableRoleChange={selectedUser?.role === "admin" && adminCount <= 1}
						/>
					</div>
					<DialogFooter className="border-t border-border/70 bg-card px-5 py-4">
						<Button
							variant="outline"
							className="transition-transform active:scale-[0.96]"
							onClick={closeDialog}
							disabled={saving}
						>
							取消
						</Button>
						<Button
							className="transition-transform active:scale-[0.96]"
							onClick={dialogMode === "create" ? createUser : updateUser}
							disabled={saving}
						>
							{saving ? "保存中..." : "保存"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={dialogMode === "password"} onOpenChange={(open) => !open && closeDialog()}>
				<DialogContent className="overflow-hidden p-0 sm:max-w-lg">
					<DialogHeader className="border-b border-border/70 px-5 py-4">
						<DialogTitle>重置密码</DialogTitle>
						<DialogDescription>为 {selectedUser?.username} 设置一个不少于 8 位的新密码。</DialogDescription>
					</DialogHeader>
					<div className="bg-surface-soft px-5 py-4">
						<div className="grid gap-2 rounded-lg border border-border/70 bg-card p-3 shadow-none">
							<Label htmlFor="new-password">新密码</Label>
							<Input
								id="new-password"
								type="password"
								autoComplete="new-password"
								value={form.password}
								onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
							/>
						</div>
					</div>
					<DialogFooter className="border-t border-border/70 bg-card px-5 py-4">
						<Button
							variant="outline"
							className="transition-transform active:scale-[0.96]"
							onClick={closeDialog}
							disabled={saving}
						>
							取消
						</Button>
						<Button
							className="transition-transform active:scale-[0.96]"
							onClick={resetPassword}
							disabled={saving || form.password.length < 8}
						>
							{saving ? "保存中..." : "重置密码"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={dialogMode === "delete"} onOpenChange={(open) => !open && closeDialog()}>
				<DialogContent className="overflow-hidden p-0 sm:max-w-lg">
					<DialogHeader className="border-b border-border/70 px-5 py-4">
						<DialogTitle>删除用户</DialogTitle>
						<DialogDescription>
							{canDeleteSelected
								? `确认删除 ${selectedUser?.username}？删除后该账号将无法登录。`
								: "当前用户或最后一个管理员不能删除。"}
						</DialogDescription>
					</DialogHeader>
					<div className="bg-surface-soft px-5 py-4">
						{selectedUser && (
							<div className="rounded-lg border border-border/70 bg-card p-3 text-sm shadow-none">
								<div className="font-medium">{selectedUser.username || "-"}</div>
								<div className="mt-1 text-xs text-muted-foreground">
									{selectedUser.email || "未设置邮箱"} · {getRoleLabel(selectedUser.role)}
								</div>
							</div>
						)}
					</div>
					<DialogFooter className="border-t border-border/70 bg-card px-5 py-4">
						<Button
							variant="outline"
							className="transition-transform active:scale-[0.96]"
							onClick={closeDialog}
							disabled={saving}
						>
							取消
						</Button>
						<Button
							variant="destructive"
							className="transition-transform active:scale-[0.96]"
							onClick={deleteUser}
							disabled={saving || !canDeleteSelected}
						>
							{saving ? "删除中..." : "删除"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}

function UserFields({
	form,
	setForm,
	includePassword,
	disableRoleChange,
}: {
	form: UserForm
	setForm: React.Dispatch<React.SetStateAction<UserForm>>
	includePassword: boolean
	disableRoleChange?: boolean
}) {
	return (
		<div className="grid gap-4">
			<div className="grid gap-2 rounded-lg border border-border/70 bg-card p-3 shadow-none">
				<Label htmlFor="username">用户名</Label>
				<Input
					id="username"
					value={form.username}
					autoComplete="username"
					onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
				/>
			</div>
			<div className="grid gap-2 rounded-lg border border-border/70 bg-card p-3 shadow-none">
				<Label htmlFor="email">邮箱</Label>
				<Input
					id="email"
					type="email"
					value={form.email}
					autoComplete="email"
					onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
				/>
			</div>
			{includePassword && (
				<div className="grid gap-2 rounded-lg border border-border/70 bg-card p-3 shadow-none">
					<Label htmlFor="password">密码</Label>
					<Input
						id="password"
						type="password"
						value={form.password}
						autoComplete="new-password"
						onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
					/>
				</div>
			)}
			<div className="grid gap-2 rounded-lg border border-border/70 bg-card p-3 shadow-none">
				<Label>角色</Label>
				<Select
					value={form.role}
					onValueChange={(role: AppUserRole) => setForm((current) => ({ ...current, role }))}
					disabled={disableRoleChange}
				>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="admin">管理员</SelectItem>
						<SelectItem value="user">普通用户</SelectItem>
						<SelectItem value="readonly">只读用户</SelectItem>
					</SelectContent>
				</Select>
				<p className="text-xs leading-relaxed text-muted-foreground">{getRoleDescription(form.role)}</p>
			</div>
		</div>
	)
}

function RoleExplanationPanel() {
	return (
		<div className="hidden rounded-lg border border-border/70 bg-surface-soft p-2 shadow-none md:grid md:grid-cols-3 md:gap-2">
			{roleExplanations.map((role) => {
				const Icon = role.icon
				return (
					<div key={role.role} className="rounded-md border border-border/70 bg-card p-3 shadow-none">
						<div className="flex items-center gap-2 text-sm font-medium">
							<span className="inline-flex size-8 items-center justify-center rounded-md border border-border/70 bg-surface-soft">
								<Icon className="size-4 text-muted-foreground" />
							</span>
							{role.label}
						</div>
						<p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{role.description}</p>
					</div>
				)
			})}
		</div>
	)
}

function DesktopUsersOverview({
	total,
	adminCount,
	userCount,
	readonlyCount,
	latestUser,
	currentUsername,
}: {
	total: number
	adminCount: number
	userCount: number
	readonlyCount: number
	latestUser?: AppUser
	currentUsername?: string
}) {
	return (
		<div className="hidden grid-cols-4 gap-2 md:grid">
			<OverviewCard
				label="账号总数"
				value={`${total} 个`}
				detail={currentUsername ? `当前账号 ${currentUsername}` : "当前账号未识别"}
			/>
			<OverviewCard label="管理员" value={`${adminCount} 个`} detail="具备全局管理权限" />
			<OverviewCard label="普通 / 只读" value={`${userCount} / ${readonlyCount}`} detail="按当前角色统计" />
			<OverviewCard
				label="最近创建"
				value={latestUser?.username || "无"}
				detail={latestUser ? formatTime(latestUser.created) : "还没有用户记录"}
			/>
		</div>
	)
}

function OverviewCard({ label, value, detail }: { label: string; value: string; detail: string }) {
	return (
		<div className="min-w-0 rounded-lg border border-border/70 bg-card p-3 shadow-none">
			<div className="text-xs text-muted-foreground">{label}</div>
			<div className="mt-1 truncate text-xl font-semibold tracking-tight tabular-nums">{value}</div>
			<div className="mt-1 truncate text-xs text-muted-foreground">{detail}</div>
		</div>
	)
}

const roleExplanations: Array<{
	role: AppUserRole
	label: string
	description: string
	icon: React.ComponentType<{ className?: string }>
}> = [
	{
		role: "admin",
		label: "管理员",
		description: "可管理用户、备份、高级后台、Agent 接入和全局审计，也能执行允许的运维操作。",
		icon: ShieldCheckIcon,
	},
	{
		role: "user",
		label: "普通用户",
		description: "可查看和处理授权范围内的机器、告警和日常操作，不能进入用户、备份和高级后台管理。",
		icon: UserRoundCheckIcon,
	},
	{
		role: "readonly",
		label: "只读用户",
		description: "只能查看数据和状态，不应创建、修改、删除资源或触发控制类操作。",
		icon: EyeIcon,
	},
]

function sortUsers(a: AppUser, b: AppUser) {
	return a.username.localeCompare(b.username)
}

function getRoleLabel(role: string) {
	switch (role) {
		case "admin":
			return "管理员"
		case "readonly":
			return "只读"
		case "user":
		case "":
			return "普通用户"
		default:
			return role
	}
}

function getRoleDescription(role: string) {
	switch (role) {
		case "admin":
			return "管理员可管理用户、备份、高级后台、Agent 接入和全局审计，也能执行允许的运维操作。"
		case "readonly":
			return "只读用户只查看数据和状态，不创建、修改、删除资源，也不触发控制类操作。"
		default:
			return "普通用户可查看和处理授权范围内的机器、告警和日常操作，不能管理用户、备份和高级后台。"
	}
}

function getRoleTone(role: string): MobileUserItem["roleTone"] {
	switch (role) {
		case "admin":
			return "info"
		case "readonly":
			return "neutral"
		default:
			return "success"
	}
}

function formatTime(value: string) {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return value || "-"
	return date.toLocaleString("zh-CN", { hour12: false })
}

function getErrorMessage(error: unknown) {
	if (typeof error === "object" && error && "response" in error) {
		const response = (error as { response?: { message?: string } }).response
		return response?.message || "请检查输入内容后重试。"
	}
	return "请检查输入内容后重试。"
}
