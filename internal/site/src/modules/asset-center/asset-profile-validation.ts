export function validateNewOntRequiredFields(values: {
	vendor: string
	model: string
	managementIp: string
	fixedIpv4: string
	carrier: string
	operatingRole: string
}) {
	const errors: string[] = []
	if (!values.vendor.trim()) errors.push("品牌")
	if (!values.model.trim()) errors.push("型号 / 规格")
	// 2026-10-04 产品决策：位置全部选填，不再作为建档必填
	if (!firstNonEmpty(values.managementIp, values.fixedIpv4)) errors.push("管理 IPv4")
	if (!values.carrier.trim()) errors.push("运营商")
	if (!values.operatingRole.trim()) errors.push("工作角色")
	return errors
}

function firstNonEmpty(...values: (string | undefined)[]) {
	return values.find((value) => value?.trim())?.trim() ?? ""
}
