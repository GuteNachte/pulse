import {
	AlertTriangleIcon,
	ArrowRightIcon,
	DatabaseIcon,
	ExternalLinkIcon,
	KeyRoundIcon,
	ShieldCheckIcon,
} from "lucide-react"
import { getPagePath } from "@nanostores/router"
import { MobileAdvancedSettingsView } from "@/components/mobile/mobile-advanced-settings"
import { $router, Link, prependBasePath } from "@/components/router"

export default function Advanced() {
	const pocketbaseHref = prependBasePath("/_/")
	const tokenHref = getPagePath($router, "settings", { name: "tokens" })

	return (
		<div className="grid gap-4 md:gap-5">
			<MobileAdvancedSettingsView pocketbaseHref={pocketbaseHref} tokenHref={tokenHref} />
			<section className="hidden overflow-hidden rounded-lg border border-border/70 bg-surface-soft shadow-none md:block">
				<div className="border-b border-border/70 bg-card px-5 py-4">
					<div className="flex min-w-0 items-start justify-between gap-4">
						<div className="min-w-0">
							<div className="text-xs font-medium text-muted-foreground">系统维护</div>
							<h3 className="mt-1 text-xl font-semibold text-foreground">高级设置</h3>
							<p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
								这里集中放底层维护和长期接入凭据。日常添加机器、查看日志和备份恢复请优先使用对应功能页。
							</p>
						</div>
						<div className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border/70 bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-none">
							<ShieldCheckIcon className="size-3.5" />
							需要管理员确认
						</div>
					</div>
				</div>
				<div className="grid gap-3 p-4">
					<div className="rounded-lg border border-border/70 bg-card p-3 shadow-none">
						<div className="flex items-start justify-between gap-4">
							<div className="flex min-w-0 items-start gap-3">
								<div className="grid size-9 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft">
									<AlertTriangleIcon className="size-4 text-muted-foreground" />
								</div>
								<div className="min-w-0">
									<div className="font-semibold text-foreground">维护前确认</div>
									<p className="mt-1 max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground">
										PocketBase 后台可以直接修改集合、用户、Token
										和系统记录。上线环境使用前先完成备份，并明确本次维护影响范围。
									</p>
								</div>
							</div>
							<div className="hidden shrink-0 flex-wrap items-center justify-end gap-2 xl:flex">
								<span className="rounded-md border border-border/70 bg-surface-soft px-2.5 py-1 text-xs font-medium text-muted-foreground">
									先备份
								</span>
								<span className="rounded-md border border-border/70 bg-surface-soft px-2.5 py-1 text-xs font-medium text-muted-foreground">
									限范围
								</span>
								<span className="rounded-md border border-border/70 bg-surface-soft px-2.5 py-1 text-xs font-medium text-muted-foreground">
									可回滚
								</span>
							</div>
						</div>
					</div>
					<div className="grid gap-3 lg:grid-cols-2">
						<a
							href={pocketbaseHref}
							className="group rounded-lg border border-border/70 bg-card p-3 shadow-none transition-[background-color,border-color,transform] duration-150 ease-out hover:bg-surface-soft active:scale-[0.96]"
						>
							<div className="flex min-w-0 items-start gap-3">
								<div className="grid size-10 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft text-muted-foreground">
									<DatabaseIcon className="size-4" />
								</div>
								<div className="min-w-0 flex-1">
									<div className="flex min-w-0 items-center gap-2">
										<div className="truncate font-semibold text-foreground">PocketBase 后台</div>
										<ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground" />
									</div>
									<p className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">
										维护底层数据、集合、权限和系统记录。会离开 Pulse 设置页。
									</p>
								</div>
								<div className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md border border-border/70 bg-surface-soft px-3 text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
									打开
									<ArrowRightIcon className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
								</div>
							</div>
						</a>
						<Link
							href={tokenHref}
							className="group rounded-lg border border-border/70 bg-card p-3 shadow-none transition-[background-color,border-color,transform] duration-150 ease-out hover:bg-surface-soft active:scale-[0.96]"
						>
							<div className="flex min-w-0 items-start gap-3">
								<div className="grid size-10 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft text-muted-foreground">
									<KeyRoundIcon className="size-4" />
								</div>
								<div className="min-w-0 flex-1">
									<div className="truncate font-semibold text-foreground">Agent 接入 Token</div>
									<p className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">
										管理长期接入凭据、轮换 Token、解除当前设备绑定。日常接入优先走添加机器向导。
									</p>
								</div>
								<div className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md border border-border/70 bg-surface-soft px-3 text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
									管理
									<ArrowRightIcon className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
								</div>
							</div>
						</Link>
					</div>
				</div>
			</section>
		</div>
	)
}
