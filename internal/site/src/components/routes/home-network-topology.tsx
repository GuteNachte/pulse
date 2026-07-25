import { getPagePath } from "@nanostores/router"
import { ArrowRightIcon, NetworkIcon } from "lucide-react"
import { memo } from "react"
import { $router, Link } from "@/components/router"
import { Button } from "@/components/ui/button"
import { TopologyWorkspace } from "@/modules/network-topology/components/topology-workspace"
import type { TopologyDomain } from "@/modules/network-topology/topology-domain"
import { useTopologyWorkspaceData } from "@/modules/network-topology/use-topology-workspace-data"
import type { SystemRecord } from "@/types"

export function HomeNetworkTopology({ systems }: { systems: SystemRecord[] }) {
	return (
		<div className="grid grid-cols-2 pulse-card-gap">
			<HomeTopologyCard domain="home" title="家庭网" systems={systems} />
			<HomeTopologyCard domain="technology" title="科技网" systems={systems} />
		</div>
	)
}

function HomeTopologyCard({
	domain,
	title,
	systems,
}: {
	domain: TopologyDomain
	title: string
	systems: SystemRecord[]
}) {
	const view = useTopologyWorkspaceData(domain, systems)
	const stats = {
		devices: view.graph.nodes.filter((node) => node.data.kind === "asset").length,
		links: view.graph.edges.length,
		ports: view.graph.nodes.reduce((total, node) => total + node.data.interfaces.length, 0),
		wireless: view.graph.edges.filter((edge) => edge.data?.medium === "wifi").length,
	}

	return (
		<section className="min-w-0 overflow-hidden rounded-lg border border-border/70 bg-card">
			<header className="flex min-h-12 min-w-0 flex-wrap items-center gap-2 border-b border-border/70 bg-surface-soft px-3 py-1.5">
				<span className="grid size-7 shrink-0 place-items-center rounded-md border border-border/70 bg-card text-muted-foreground">
					<NetworkIcon aria-hidden="true" className="size-3.5" />
				</span>
				<h2 className="shrink-0 text-sm font-semibold">{title}</h2>
				<section aria-label={`${title}拓扑概览`} className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
					<OverviewStat label="设备" value={stats.devices} />
					<OverviewStat label="链路" value={stats.links} />
					<OverviewStat label="网口" value={stats.ports} />
					<OverviewStat label="无线" value={stats.wireless} />
				</section>
				<Button asChild variant="outline" size="sm" className="ms-auto h-8 min-h-8 gap-1.5 px-2.5 text-xs">
					<Link href={getPagePath($router, "network", { domain })}>
						完整拓扑
						<ArrowRightIcon aria-hidden="true" className="size-3.5" />
					</Link>
				</Button>
			</header>
			<div className="relative min-h-[560px]">
				{view.loading ? (
					<div className="absolute inset-x-0 top-0 z-10 border-b border-border/70 bg-background px-3 py-2 text-xs text-muted-foreground">
						正在加载{title}拓扑
					</div>
				) : null}
				{view.error ? (
					<div className="absolute inset-x-0 top-0 z-10 border-b border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
						{title}拓扑加载失败
					</div>
				) : null}
				<TopologyWorkspace
					domain={domain}
					graph={view.graph}
					layout={view.layout}
					loadedUpdated={view.layoutRecord?.updated}
					layoutPersisted={view.layoutPersisted}
					readOnly
					overview
				/>
			</div>
		</section>
	)
}

function OverviewStat({ label, value }: { label: string; value: number }) {
	return (
		<span className="inline-flex h-7 items-center gap-1 rounded-md border border-border/70 bg-card px-2 text-[11px] tabular-nums">
			<strong className="font-semibold text-foreground">{value}</strong>
			<span className="text-muted-foreground">{label}</span>
		</span>
	)
}

export default memo(HomeNetworkTopology)
