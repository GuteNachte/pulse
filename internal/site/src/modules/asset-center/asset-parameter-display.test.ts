import { formatAssetParameterRowDisplay } from "./asset-parameter-display.ts"

function assertDeepEqual(actual: unknown, expected: unknown) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
	}
}

assertDeepEqual(formatAssetParameterRowDisplay({ key: "memory_gb", label: "运行内存 GB" }, "12"), {
	label: "运行内存",
	value: "12 GB",
})

assertDeepEqual(formatAssetParameterRowDisplay({ key: "memory_gb", label: "运行内存 GB" }, "GB 12"), {
	label: "运行内存",
	value: "12 GB",
})

assertDeepEqual(formatAssetParameterRowDisplay({ key: "memory_custom", label: "运行内存GB" }, "12GB"), {
	label: "运行内存",
	value: "12 GB",
})

assertDeepEqual(formatAssetParameterRowDisplay({ key: "battery_capacity_mah", label: "电池容量" }, "5500"), {
	label: "电池容量",
	value: "5500 mAh",
})

assertDeepEqual(formatAssetParameterRowDisplay({ key: "memory_type", label: "内存类型" }, "LPDDR5"), {
	label: "内存类型",
	value: "LPDDR5",
})

assertDeepEqual(formatAssetParameterRowDisplay({ key: "panel_color", label: "RGB" }, "支持"), {
	label: "RGB",
	value: "支持",
})
