import assert from "node:assert/strict"
import {
	formatAssetInterfaceKind,
	formatAssetInterfaceSpeed,
	isAssetInterfaceEnabled,
} from "./asset-interface-display.ts"
import type { AssetInterfaceRecord } from "@/types"

assert.equal(formatAssetInterfaceKind("optical"), "光纤")
assert.equal(formatAssetInterfaceKind("wifi"), "Wi-Fi")
assert.equal(formatAssetInterfaceKind("power"), "电源口")

assert.equal(formatAssetInterfaceSpeed(2500), "2.5 Gbps")
assert.equal(formatAssetInterfaceSpeed(1000), "1 Gbps")
assert.equal(formatAssetInterfaceSpeed(100), "100 Mbps")
assert.equal(formatAssetInterfaceSpeed(0), "速率未填")

assert.equal(isAssetInterfaceEnabled({ metadata: {} } as unknown as AssetInterfaceRecord), true)
assert.equal(isAssetInterfaceEnabled({ metadata: { enabled: false } } as unknown as AssetInterfaceRecord), false)
assert.equal(isAssetInterfaceEnabled({} as unknown as AssetInterfaceRecord), true)

console.log("asset interface display contract passed")
