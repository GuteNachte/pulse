import { FingerprintIcon, IdCardIcon } from "lucide-react"
import { SystemMetaTag } from "@/components/system-meta-tags"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { getSystemDisplayName, getSystemHostname } from "@/lib/system-roles"
import { getSystemIPAddress } from "@/lib/system-network"
import { formatShortDate } from "@/lib/utils"
import type { SystemDetailsRecord, SystemRecord } from "@/types"

export function IdentityDetailsDialog({
	open,
	onOpenChange,
	system,
	details,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	system: SystemRecord
	details?: SystemDetailsRecord | null
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-2xl overflow-hidden rounded-lg border-border/70 bg-card p-0 shadow-none">
				<div className="border-b border-border/70 bg-surface-soft px-5 py-4">
					<DialogHeader className="pe-10">
						<DialogTitle className="flex items-center gap-2 text-base">
							<IdCardIcon className="size-4 text-muted-foreground" />
							身份详情
						</DialogTitle>
						<DialogDescription asChild>
							<div className="flex flex-wrap items-center gap-2 text-sm">
								<span>真实身份字段由 Hub 和 Agent 写入。</span>
								{system.is_local && <SystemMetaTag tone="hub">Hub</SystemMetaTag>}
							</div>
						</DialogDescription>
					</DialogHeader>
				</div>
				<div className="max-h-[calc(100dvh-10rem)] overflow-y-auto p-5">
					<IdentityDetailsFields system={system} details={details} />
				</div>
			</DialogContent>
		</Dialog>
	)
}

function IdentityDetailsFields({ system, details }: { system: SystemRecord; details?: SystemDetailsRecord | null }) {
	const hostname = details?.hostname?.trim() || getSystemHostname(system)
	const agentProfile = system.agent_profile?.trim() || system.info?.cap?.agent_profile?.trim()
	const rows = [
		["显示名称", getSystemDisplayName(system)],
		["真实主机名", hostname],
		["目标 IP", system.target_ip],
		["连接 IP", system.connect_ip || getSystemIPAddress(system)],
		["Agent 上报 IP", system.reported_ips?.filter(Boolean).join(" / ")],
		["指纹摘要", system.fingerprint_summary],
		["Agent Profile", agentProfile],
		["首次发现", formatIdentityDate(system.created)],
		["最近记录", formatIdentityDate(system.updated)],
	] as const

	return (
		<div className="grid gap-4">
			<dl className="grid gap-x-5 gap-y-2 text-sm sm:grid-cols-[7rem_1fr]">
				{rows.map(([label, value]) => (
					<div key={label} className="contents">
						<dt className="text-muted-foreground sm:text-end">{label}</dt>
						<dd className="min-w-0 break-all text-foreground">{formatIdentityValue(value)}</dd>
					</div>
				))}
			</dl>
			{system.fingerprint_summary && (
				<div className="flex items-start gap-2 rounded-md border border-border/70 bg-surface-soft px-3 py-2 text-xs text-muted-foreground">
					<FingerprintIcon className="mt-0.5 size-3.5 shrink-0" />
					<span>指纹摘要只用于核对设备身份，不展示完整指纹。</span>
				</div>
			)}
		</div>
	)
}

function formatIdentityValue(value?: string | null) {
	const normalized = value?.trim()
	return normalized || "未采集"
}

function formatIdentityDate(value?: string) {
	if (!value) {
		return ""
	}
	return formatShortDate(value)
}
