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
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/ui/use-toast"
import { pb } from "@/lib/api"
import { formatDateTime } from "@/lib/utils"
import { SettingsPageHeader } from "./components/page-header"
import { SettingsSection } from "./components/section"
import { SettingsTableCard } from "./components/table-card"
import { SettingsToolbar } from "./components/toolbar"
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

type RoleFilter = "all" | AppUserRole

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
	const [query, setQuery] = useState("")
	const [roleFilter, setRoleFilter] = useState<RoleFilter>("all")
	const [dialogMode, setDialogMode] = useState<"create" | "edit" | "password" | "delete" | null>(null)
	const [selectedUser, setSelectedUser] = useState<AppUser | null>(null)
	const [form, setForm] = useState<UserForm>(emptyForm)
	const { toast } = useToast()

	const currentUserId = pb.authStore.record?.id
	const adminCount = useMemo(() => users.filter((user) => user.role === "admin").length, [users])
	const userCount = users.filter((user) => user.role === "user").length
	const readonlyCount = users.filter((user) => user.role === "readonly").length

	const filteredUsers = useMemo(() => {
		const keyword = query.trim().toLowerCase()
		return users.filter((user) => {
			const matchesText =
				!keyword ||
				[user.username, user.email, getRoleLabel(user.role)].some((value) => value.toLowerCase().includes(keyword))
			const matchesRole = roleFilter === "all" || user.role === roleFilter
			return matchesText && matchesRole
		})
	}, [users, query, roleFilter])

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
	const hasFilters = query.trim().length > 0 || roleFilter !== "all"

	return (
		<div className="grid pulse-card-gap">
			<SettingsPageHeader
				eyebrow="账户与数据"
				title="用户管理"
				description="管理登录账号、角色和密码。管理员和最后一个管理员的保护规则由 Hub 强制执行。"
				actions={
					<Button onClick={openCreateDialog} className="gap-1.5">
						<PlusIcon className="size-4" />
						添加用户
					</Button>
				}
			/>

			<SettingsToolbar
				left={
					<>
						<Input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="搜索用户名或邮箱"
							className="w-full sm:w-64"
							aria-label="搜索用户"
						/>
						<Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as RoleFilter)}>
							<SelectTrigger className="w-36" aria-label="按角色筛选">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">全部角色</SelectItem>
								<SelectItem value="admin">管理员</SelectItem>
								<SelectItem value="user">普通用户</SelectItem>
								<SelectItem value="readonly">只读用户</SelectItem>
							</SelectContent>
						</Select>
					</>
				}
				right={
					<>
						<Button variant="outline" size="sm" onClick={loadUsers} disabled={loading} className="gap-1.5">
							<RefreshCwIcon className={loading ? "size-4 animate-spin" : "size-4"} />
							刷新
						</Button>
						<Button size="sm" onClick={openCreateDialog} className="gap-1.5 lg:hidden">
							<PlusIcon className="size-4" />
							添加
						</Button>
					</>
				}
			/>

			<SettingsTableCard
				footer={
					<span>
						共 {users.length} 位用户 · 管理员 {adminCount} · 普通 {userCount} · 只读 {readonlyCount}
						{hasFilters ? ` · 当前显示 ${filteredUsers.length}` : ""}
					</span>
				}
			>
				<div className="overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow className="bg-surface-soft hover:bg-surface-soft">
								<TableHead>用户</TableHead>
								<TableHead className="w-32">角色</TableHead>
								<TableHead className="w-44">创建时间</TableHead>
								<TableHead className="w-44">最近更新</TableHead>
								<TableHead className="w-16 text-right">操作</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{filteredUsers.length ? (
								filteredUsers.map((user) => (
									<TableRow key={user.id} className="hover:bg-surface-soft">
										<TableCell>
											<div className="flex min-w-0 items-center gap-3">
												<span className="grid size-8 shrink-0 place-items-center rounded-full border border-border/70 bg-surface-soft text-xs font-semibold text-muted-foreground">
													{(user.username || "?").slice(0, 1)}
												</span>
												<div className="min-w-0">
													<div className="flex min-w-0 items-center gap-2">
														<span className="truncate font-medium">{user.username || "-"}</span>
														{user.id === currentUserId && (
															<Badge variant="secondary" className="h-5 shrink-0 px-2 text-[11px]">
																当前账号
															</Badge>
														)}
													</div>
													<div className="truncate text-xs text-muted-foreground">{user.email || "未设置邮箱"}</div>
												</div>
											</div>
										</TableCell>
										<TableCell>
											<Badge
												variant={user.role === "admin" ? "default" : user.role === "readonly" ? "outline" : "secondary"}
												className="h-6 px-2.5"
											>
												{getRoleLabel(user.role)}
											</Badge>
										</TableCell>
										<TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
											{formatDateTime(user.created)}
										</TableCell>
										<TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
											{formatDateTime(user.updated)}
										</TableCell>
										<TableCell className="text-right">
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button variant="ghost" size="icon" className="size-10">
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
									emptyText={hasFilters ? "没有匹配的用户" : "暂无用户"}
								/>
							)}
						</TableBody>
					</Table>
				</div>
			</SettingsTableCard>

			<SettingsSection title="角色说明" description="角色决定账号能看到和操作的范围。">
				<div className="mt-3 grid gap-4 md:grid-cols-3">
					{roleExplanations.map((role) => {
						const Icon = role.icon
						return (
							<div key={role.role} className="flex min-w-0 gap-3">
								<span className="grid size-8 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft text-muted-foreground">
									<Icon className="size-4" />
								</span>
								<div className="min-w-0">
									<div className="text-sm font-medium text-foreground">{role.label}</div>
									<p className="mt-1 text-xs leading-relaxed text-muted-foreground">{role.description}</p>
								</div>
							</div>
						)
					})}
				</div>
			</SettingsSection>

			<Sheet open={dialogMode === "create" || dialogMode === "edit"} onOpenChange={(open) => !open && closeDialog()}>
				<SheetContent side="right" className="gap-0 p-0 sm:max-w-lg">
					<SheetHeader className="border-b border-border/70 p-5 pr-14">
						<SheetTitle>{dialogMode === "create" ? "添加用户" : "编辑用户"}</SheetTitle>
						<SheetDescription>用户名和邮箱都可以作为登录账号，邮箱不需要验证。</SheetDescription>
					</SheetHeader>
					<div className="flex-1 overflow-y-auto p-5">
						<UserFields
							form={form}
							setForm={setForm}
							includePassword={dialogMode === "create"}
							disableRoleChange={selectedUser?.role === "admin" && adminCount <= 1}
						/>
					</div>
					<SheetFooter className="flex-row justify-end border-t border-border/70 p-4">
						<Button variant="outline" onClick={closeDialog} disabled={saving}>
							取消
						</Button>
						<Button onClick={dialogMode === "create" ? createUser : updateUser} disabled={saving}>
							{saving ? "保存中…" : "保存"}
						</Button>
					</SheetFooter>
				</SheetContent>
			</Sheet>

			<Dialog open={dialogMode === "password"} onOpenChange={(open) => !open && closeDialog()}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>重置密码</DialogTitle>
					</DialogHeader>
					<p className="-mt-2 text-sm text-muted-foreground">
						为 {selectedUser?.username} 设置一个不少于 8 位的新密码。
					</p>
					<div className="grid gap-2">
						<Label htmlFor="new-password">新密码</Label>
						<Input
							id="new-password"
							type="password"
							autoComplete="new-password"
							value={form.password}
							onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
						/>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={closeDialog} disabled={saving}>
							取消
						</Button>
						<Button onClick={resetPassword} disabled={saving || form.password.length < 8}>
							{saving ? "保存中…" : "重置密码"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<AlertDialog open={dialogMode === "delete"} onOpenChange={(open) => !open && closeDialog()}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>删除用户</AlertDialogTitle>
						<AlertDialogDescription>
							{canDeleteSelected
								? `确认删除 ${selectedUser?.username}？删除后该账号将无法登录，历史操作记录会保留。`
								: "当前用户或最后一个管理员不能删除。"}
						</AlertDialogDescription>
					</AlertDialogHeader>
					{selectedUser ? (
						<div className="rounded-md border border-border/70 bg-surface-soft p-3 text-sm">
							<div className="font-medium">{selectedUser.username || "-"}</div>
							<div className="mt-1 text-xs text-muted-foreground">
								{selectedUser.email || "未设置邮箱"} · {getRoleLabel(selectedUser.role)}
							</div>
						</div>
					) : null}
					<AlertDialogFooter>
						<AlertDialogCancel disabled={saving}>取消</AlertDialogCancel>
						<AlertDialogAction
							className={buttonVariants({ variant: "destructive" })}
							disabled={saving || !canDeleteSelected}
							onClick={(event) => {
								event.preventDefault()
								deleteUser()
							}}
						>
							{saving ? "删除中…" : "确认删除"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
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
			<div className="grid gap-2">
				<Label htmlFor="username">用户名</Label>
				<Input
					id="username"
					value={form.username}
					autoComplete="username"
					onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
				/>
			</div>
			<div className="grid gap-2">
				<Label htmlFor="email">邮箱</Label>
				<Input
					id="email"
					type="email"
					value={form.email}
					autoComplete="email"
					onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
				/>
			</div>
			{includePassword ? (
				<div className="grid gap-2">
					<Label htmlFor="password">初始密码</Label>
					<Input
						id="password"
						type="password"
						value={form.password}
						autoComplete="new-password"
						onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
					/>
				</div>
			) : null}
			<div className="grid gap-2">
				<Label>角色</Label>
				<Select
					value={form.role}
					onValueChange={(role) => setForm((current) => ({ ...current, role: role as AppUserRole }))}
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

function getErrorMessage(error: unknown) {
	if (typeof error === "object" && error && "response" in error) {
		const response = (error as { response?: { message?: string } }).response
		return response?.message || "请检查输入内容后重试。"
	}
	return "请检查输入内容后重试。"
}
