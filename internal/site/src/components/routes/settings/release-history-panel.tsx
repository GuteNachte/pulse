import { ChevronDownIcon } from "lucide-react"
import { useState, type ReactNode } from "react"
import { MobileReleaseBadges } from "@/components/mobile/mobile-about-settings"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { releaseHistory, type ReleaseNote } from "./release-history"

export default function ReleaseHistoryPanel() {
	return (
		<section className="grid gap-3 rounded-lg border border-border/70 bg-surface-soft p-3 sm:p-4">
			<div className="rounded-lg border border-border/70 bg-surface-soft p-3 shadow-none sm:p-4">
				<div className="flex min-w-0 items-center gap-2">
					<div className="grid size-8 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft">
						<ChevronDownIcon className="size-4 text-muted-foreground" />
					</div>
					<div className="min-w-0">
						<h4 className="text-base font-semibold">版本更新记录</h4>
						<p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
							按 Web / Hub、Android App、Agent、部署和版本规则分组记录每个版本的实际改动。
						</p>
					</div>
				</div>
			</div>
			<div className="grid gap-3">
				{releaseHistory.map((release, index) => (
					<ReleaseNoteCard key={release.version} release={release} defaultOpen={false} latest={index === 0} />
				))}
			</div>
		</section>
	)
}

function ReleaseNoteCard({
	release,
	defaultOpen = false,
	latest = false,
}: {
	release: ReleaseNote
	defaultOpen?: boolean
	latest?: boolean
}) {
	const [open, setOpen] = useState(defaultOpen)
	const itemCount = release.sections.reduce((total, section) => total + section.items.length, 0)
	return (
		<article className="overflow-hidden rounded-lg border border-border/70 bg-card">
			<div className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<h5 className="text-sm font-semibold ">Pulse {release.version}</h5>
						<ReleaseMetaTag>{release.date}</ReleaseMetaTag>
						{latest && <ReleaseMetaTag>最新</ReleaseMetaTag>}
					</div>
					<p className="mt-1 text-sm font-normal text-muted-foreground">{release.title}</p>
					<div className="mt-2 flex flex-wrap items-center gap-1.5">
						<ReleaseMetaTag>{release.sections.length} 个分组</ReleaseMetaTag>
						<ReleaseMetaTag>{itemCount} 条更新</ReleaseMetaTag>
						{release.badges.map((badge) => (
							<ReleaseMetaTag key={badge}>{badge}</ReleaseMetaTag>
						))}
					</div>
				</div>
				<Button
					variant="outline"
					className="min-h-10 justify-center gap-2 sm:min-w-28"
					aria-expanded={open}
					aria-label={`${open ? "收起" : "展开"} Pulse ${release.version} 更新详情`}
					onClick={() => setOpen((value) => !value)}
				>
					{open ? "收起" : "展开"}
					<ChevronDownIcon className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
				</Button>
			</div>
			{open && (
				<div className="grid gap-4 border-t border-border/70 bg-surface-soft p-3 sm:p-4">
					<MobileReleaseBadges badges={release.badges} />
					<div className="grid gap-3 lg:grid-cols-2">
						{release.sections.map((section) => (
							<section
								key={section.title}
								className="grid content-start gap-2 rounded-lg border border-border/70 bg-card p-3 shadow-none"
							>
								<div className="text-sm font-semibold">{section.title}</div>
								<ul className="grid gap-1.5 text-sm leading-relaxed text-muted-foreground">
									{section.items.map((item) => (
										<li key={item} className="grid grid-cols-[0.75rem_1fr] gap-2">
											<span className="mt-2 size-1.5 rounded-sm bg-primary/70" />
											<span>{item}</span>
										</li>
									))}
								</ul>
							</section>
						))}
					</div>
				</div>
			)}
		</article>
	)
}

function ReleaseMetaTag({ children }: { children: ReactNode }) {
	return (
		<span className="inline-flex h-6 items-center rounded-md border border-border/70 bg-surface-card px-2 text-xs font-medium text-muted-foreground shadow-none">
			{children}
		</span>
	)
}
