import { AlertTriangleIcon, ArrowRightIcon, DatabaseIcon, ExternalLinkIcon, KeyRoundIcon } from "lucide-react"
import { Link } from "@/components/router"

export function MobileAdvancedSettingsView({
	pocketbaseHref,
	tokenHref,
}: {
	pocketbaseHref: string
	tokenHref: string
}) {
	return (
		<div className="grid gap-4 md:hidden">
			<section className="grid gap-3 rounded-lg border border-border/70 bg-surface-soft p-3">
				<div className="rounded-md border border-border/70 bg-card p-4">
					<div className="text-xs font-medium text-muted-foreground">系统维护</div>
					<div className="mt-1 text-[17px] font-semibold leading-tight text-foreground">高级设置</div>
					<p className="mt-1 text-pretty text-xs leading-relaxed text-muted-foreground">
						这里只放底层维护和长期凭据。日常添加机器、查看日志和备份恢复请优先使用对应功能页。
					</p>
				</div>
				<div className="flex items-start gap-2 rounded-md border border-border/70 bg-card p-3 text-xs leading-relaxed text-muted-foreground">
					<AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
					<span>维护前先完成备份，并确认本次只改明确范围内的数据、权限或接入凭据。</span>
				</div>
				<div className="grid gap-2">
					<a
						href={pocketbaseHref}
						className="group rounded-md border border-border/70 bg-card p-3 transition-[background-color,border-color,transform] duration-150 ease-out hover:border-foreground/15 hover:bg-surface-soft active:scale-[0.96]"
					>
						<div className="flex min-w-0 items-center gap-3">
							<div className="grid size-10 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft">
								<DatabaseIcon className="size-4 text-muted-foreground" />
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex min-w-0 items-center gap-2">
									<div className="truncate text-[15px] font-semibold leading-tight">PocketBase 后台</div>
									<ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground" />
								</div>
								<p className="mt-1 text-pretty text-xs leading-relaxed text-muted-foreground">
									维护底层数据、集合、权限和系统状态。这里会离开 Pulse 移动端界面。
								</p>
							</div>
							<div className="inline-flex min-h-10 shrink-0 items-center rounded-md border border-border/70 bg-surface-soft px-2.5 text-xs font-medium text-muted-foreground">
								打开
							</div>
						</div>
					</a>
					<Link
						href={tokenHref}
						className="group rounded-md border border-border/70 bg-card p-3 transition-[background-color,border-color,transform] duration-150 ease-out hover:border-foreground/15 hover:bg-surface-soft active:scale-[0.96]"
					>
						<div className="flex min-w-0 items-center gap-3">
							<div className="grid size-10 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft">
								<KeyRoundIcon className="size-4 text-muted-foreground" />
							</div>
							<div className="min-w-0 flex-1">
								<div className="truncate text-[15px] font-semibold leading-tight">Agent 接入 Token</div>
								<p className="mt-1 text-pretty text-xs leading-relaxed text-muted-foreground">
									管理长期接入凭据、轮换和解绑。日常添加机器请优先使用客户端页的添加向导。
								</p>
							</div>
							<ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
						</div>
					</Link>
				</div>
			</section>
		</div>
	)
}
