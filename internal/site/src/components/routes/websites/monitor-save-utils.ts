import type { WebsiteMonitorRecord } from "@/types"
import type { buildTargetPayload } from "./target-utils"
import { monitorTargetsFromRecord } from "./target-utils"

type TargetPayload = ReturnType<typeof buildTargetPayload>

export function hasMonitorCheckInputsChanged(
	monitor: WebsiteMonitorRecord | undefined,
	targetPayload: TargetPayload,
	intervalSeconds: number,
	timeoutSeconds: number
) {
	if (!monitor) {
		return true
	}
	const previousTargets = monitorTargetsFromRecord(monitor).map(normalizeCheckTarget)
	const nextTargets = targetPayload.map(normalizeCheckTarget)
	return (
		JSON.stringify(previousTargets) !== JSON.stringify(nextTargets) ||
		Number(monitor.interval_seconds || 300) !== Number(intervalSeconds || 300) ||
		Number(monitor.timeout_seconds || 10) !== Number(timeoutSeconds || 10)
	)
}

function normalizeCheckTarget(target: TargetPayload[number]) {
	return {
		id: target.id,
		url: target.url,
		scope: target.scope ?? "",
		ip_version: target.ip_version ?? "",
	}
}
