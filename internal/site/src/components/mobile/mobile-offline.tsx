import { useStore } from "@nanostores/react"
import { WifiOffIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { readMobileSnapshot, saveMobileSnapshot, type MobileSnapshot } from "@/lib/mobile-cache"
import { useOnlineState } from "@/lib/network-state"
import { $alerts, $systems } from "@/lib/stores"
import { MobileEmptyState } from "./mobile-ui"

export function MobileSnapshotBridge() {
	const systems = useStore($systems)
	const alerts = useStore($alerts)

	useEffect(() => {
		saveMobileSnapshot(systems, alerts)
	}, [systems, alerts])

	return null
}

export function MobileOfflineBanner() {
	const online = useOnlineState()
	const [snapshot, setSnapshot] = useState<MobileSnapshot | null>(null)

	useEffect(() => {
		if (!online) {
			setSnapshot(readMobileSnapshot())
		}
	}, [online])

	if (online) {
		return null
	}

	return (
		<Card className="border-border/70 bg-card p-3 shadow-none">
			<div className="flex items-start gap-3">
				<div className="grid size-8 shrink-0 place-items-center rounded-md border border-border/70 bg-surface-soft">
					<WifiOffIcon className="size-4 text-muted-foreground" />
				</div>
				<div className="grid min-w-0 gap-2 text-sm">
					<div className="font-semibold">离线只读模式</div>
					{snapshot ? (
						<div className="flex flex-wrap gap-1.5">
							<Badge variant="outline">
								客户端 {snapshot.systems.online}/{snapshot.systems.total}
							</Badge>
							<Badge variant={snapshot.alerts.triggered ? "warning" : "outline"}>
								告警 {snapshot.alerts.triggered}
							</Badge>
							<Badge variant="outline">缓存 {formatTime(snapshot.createdAt)}</Badge>
						</div>
					) : (
						<MobileEmptyState className="min-h-20 text-xs">暂无可用缓存，恢复网络后会自动刷新。</MobileEmptyState>
					)}
					<div className="rounded-md border border-border/70 bg-surface-soft px-3 py-2 text-xs leading-relaxed text-muted-foreground">
						离线时禁止启动、停止、重启、更新等操作，避免网络恢复后状态不一致。
					</div>
				</div>
			</div>
		</Card>
	)
}

function formatTime(value: string) {
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) {
		return value
	}
	return date.toLocaleString("zh-CN", { hour12: false })
}
