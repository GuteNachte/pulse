import { ListTreeIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getAssetParameterScrollBehavior, getAssetParameterSectionId } from "../asset-parameter-navigation"
import type { AssetParameterGroup } from "./asset-parameter-columns"

type AssetParameterNavigatorProps = {
	groups: AssetParameterGroup[]
	variant: "sidebar" | "inline"
	className?: string
}

export function AssetParameterNavigator({ groups, variant, className }: AssetParameterNavigatorProps) {
	const groupIds = useMemo(() => groups.map((group) => group.id), [groups])
	const [selectedGroupId, setSelectedGroupId] = useState(groupIds[0] ?? "")
	const activeGroupId = groupIds.includes(selectedGroupId) ? selectedGroupId : (groupIds[0] ?? "")

	useEffect(() => {
		if (typeof IntersectionObserver === "undefined") return
		const elements = groupIds
			.map((groupId) => document.getElementById(getAssetParameterSectionId(groupId)))
			.filter((element): element is HTMLElement => Boolean(element))
		const observer = new IntersectionObserver(
			(entries) => {
				const visible = entries
					.filter((entry) => entry.isIntersecting)
					.sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0]
				const groupId = visible?.target.getAttribute("data-asset-parameter-group-id")
				if (groupId) setSelectedGroupId(groupId)
			},
			{ rootMargin: "-18% 0px -68% 0px", threshold: [0, 0.15, 0.35] }
		)
		for (const element of elements) observer.observe(element)
		return () => observer.disconnect()
	}, [groupIds])

	function scrollToGroup(groupId: string) {
		const target = document.getElementById(getAssetParameterSectionId(groupId))
		if (!target) return
		const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
		target.scrollIntoView({ behavior: getAssetParameterScrollBehavior(reducedMotion), block: "start" })
		setSelectedGroupId(groupId)
	}

	if (groups.length < 2) return null

	return (
		<nav
			aria-label="参数目录"
			className={cn(
				variant === "sidebar"
					? "rounded-lg border border-border/70 bg-card p-3"
					: "-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1",
				className
			)}
		>
			{variant === "sidebar" ? (
				<div className="mb-1.5 flex items-center gap-2 px-1 text-xs font-semibold text-muted-foreground">
					<ListTreeIcon className="size-3.5" />
					参数目录
				</div>
			) : null}
			<div className={cn(variant === "sidebar" ? "grid gap-1" : "flex gap-1.5")}>
				{groups.map((group) => {
					const active = group.id === activeGroupId
					return (
						<Button
							key={group.id}
							variant={active ? "secondary" : "ghost"}
							size="sm"
							aria-current={active ? "location" : undefined}
							onClick={() => scrollToGroup(group.id)}
							className={cn(
								"min-w-0 border text-left",
								variant === "sidebar"
									? "h-auto min-h-0 w-full flex-col items-stretch justify-start whitespace-normal px-2.5 py-1.5"
									: "h-8 min-h-8 shrink-0 px-2.5",
								active ? "border-border/70" : "border-transparent text-muted-foreground"
							)}
						>
							<span className="block truncate text-xs font-medium">{group.title}</span>
							{variant === "sidebar" ? (
								<span className="mt-0.5 block truncate text-[10px] font-normal text-muted-foreground">
									{group.summary}
								</span>
							) : null}
						</Button>
					)
				})}
			</div>
		</nav>
	)
}
