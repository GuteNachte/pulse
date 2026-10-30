import { validateNewOntRequiredFields } from "./asset-profile-validation.ts"

function assertDeepEqual(actual: unknown, expected: unknown) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
	}
}

assertDeepEqual(
	validateNewOntRequiredFields({
		vendor: "华为",
		model: "V271-20",
		managementIp: "192.168.1.1",
		fixedIpv4: "",
		carrier: "中国联通",
		operatingRole: "ifttr_main_gateway",
	}),
	[]
)

assertDeepEqual(
	validateNewOntRequiredFields({
		vendor: "华为",
		model: "V271-20",
		managementIp: "",
		fixedIpv4: "",
		carrier: "中国联通",
		operatingRole: "ifttr_main_gateway",
	}),
	["管理 IPv4"]
)
