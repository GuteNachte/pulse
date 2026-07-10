import { getAssetRecognitionRequirements, validateAssetProfileForm } from "./asset-profile-validation.ts"
import type { AssetRecord } from "../../types"

function assertDeepEqual(actual: unknown, expected: unknown) {
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
	}
}

const phoneAsset = {
	type: "phone",
	name: "RedmiK50",
	vendor: "小米 / Redmi",
	model: "Redmi K50",
	location: "家 / 卧室",
	management_ip: "192.168.1.60",
	metadata: {
		internal_model: "22041211AC",
		asset_tag: "ASSET-0002",
		memory_gb: 12,
		storage_gb: 256,
	},
} as unknown as AssetRecord

assertDeepEqual(getAssetRecognitionRequirements(phoneAsset), [
	{ label: "IPv4", value: "192.168.1.60", ok: true },
	{ label: "厂商 / 品牌", value: "小米 / Redmi", ok: true },
	{ label: "型号 / 规格", value: "Redmi K50", ok: true },
	{ label: "内部型号 / 搜索代码", value: "22041211AC", ok: true },
	{ label: "资产编号", value: "ASSET-0002", ok: true },
	{ label: "所属类型", value: "手机", ok: true },
	{ label: "位置", value: "家 / 卧室", ok: true },
	{ label: "运行内存", value: "12 GB", ok: true },
	{ label: "存储容量", value: "256 GB", ok: true },
])

assertDeepEqual(
	validateAssetProfileForm({
		type: "phone",
		name: "RedmiK50",
		vendor: "小米 / Redmi",
		model: "Redmi K50",
		internalModel: "22041211AC",
		color: "墨羽",
		assetTag: "ASSET-0002",
		location: "家 / 卧室",
		ipv4: "192.168.001.60",
		memoryGb: "0",
		storageGb: "",
	}),
	["IPv4 格式不正确", "运行内存", "存储容量"]
)
