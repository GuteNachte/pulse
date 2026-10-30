import { formatSpeed } from "./asset-runtime-hardware.ts"
import * as assetRuntimeHardware from "./asset-runtime-hardware.ts"

function assertEqual(actual: unknown, expected: unknown) {
	if (actual !== expected) {
		throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
	}
}

assertEqual(formatSpeed(100), "100M")
assertEqual(formatSpeed(1000), "1G")
assertEqual(formatSpeed(2500), "2.5G")

const normalizeNetworkInterfaceSummary = (
	assetRuntimeHardware as {
		normalizeNetworkInterfaceSummary?: (value: string | undefined) => string
	}
).normalizeNetworkInterfaceSummary
assertEqual(
	normalizeNetworkInterfaceSummary?.("Intel(R) Ethernet Controller (3) I225-V 58:47:ca:70:6a:c2 2500000000Mbps") ?? "",
	"Intel(R) Ethernet Controller (3) I225-V 58:47:ca:70:6a:c2 2500 Mbps"
)
