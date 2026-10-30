import { createContext, useContext, useId, type ReactNode } from "react"
import { cn } from "@/lib/utils"

const SettingsPageEmbeddedContext = createContext(false)

/**
 * Mobile settings already render the page title in their own shell. Pages mark
 * themselves embedded there so the shared header does not repeat the title.
 */
export function SettingsPageProvider({ embedded, children }: { embedded: boolean; children: ReactNode }) {
	return <SettingsPageEmbeddedContext.Provider value={embedded}>{children}</SettingsPageEmbeddedContext.Provider>
}

export function useSettingsPageEmbedded() {
	return useContext(SettingsPageEmbeddedContext)
}

export function SettingsPageHeader({
	eyebrow,
	title,
	description,
	actions,
	className,
}: {
	eyebrow?: string
	title: string
	description?: string
	actions?: ReactNode
	className?: string
}) {
	const embedded = useSettingsPageEmbedded()
	const titleId = useId()

	if (embedded) {
		return null
	}

	return (
		<section
			aria-labelledby={titleId}
			className={cn(
				"flex flex-col gap-4 border-b border-border/70 pb-5 sm:flex-row sm:items-start sm:justify-between",
				className
			)}
		>
			<div className="min-w-0">
				{eyebrow ? <div className="text-xs font-medium text-muted-foreground">{eyebrow}</div> : null}
				<h1 id={titleId} className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
					{title}
				</h1>
				{description ? (
					<p className="mt-1.5 max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground">{description}</p>
				) : null}
			</div>
			{actions ? <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div> : null}
		</section>
	)
}
