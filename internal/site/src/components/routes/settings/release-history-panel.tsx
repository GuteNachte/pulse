import { ChevronDownIcon } from "lucide-react"
import { useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { loadReleaseHistoryArchive, releaseHistory, type ReleaseNote } from "./release-history"
import { SettingsSection } from "./components/section"

// 版本记录按端分节（Web / Hub、Agent / 部署、移动端 / Android App、文档 / 规则），
// 筛选按分节标题包含关键字匹配，与各版本实际使用的分节命名保持兼容。
const PLATFORM_FILTERS = ["全部", "Web", "Hub", "Android", "Agent", "部署", "文档"] as const
type PlatformFilter = (typeof PLATFORM_FILTERS)[number]

function sectionMatchesPlatform(title: string, platform: PlatformFilter) {
	if (platform === "全部") {
		return true
	}
	return title.toLowerCase().includes(platform.toLowerCase())
}

export default function ReleaseHistoryPanel() {
	const [archive, setArchive] = useState<ReleaseNote[]>([])
	const [archiveLoading, setArchiveLoading] = useState(false)
	const [archiveError, setArchiveError] = useState("")
	const [platform, setPlatform] = useState<PlatformFilter>("全部")

	async function showArchive() {
		if (archiveLoading || archive.length > 0) return
		setArchiveLoading(true)
		setArchiveError("")
		try {
			setArchive(await loadReleaseHistoryArchive())
		} catch (error) {
			console.error("load release history archive", error)
			setArchiveError("历史版本加载失败，请稍后重试。")
		} finally {
			setArchiveLoading(false)
		}
	}

	const visibleReleases = [...releaseHistory, ...archive]
		.map((release) => ({
			release,
			sections: release.sections.filter((section) => sectionMatchesPlatform(section.title, platform)),
		}))
		.filter((item) => item.sections.length > 0)

	return (
		<SettingsSection
			title="版本更新记录"
			description="按 Web / Hub、Android App、Agent、部署和版本规则分组记录每个版本的实际改动；默认收起，点开查看详情。"
		>
			<div className="mt-3 flex flex-wrap items-center gap-1.5">
				{PLATFORM_FILTERS.map((item) => (
					<button
						key={item}
						type="button"
						aria-pressed={platform === item}
						onClick={() => setPlatform(item)}
						className={cn(
							"min-h-8 rounded-md border px-2.5 text-xs font-medium transition-colors",
							platform === item
								? "border-primary/40 bg-primary/10 text-foreground"
								: "border-border/70 bg-card text-muted-foreground hover:text-foreground"
						)}
					>
						{item}
					</button>
				))}
				{platform !== "全部" && (
					<span className="text-xs text-muted-foreground">
						{visibleReleases.length} 个版本包含「{platform}」相关更新
					</span>
				)}
			</div>

			<div className="mt-3 grid pulse-card-gap">
				{visibleReleases.map(({ release, sections }, index) => (
					<ReleaseNoteCard
						key={release.version}
						release={release}
						sections={sections}
						defaultOpen={platform === "全部" && index === 0}
						latest={release.version === releaseHistory[0]?.version}
					/>
				))}
				{visibleReleases.length === 0 && (
					<div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
						没有包含「{platform}」相关更新的版本记录。
					</div>
				)}
				{archive.length === 0 && (
					<div className="flex flex-wrap items-center gap-2">
						<Button variant="outline" size="sm" onClick={showArchive} disabled={archiveLoading}>
							{archiveLoading ? "正在加载历史版本…" : "查看历史版本（1.0.5 及更早）"}
						</Button>
						<span className="text-xs text-muted-foreground">旧版本按需加载，不占用首屏体积</span>
						{archiveError && <span className="text-xs text-destructive">{archiveError}</span>}
					</div>
				)}
			</div>
		</SettingsSection>
	)
}

function ReleaseNoteCard({
	release,
	sections,
	defaultOpen = false,
	latest = false,
}: {
	release: ReleaseNote
	sections: ReleaseNote["sections"]
	defaultOpen?: boolean
	latest?: boolean
}) {
	const [open, setOpen] = useState(defaultOpen)
	const itemCount = sections.reduce((total, section) => total + section.items.length, 0)
	return (
		<article className="overflow-hidden rounded-lg border border-border/70 bg-card">
			<div className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<h5 className="text-sm font-semibold text-foreground">Pulse {release.version}</h5>
						<ReleaseMetaTag>{release.date}</ReleaseMetaTag>
						{latest && <ReleaseMetaTag>最新</ReleaseMetaTag>}
					</div>
					<p className="mt-1 text-sm font-normal text-muted-foreground">{release.title}</p>
					<div className="mt-2 flex flex-wrap items-center gap-1.5">
						<ReleaseMetaTag>{sections.length} 个分组</ReleaseMetaTag>
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
				<div className="grid pulse-card-gap border-t border-border/70 bg-surface-soft p-3 sm:p-4">
					<div className="grid gap-3 lg:grid-cols-2">
						{sections.map((section) => (
							<section
								key={section.title}
								className="grid content-start gap-2 rounded-lg border border-border/70 bg-card p-3 shadow-none"
							>
								<div className="text-sm font-semibold text-foreground">{section.title}</div>
								<ul className="grid gap-1.5 text-sm leading-relaxed text-muted-foreground">
									{section.items.map((item, itemIndex) => (
										<li key={`${section.title}-${itemIndex}`} className="grid grid-cols-[0.75rem_1fr] gap-2">
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
