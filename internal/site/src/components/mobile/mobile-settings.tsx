import { ChevronRightIcon, SearchIcon } from "lucide-react"
import { useMemo, useState, type ComponentType, type ReactNode, type SVGProps } from "react"
import { filterSettingsItems, groupSettingsItems } from "@/components/routes/settings/catalog"
import { Link, prependBasePath } from "@/components/router"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MobileListItem, MobilePageShell, MobileSection } from "./mobile-ui"

export type MobileSettingsNavItem = {
	title: string
	href: string
	icon: ComponentType<SVGProps<SVGSVGElement>>
	group?: string
	description?: string
	keywords?: string[]
	danger?: boolean
	preload?: () => Promise<unknown>
}

export function MobileSettingsLayout({
	activeName,
	activeTitle,
	items,
	contentName,
	renderContent,
}: {
	activeName?: string
	activeTitle?: string
	items: MobileSettingsNavItem[]
	contentName: string
	renderContent: (name: string) => ReactNode
}) {
	const showIndex = !activeName
	const [query, setQuery] = useState("")
	const filteredItems = useMemo(() => filterSettingsItems(items, query), [items, query])
	const groupedItems = useMemo(() => groupSettingsItems(filteredItems), [filteredItems])

	return (
		<MobilePageShell
			title={showIndex ? "更多" : (activeTitle ?? "设置")}
			subtitle={showIndex ? "设置、日志、版本和管理入口" : "当前设置项"}
			action={
				showIndex ? null : (
					<Button asChild variant="ghost" size="sm" className="min-h-10 px-3 text-xs">
						<Link href={prependBasePath("/settings")}>全部</Link>
					</Button>
				)
			}
		>
			{showIndex ? (
				<div className="grid gap-4">
					<label htmlFor="mobile-settings-search" className="sr-only">
						搜索设置
					</label>
					<div className="relative">
						<SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							id="mobile-settings-search"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="搜索设置、日志、备份或关于"
							className="h-11 rounded-lg bg-card pl-9 shadow-none"
						/>
					</div>
					{groupedItems.length ? (
						groupedItems.map((group) => (
							<MobileSection key={group.title} title={group.title}>
								<div className="grid gap-2 rounded-lg border border-border/70 bg-surface-soft p-2 sm:grid-cols-2">
									{group.items.map((item) => {
										const Icon = item.icon
										return (
											<MobileListItem
												key={item.href}
												href={item.href}
												onClick={() => item.preload?.()}
												className="rounded-md border-border/70 bg-card shadow-none"
											>
												<div className="flex min-w-0 items-center gap-3">
													<div className="grid size-9 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft">
														<Icon
															className={item.danger ? "size-4 text-amber-600" : "size-4 text-muted-foreground"}
															strokeWidth={1.9}
														/>
													</div>
													<div className="min-w-0 flex-1">
														<div className="truncate text-sm font-semibold">{item.title}</div>
														<div className="mt-0.5 truncate text-xs text-muted-foreground">
															{item.description || mobileSettingsDescription(item.title)}
														</div>
													</div>
													<ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
												</div>
											</MobileListItem>
										)
									})}
								</div>
							</MobileSection>
						))
					) : (
						<div className="rounded-lg border border-border/70 bg-card p-4 text-sm text-muted-foreground">
							没有匹配的设置项
						</div>
					)}
				</div>
			) : (
				<div className="min-w-0 rounded-lg border border-border/70 bg-surface-soft p-2 sm:p-3">
					{renderContent(contentName)}
				</div>
			)}
		</MobilePageShell>
	)
}

function mobileSettingsDescription(title: string) {
	switch (title) {
		case "常规设置":
			return "主题、图表、单位和显示偏好"
		case "AI 能力":
			return "AI 服务接入、参数 Agent 和图片 Agent"
		case "Agent 管理":
			return "安装模板、版本仓库和设备更新"
		case "通知设置":
			return "通知通道、邮件和发送诊断"
		case "系统日志":
			return "查看 Hub 运行事件和详情"
		case "操作审计":
			return "查看用户、备份和管理动作"
		case "备份管理":
			return "数据备份与恢复"
		case "用户管理":
			return "账户、角色和密码维护"
		case "模块说明":
			return "模块职责、依赖和代码边界"
		case "高级设置":
			return "运行诊断、后台入口和危险维护"
		case "关于":
			return "版本、Hub 地址和更新记录"
		default:
			return "查看和调整设置"
	}
}
