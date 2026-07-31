const writeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"])

export function isDemoWriteRequest(demoMode: boolean, method: string | undefined) {
	return demoMode && writeMethods.has((method ?? "GET").toUpperCase())
}

export const demoReadOnlyMessage = "演示模式为只读，数据不会被修改。"
