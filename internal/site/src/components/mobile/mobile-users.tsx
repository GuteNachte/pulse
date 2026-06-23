import { KeyRoundIcon, PencilIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
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

export type MobileUserItem = {
	id: string
	username: string
	email: string
	roleLabel: string
	roleTone: MobileStatusTone
	created: string
	isCurrent: boolean
	canDelete: boolean
}

export function MobileUsersView({
	items,
	loading,
	onRefresh,
	onCreate,
	onEdit,
	onResetPassword,
	onDelete,
}: {
	items: MobileUserItem[]
	loading: boolean
	onRefresh: () => void
	onCreate: () => void
	onEdit: (item: MobileUserItem) => void
	onResetPassword: (item: MobileUserItem) => void
	onDelete: (item: MobileUserItem) => void
}) {
	const adminCount = items.filter((item) => item.roleLabel === "管理员").length
	const readonlyCount = items.filter((item) => item.roleLabel === "只读").length

	return (
		<div className="grid gap-3 md:hidden">
			<div className="rounded-lg border border-border/70 bg-surface-soft p-2 shadow-none">
				<div className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-card px-3 py-2.5 shadow-none">
					<div className="min-w-0">
						<div className="text-[15px] font-semibold">用户列表</div>
						<div className="mt-0.5 text-xs text-muted-foreground">共 {items.length} 个账号</div>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						<Button
							type="button"
							variant="outline"
							size="icon"
							className="size-10 bg-card transition-transform active:scale-[0.96]"
							onClick={onRefresh}
							disabled={loading}
						>
							<RefreshCwIcon className={`size-4 ${loading ? "animate-spin" : ""}`} />
							<span className="sr-only">刷新</span>
						</Button>
						<Button
							type="button"
							size="icon"
							className="size-10 transition-transform active:scale-[0.96]"
							onClick={onCreate}
						>
							<PlusIcon className="size-4" />
							<span className="sr-only">添加用户</span>
						</Button>
					</div>
				</div>
				<MobileSummaryStrip
					className="mt-2"
					items={[
						{ label: "全部", value: items.length },
						{ label: "管理员", value: adminCount, tone: "info" },
						{ label: "只读", value: readonlyCount, tone: readonlyCount ? "neutral" : "success" },
					]}
				/>
			</div>
			<MobileUserList
				items={items}
				loading={loading}
				onEdit={onEdit}
				onResetPassword={onResetPassword}
				onDelete={onDelete}
			/>
		</div>
	)
}

export function MobileUserList({
	items,
	loading,
	onEdit,
	onResetPassword,
	onDelete,
}: {
	items: MobileUserItem[]
	loading: boolean
	onEdit: (item: MobileUserItem) => void
	onResetPassword: (item: MobileUserItem) => void
	onDelete: (item: MobileUserItem) => void
}) {
	return (
		<MobileSection title="账号" count={`${items.length} 个`}>
			{items.length ? (
				<MobileList>
					{items.map((item) => (
						<MobileUserCard
							key={item.id}
							item={item}
							onEdit={() => onEdit(item)}
							onResetPassword={() => onResetPassword(item)}
							onDelete={() => onDelete(item)}
						/>
					))}
				</MobileList>
			) : (
				<MobileEmptyState loading={loading}>{loading ? "正在读取用户列表" : "暂无用户"}</MobileEmptyState>
			)}
		</MobileSection>
	)
}

function MobileUserCard({
	item,
	onEdit,
	onResetPassword,
	onDelete,
}: {
	item: MobileUserItem
	onEdit: () => void
	onResetPassword: () => void
	onDelete: () => void
}) {
	return (
		<MobileListItem className="bg-card shadow-none">
			<div className="flex min-w-0 items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					<div className="truncate text-[15px] font-semibold">{item.username || "-"}</div>
					<div className="mt-1 truncate text-xs text-muted-foreground">{item.email || "未设置邮箱"}</div>
				</div>
				<MobileStatusTag tone={item.roleTone}>{item.roleLabel}</MobileStatusTag>
			</div>
			<div className="mt-3 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
				<Badge variant="outline" className="bg-card tabular-nums">
					{item.created}
				</Badge>
				{item.isCurrent && <Badge variant="secondary">当前账号</Badge>}
			</div>
			<div className="mt-3 grid grid-cols-3 gap-2 rounded-md border border-border/70 bg-surface-soft p-1.5">
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="min-h-10 justify-center bg-card transition-transform active:scale-[0.96]"
					onClick={onEdit}
				>
					<PencilIcon className="me-1.5 size-4" />
					编辑
				</Button>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="min-h-10 justify-center bg-card transition-transform active:scale-[0.96]"
					onClick={onResetPassword}
				>
					<KeyRoundIcon className="me-1.5 size-4" />
					密码
				</Button>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="min-h-10 justify-center bg-card text-destructive transition-transform hover:text-destructive active:scale-[0.96]"
					onClick={onDelete}
					disabled={!item.canDelete}
				>
					<Trash2Icon className="me-1.5 size-4" />
					删除
				</Button>
			</div>
		</MobileListItem>
	)
}
