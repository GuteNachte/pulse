import { SearchIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import type React from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Link } from "../../router"
import { filterSettingsItems, groupSettingsItems, type SettingsKey, type SettingsNavItem } from "./catalog"

interface SidebarNavProps extends React.HTMLAttributes<HTMLElement> {
	items: SettingsNavItem[]
	activeKey: SettingsKey
}

export function SidebarNav({ className, items, activeKey, ...props }: SidebarNavProps) {
	const touchNavRef = useRef<HTMLElement | null>(null)
	const searchRef = useRef<HTMLInputElement | null>(null)
	const [query, setQuery] = useState("")
	const filteredItems = useMemo(() => filterSettingsItems(items, query), [items, query])
	const groupedItems = useMemo(() => groupSettingsItems(filteredItems), [filteredItems])

	useEffect(() => {
		const activeItem = touchNavRef.current?.querySelector<HTMLElement>("[data-active='true']")
		activeItem?.scrollIntoView({
			block: "nearest",
			inline: "center",
		})
	}, [activeKey])

	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
				return
			}
			const target = event.target as HTMLElement | null
			if (
				target &&
				(target.tagName === "INPUT" ||
					target.tagName === "TEXTAREA" ||
					target.tagName === "SELECT" ||
					target.isContentEditable)
			) {
				return
			}
			event.preventDefault()
			searchRef.current?.focus()
		}
		document.addEventListener("keydown", handleKeyDown)
		return () => document.removeEventListener("keydown", handleKeyDown)
	}, [])

	return (
		<>
			{/* Touch view: the mobile settings index has its own search. */}
			<div className="lg:hidden">
				<nav
					ref={touchNavRef}
					className="scrollbar-hide -mx-2 flex snap-x gap-2 overflow-x-auto px-2 py-1"
					aria-label="设置分类"
				>
					{items.map((item) => {
						const active = item.key === activeKey
						return (
							<Link
								onMouseEnter={() => item.preload?.()}
								key={item.key}
								href={item.href}
								data-active={active ? "true" : undefined}
								className={cn(
									"inline-flex min-h-10 shrink-0 snap-start items-center gap-2 rounded-md border px-3 text-sm transition-[background-color,border-color,color,transform] active:scale-[0.96]",
									active
										? "border-foreground/15 bg-card text-foreground"
										: "border-border/70 bg-card text-muted-foreground hover:bg-surface-soft hover:text-foreground"
								)}
								aria-current={active ? "page" : undefined}
							>
								<item.icon className="size-4 shrink-0" strokeWidth={1.9} />
								<span className="whitespace-nowrap">{item.title}</span>
							</Link>
						)
					})}
				</nav>
			</div>

			{/* Desktop view */}
			<nav className={cn("hidden gap-1.5 lg:grid", className)} aria-label="设置导航" {...props}>
				<label htmlFor="settings-nav-search" className="sr-only">
					搜索设置
				</label>
				<div className="relative mb-1.5 min-w-0">
					<SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						ref={searchRef}
						id="settings-nav-search"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="搜索设置"
						className="h-9 w-full bg-surface-soft pl-8 pr-2.5 text-sm shadow-none"
						aria-keyshortcuts="/"
					/>
				</div>
				{groupedItems.length ? (
					groupedItems.map((group) => (
						<div key={group.title} className="grid gap-0.5">
							<div className="px-2 pt-1.5 pb-0.5 text-[11px] font-medium leading-4 text-muted-foreground">
								{group.title}
							</div>
							{group.items.map((item) => {
								const active = item.key === activeKey
								return (
									<Link
										onMouseEnter={() => item.preload?.()}
										key={item.key}
										href={item.href}
										className={cn(
											"flex min-h-9 w-full min-w-0 items-center justify-start gap-2 rounded-md border-l-2 px-2 py-1.5 text-left text-sm font-medium transition-[background-color,border-color,color,transform] active:scale-[0.96]",
											active
												? "border-l-foreground/70 bg-surface-soft text-foreground"
												: "border-l-transparent text-muted-foreground hover:bg-surface-soft hover:text-foreground"
										)}
										aria-current={active ? "page" : undefined}
									>
										<span
											className={cn(
												"grid size-6 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft text-muted-foreground",
												active && "text-foreground",
												item.danger && "text-amber-600"
											)}
										>
											<item.icon className="size-3.5" strokeWidth={1.9} />
										</span>
										<span className="min-w-0 flex-1">
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
