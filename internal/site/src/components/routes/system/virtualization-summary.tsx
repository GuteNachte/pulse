import { MonitorCogIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { formatBytes } from "@/lib/utils"
import type { SystemDetailsRecord } from "@/types"

export function VirtualizationSummary({ details }: { details?: SystemDetailsRecord | null }) {
	const virtualization = details?.virtualization
	const hasDetectedInfo = Boolean(virtualization?.type && virtualization.type !== "none")
	const virtualMachines = virtualization?.virtual_machines ?? []
	const detectedType = hasDetectedInfo ? getVirtualizationTypeLabel(virtualization?.type) : "无"

	return (
		<div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border/70 bg-card px-3 py-1.5">
			<div className="flex min-w-0 items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
					<MonitorCogIcon className="size-4 shrink-0 text-muted-foreground" />
					<span>虚拟化信息</span>
				</div>
				{virtualization?.role === "host" && <Badge variant="outline">{virtualMachines.length || 0} 台虚拟机</Badge>}
			</div>
			<VirtualizationMetric value={detectedType} />
			{virtualization?.role === "host" && virtualMachines.length > 0 && (
				<div className="mt-2 grid gap-1.5">
					{virtualMachines.slice(0, 3).map((machine, index) => (
						<div
							key={machine.id || `${machine.name}-${index}`}
							className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-md border border-border/70 bg-surface-soft px-2 py-1.5 text-xs"
						>
							<span className="min-w-0 truncate font-medium" title={machine.name}>
								{machine.name}
							</span>
							<Badge variant={getVirtualMachineStatusVariant(machine.status)} className="h-5 px-1.5 text-[10px]">
								{getVirtualMachineStatusLabel(machine.status)}
							</Badge>
							<span className="text-muted-foreground tabular-nums">
								{machine.vcpu ? `${machine.vcpu} 核` : "无"} / {machine.memory ? formatBytes(machine.memory) : "无"}
							</span>
						</div>
					))}
					{virtualMachines.length > 3 && (
						<div className="text-xs text-muted-foreground">还有 {virtualMachines.length - 3} 台</div>
					)}
				</div>
			)}
		</div>
	)
}

function VirtualizationMetric({ value }: { value: string }) {
	return (
		<div className="min-w-0 rounded-md border border-border/70 bg-surface-soft px-2 py-1">
			<div className="truncate text-[11px] font-semibold" title={value}>
				{value}
			</div>
		</div>
	)
}

function getVirtualizationTypeLabel(type?: string) {
	const labels: Record<string, string> = {
		hyperv: "Hyper-V",
		kvm: "KVM/QEMU",
		vmware: "VMware",
		virtualbox: "VirtualBox",
		xen: "Xen",
		parallels: "Parallels",
		bhyve: "bhyve",
		proxmox: "Proxmox",
	}
	return labels[type ?? ""] ?? type ?? "未识别"
}

function getVirtualMachineStatusLabel(status?: string) {
	const labels: Record<string, string> = {
		running: "运行中",
		stopped: "已停止",
		paused: "已暂停",
		saved: "已保存",
	}
	return labels[status ?? ""] ?? status ?? "无"
}

function getVirtualMachineStatusVariant(status?: string) {
	if (status === "running") {
		return "success"
	}
	if (status === "paused" || status === "saved") {
		return "warning"
	}
	if (status === "stopped") {
		return "secondary"
	}
	return "outline"
}
