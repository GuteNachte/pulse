import type { RecordModel } from "pocketbase"
import type { OperationFailureCode } from "@/types"

export interface OperationActorInfo {
	id?: string
	username?: string
	email?: string
}

export interface OperationActionRecord extends RecordModel {
	system?: string
	user?: string
	actor?: OperationActorInfo
	expand?: {
		user?: OperationActorInfo
	}
	action: string
	target: string
	status: "pending" | "running" | "succeeded" | "failed"
	stage?: "queued" | "validating" | "executing" | "completed"
	failure_code?: OperationFailureCode
	result: string
	error: string
	timeout_seconds?: number
	started_at?: string
	completed_at?: string
	duration_ms?: number
	created: string
}

export interface OperationAuditRecord extends RecordModel {
	operation?: string
	system?: string
	user?: string
	actor?: OperationActorInfo
	expand?: {
		user?: OperationActorInfo
	}
	action: string
	target?: string
	result: "success" | "failed"
	failure_code?: OperationFailureCode
	detail?: string
	ip?: string
	created: string
}

export type OperationHistoryEntry =
	| {
			kind: "action"
			id: string
			created: string
			action: OperationActionRecord
			audit?: OperationAuditRecord
	  }
	| {
			kind: "audit"
			id: string
			created: string
			audit: OperationAuditRecord
	  }

export const operationStatusVariant = {
	pending: "outline",
	running: "warning",
	succeeded: "success",
	failed: "danger",
} as const

export const operationActionLabels: Record<string, string> = {
	refresh_services: "刷新服务",
	start_monitored_service: "启动服务",
	stop_monitored_service: "停止服务",
	restart_monitored_service: "重启服务",
	start_container: "启动容器",
	stop_container: "停止容器",
	restart_container: "重启容器",
	update_container_image: "更新容器镜像",
	start_container_stack: "启动容器堆栈",
	stop_container_stack: "停止容器堆栈",
	restart_container_stack: "重启容器堆栈",
	update_container_stack_images: "更新堆栈镜像",
	update_agent: "更新 Agent",
	test_notification: "测试通知通道",
	upsert_user_alerts: "保存个人告警",
	delete_user_alerts: "删除个人告警",
	upsert_global_alert_policy: "保存全局告警策略",
	delete_global_alert_policy: "删除全局告警策略",
	acknowledge_alert: "确认告警",
	silence_alert: "静默告警",
	unsilence_alert: "取消静默告警",
	check_website_monitor: "立即检测网站",
	create_user: "创建用户",
	update_user: "更新用户",
	reset_user_password: "重置用户密码",
	delete_user: "删除用户",
	create_backup: "创建备份",
	download_backup: "下载备份",
	delete_backup: "删除备份",
	restore_backup: "恢复备份",
	pair_agent: "配对 Agent",
	create_pairing_code: "创建接入会话",
	enable_universal_token: "启用通用 Token",
	disable_universal_token: "停用通用 Token",
	sync_agent_releases: "同步 Agent 版本",
	refresh_smart: "刷新 S.M.A.R.T.",
	upsert_monitoring_rule: "保存监控规则",
	delete_monitoring_rule: "删除监控规则",
	delete_service_control_rule: "删除服务控制规则",
	delete_system: "删除机器",
	create_system: "创建机器",
	update_system: "更新机器",
	delete_system_record: "删除机器记录",
	create_alert_rule: "创建告警规则",
	update_alert_rule: "更新告警规则",
	delete_alert_rule: "删除告警规则",
	create_alert_policy: "创建告警策略",
	update_alert_policy: "更新告警策略",
	delete_alert_policy: "删除告警策略",
	create_website_monitor: "创建网站监控",
	update_website_monitor: "更新网站监控",
	delete_website_monitor: "删除网站监控",
	create_user_settings: "创建用户设置",
	update_user_settings: "更新用户设置",
	delete_user_settings: "删除用户设置",
	create_agent_token: "创建 Agent Token",
	update_agent_token: "更新 Agent Token",
	delete_agent_token: "删除 Agent Token",
	rotate_agent_token: "轮换 Agent Token",
	unbind_agent_token: "解绑 Agent Token",
	create_smart_device: "创建 S.M.A.R.T. 设备",
	update_smart_device: "更新 S.M.A.R.T. 设备",
	delete_smart_device: "删除 S.M.A.R.T. 设备",
	create_alert_history: "创建告警记录",
	update_alert_history: "更新告警记录",
	delete_alert_history: "删除告警记录",
	delete_pairing_code: "删除接入会话",
	create_service_control_rule: "创建服务规则",
	update_service_control_rule: "更新服务规则",
	delete_service_control_rule_record: "删除服务规则记录",
	create_software_monitor_rule: "创建软件规则",
	update_software_monitor_rule: "更新软件规则",
	delete_software_monitor_rule: "删除软件规则",
	create_container_monitor_rule: "创建容器规则",
	update_container_monitor_rule: "更新容器规则",
	delete_container_monitor_rule: "删除容器规则",
	create_notification_failure: "创建通知诊断",
	update_notification_failure: "更新通知诊断",
	delete_notification_failure: "删除通知诊断",
	delete_notification_channel_health: "删除通知通道健康记录",
	delete_alert_notification_state: "删除告警通知冷却记录",
	create_script_template: "创建脚本模板",
	update_script_template: "更新脚本模板",
	delete_script_template: "删除脚本模板",
}

const failureCodeLabel: Record<OperationFailureCode, string> = {
	offline: "机器离线",
	agent_disconnected: "Agent 未连接",
	timeout: "操作超时",
	protected: "保护规则",
	unsupported: "不支持",
	denied: "已拒绝",
	invalid_request: "请求无效",
	not_found: "目标不存在",
	failed: "执行失败",
}

export function operationActionLabel(action: string) {
	return operationActionLabels[action] ?? action
}

export function operationFailureLabel(code?: OperationFailureCode) {
	return code ? failureCodeLabel[code] : ""
}

export function operationStatusLabel(status: OperationActionRecord["status"]) {
	switch (status) {
		case "pending":
			return "等待"
		case "running":
			return "执行中"
		case "succeeded":
			return "成功"
		case "failed":
			return "失败"
	}
}

export function operationStageLabel(stage: OperationActionRecord["stage"], status: OperationActionRecord["status"]) {
	switch (stage || operationStageForStatus(status)) {
		case "queued":
			return "排队中"
		case "validating":
			return "校验中"
		case "executing":
			return "执行中"
		case "completed":
			return "已完成"
		default:
			return "-"
	}
}

export function buildOperationHistoryEntries(
	actions: OperationActionRecord[],
	audits: OperationAuditRecord[],
	auditByOperation: Map<string, OperationAuditRecord>
): OperationHistoryEntry[] {
	const actionIds = new Set(actions.map((action) => action.id))
	const actionEntries = actions.map((action) => ({
		kind: "action" as const,
		id: action.id,
		created: action.created,
		action,
		audit: auditByOperation.get(action.id),
	}))
	const auditEntries = audits
		.filter((audit) => !audit.operation || !actionIds.has(audit.operation))
		.map((audit) => ({
			kind: "audit" as const,
			id: audit.id,
			created: audit.created,
			audit,
		}))
	return [...actionEntries, ...auditEntries].sort((a, b) => Date.parse(b.created) - Date.parse(a.created))
}

export function formatOperationActionResult(action: OperationActionRecord) {
	const detail = action.error || action.result || ""
	if (action.status !== "failed" || !action.failure_code) {
		return detail || "-"
	}
	const label = operationFailureLabel(action.failure_code) || "执行失败"
	return detail ? `${label}：${detail}` : label
}

export function formatOperationAuditResult(audit: OperationAuditRecord) {
	const detail = audit.detail || ""
	if (audit.result !== "failed" || !audit.failure_code) {
		return detail || "-"
	}
	const label = operationFailureLabel(audit.failure_code) || "执行失败"
	return detail ? `${label}：${detail}` : label
}

export function formatOperationAuditSummary(audit?: OperationAuditRecord) {
	if (!audit) {
		return "未关联审计"
	}
	const result = audit.result === "success" ? "成功" : "失败"
	const ip = audit.ip?.trim()
	return ip ? `${result} / ${ip}` : result
}

export function formatOperationActor(record?: {
	user?: string
	actor?: OperationActorInfo
	expand?: { user?: OperationActorInfo }
}) {
	const actor = record?.actor || record?.expand?.user
	return actor?.username || actor?.email || actor?.id || record?.user || "-"
}

export function formatOperationDuration(action: OperationActionRecord) {
	if (action.duration_ms && action.duration_ms > 0) {
		return formatMilliseconds(action.duration_ms)
	}
	if (action.status === "running") {
		const startedAt = Date.parse(action.started_at || action.created)
		if (!Number.isNaN(startedAt)) {
			return `${formatMilliseconds(Date.now() - startedAt)} / ${action.timeout_seconds || "-"} 秒`
		}
	}
	return "-"
}

export function formatOperationDate(value: string) {
	if (!value) {
		return "-"
	}
	const date = new Date(value)
	if (Number.isNaN(date.getTime())) {
		return value
	}
	return date.toLocaleString("zh-CN", { hour12: false })
}

function operationStageForStatus(status: OperationActionRecord["status"]): OperationActionRecord["stage"] {
	switch (status) {
		case "pending":
			return "queued"
		case "running":
			return "executing"
		case "succeeded":
		case "failed":
			return "completed"
	}
}

function formatMilliseconds(ms: number) {
	if (!Number.isFinite(ms) || ms < 0) {
		return "-"
	}
	const seconds = ms / 1000
	if (seconds < 10) {
		return `${seconds.toFixed(1)} 秒`
	}
	return `${Math.round(seconds)} 秒`
}
