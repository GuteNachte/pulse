import { Link, prependBasePath } from "@/components/router"
import { ToastAction } from "@/components/ui/toast"
import { operationFailureLabel } from "@/lib/operation-history"
import type { OperationFailureCode } from "@/types"

export type OperationApiResponse = {
	id?: string
	status?: string
	stage?: string
	duration_ms?: number
	failure_code?: OperationFailureCode
	message?: string
}

export function formatOperationResponseMessage(response: OperationApiResponse | undefined, fallback: string) {
	const message = response?.message?.trim() || fallback
	if (response?.status !== "failed" || !response.failure_code) {
		return message
	}
	const label = operationFailureLabel(response.failure_code)
	return label ? `${label}：${message}` : message
}

export function getOperationResponseFromError(error: unknown): OperationApiResponse | undefined {
	if (!isRecord(error)) {
		return undefined
	}
	const response = isRecord(error.response) ? error.response : undefined
	const data = response && isRecord(response.data) ? response.data : undefined
	const source = data ?? response
	if (!source) {
		return undefined
	}
	return {
		id: getString(source.id),
		status: getString(source.status),
		stage: getString(source.stage),
		duration_ms: getNumber(source.duration_ms),
		failure_code: getOperationFailureCode(source.failure_code),
		message: getString(source.message),
	}
}

export function getOperationErrorMessage(error: unknown, fallback: string) {
	const response = getOperationResponseFromError(error)
	if (response) {
		return formatOperationResponseMessage({ ...response, status: response.status || "failed" }, fallback)
	}
	if (error instanceof Error && error.message.trim()) {
		return error.message
	}
	return fallback
}

export function OperationToastAction({ systemId }: { systemId: string }) {
	return (
		<ToastAction altText="查看操作记录" asChild>
			<Link href={operationHistoryHref(systemId)}>查看记录</Link>
		</ToastAction>
	)
}

export function operationHistoryHref(systemId: string) {
	return prependBasePath(`/system/${systemId}?tab=history`)
}

function getOperationFailureCode(value: unknown): OperationFailureCode | undefined {
	if (typeof value !== "string") {
		return undefined
	}
	return operationFailureLabel(value as OperationFailureCode) ? (value as OperationFailureCode) : undefined
}

function getString(value: unknown) {
	return typeof value === "string" ? value : undefined
}

function getNumber(value: unknown) {
	return typeof value === "number" ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null
}
