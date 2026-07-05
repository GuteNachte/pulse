import { useStore } from "@nanostores/react"
import { SearchIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import type React from "react"
import { Input } from "@/components/ui/input"
import { isAdmin, isReadOnlyUser } from "@/lib/api"
import { cn } from "@/lib/utils"
import { $router, Link } from "../../router"

interface SidebarNavProps extends React.HTMLAttributes<HTMLElement> {
	items: {
		href: string
		title: string
		icon?: React.FC<React.SVGProps<SVGSVGElement>>
		group?: string
		description?: string
		keywords?: string[]
		danger?: boolean
		admin?: boolean
		noReadOnly?: boolean
		preload?: () => Promise<{ default: React.ComponentType<object> }>
	}[]
}

export function SidebarNav({ className, items, ...props }: SidebarNavProps) {
	const page = useStore($router)
	const visibleItems = items.filter((item) => !((item.admin && !isAdmin()) || (item.noReadOnly && isReadOnlyUser())))
	const touchNavRef = useRef<HTMLElement | null>(null)
	const [query, setQuery] = useState("")
	const filteredItems = useMemo(() => filterSettingsItems(visibleItems, query), [visibleItems, query])
	const groupedItems = useMemo(() => groupSettingsItems(filteredItems), [filteredItems])

	useEffect(() => {
		const activeItem = touchNavRef.current?.querySelector<HTMLElement>("[data-active='true']")
		activeItem?.scrollIntoView({
			block: "nearest",
			inline: "center",
		})
	}, [page?.path])

	return (
		<>
			{/* Touch View */}
			<div className="lg:hidden">
				<nav
					ref={touchNavRef}
					className="scrollbar-hide -mx-4 flex snap-x gap-2 overflow-x-auto border-y border-border/70 bg-surface-soft px-4 py-2 sm:-mx-7 sm:px-7"
					aria-label="设置分类"
				>
					{visibleItems.map((item) => (
						<Link
							onMouseEnter={() => item.preload?.()}
							key={item.href}
							href={item.href}
							data-active={page?.path === item.href ? "true" : undefined}
							className={cn(
								"inline-flex min-h-10 shrink-0 snap-start items-center gap-2 rounded-md border px-3 text-sm transition-[background-color,border-color,color,transform] active:scale-[0.96]",
								page?.path === item.href
									? "border-foreground/15 bg-card text-foreground"
									: "border-border/70 bg-card text-muted-foreground hover:bg-surface-soft hover:text-foreground"
							)}
							aria-current={page?.path === item.href ? "page" : undefined}
						>
							{item.icon && <item.icon className="size-4 shrink-0" strokeWidth={1.9} />}
							<span className="whitespace-nowrap">{item.title}</span>
						</Link>
					))}
				</nav>
			</div>

			{/* Desktop View */}
			<nav className={cn("sticky top-24 hidden gap-1.5 lg:grid", className)} {...props}>
				<label htmlFor="settings-nav-search" className="sr-only">
					搜索设置
				</label>
				<div className="relative mb-1.5 min-w-0">
					<SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						id="settings-nav-search"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="搜索设置"
						className="h-9 w-full bg-card pl-8 pr-2.5 text-sm shadow-none"
					/>
				</div>
				{groupedItems.length ? (
					groupedItems.map((group) => (
						<div key={group.title} className="grid gap-0.5">
							<div className="px-2 pt-1 pb-0 text-[10px] font-medium leading-4 text-muted-foreground">
								{group.title}
							</div>
							{group.items.map((item) => {
								const active = page?.path === item.href
								return (
									<Link
										onMouseEnter={() => item.preload?.()}
										key={item.href}
										href={item.href}
										className={cn(
											"flex min-h-9 w-full min-w-0 items-center justify-start gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium transition-[background-color,color,transform] active:scale-[0.96]",
											active ? "bg-card text-foreground" : "text-muted-foreground hover:bg-card hover:text-foreground"
										)}
										aria-current={active ? "page" : undefined}
									>
										{item.icon && (
											<span
												className={cn(
													"grid size-6 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft text-muted-foreground",
													active && "bg-surface-soft text-foreground",
													item.danger && "text-amber-600"
												)}
											>
												<item.icon className="size-3.5" strokeWidth={1.9} />
											</span>
										)}
										<span className="min-w-0">
											<span className="block truncate">{item.title}</span>
										</span>
									</Link>
								)
							})}
						</div>
					))
				) : (
					<div className="rounded-md border border-border/70 bg-card px-3 py-4 text-sm text-muted-foreground">
						没有匹配的设置项
					</div>
				)}
			</nav>
		</>
	)
}

function filterSettingsItems(items: SidebarNavProps["items"], query: string) {
	const keyword = query.trim().toLowerCase()
	if (!keyword) return items
	return items.filter((item) => settingsItemText(item).includes(keyword))
}

function settingsItemText(item: SidebarNavProps["items"][number]) {
	return [item.title, item.group, item.description, ...(item.keywords || [])].filter(Boolean).join(" ").toLowerCase()
}

function groupSettingsItems(items: SidebarNavProps["items"]) {
	const groups: Array<{ title: string; items: SidebarNavProps["items"] }> = []
	for (const item of items) {
		const title = item.group || "设置"
		let group = groups.find((entry) => entry.title === title)
		if (!group) {
			group = { title, items: [] }
			groups.push(group)
		}
		group.items.push(item)
	}
	return groups
}
