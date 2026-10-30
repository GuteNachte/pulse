import { getPhoneVariantSpecMode } from "./asset-phone-variant-spec.ts"

function assertEqual(actual: unknown, expected: unknown) {
	if (actual !== expected) throw new Error(`Expected ${String(expected)}, received ${String(actual)}`)
}

assertEqual(getPhoneVariantSpecMode("16", ["8", "16"]), "preset")
assertEqual(getPhoneVariantSpecMode("10", ["8", "16"]), "custom")
assertEqual(getPhoneVariantSpecMode("", ["8", "16"]), "preset")
