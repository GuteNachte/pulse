import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import type { AssetRecord } from "../../types.ts"
import { buildAssetCenterSnapshot, buildAssetExportCsv } from "./asset-export.ts"
import { buildImportPreviewRow, normalizeMetadata } from "./asset-import.ts"
import { buildAssetImportJsonExample } from "./asset-import-templates.ts"
import { validateAssetImportMetadata } from "./asset-type-specs.ts"

const errors = validateAssetImportMetadata("ont", {
	carrier: "中国联通",
	operating_role: "ifttr_main_gateway",
	fixed_ipv4: "192.168.1.1",
	ssid: "redacted",
	cpu_model: "not-allowed",
})
assert.equal(errors.includes("包含不允许保存的敏感字段 metadata.ssid"), true)
assert.equal(errors.includes("字段 metadata.cpu_model 不属于光猫 / ONT 严格模板"), true)

const ontImport = buildImportPreviewRow(
	{
		name: "测试 ONT",
		type: "ont",
		status: "active",
		vendor: "华为",
		model: "V271-20",
		location: "家 / 弱电箱",
		"metadata.carrier": "中国联通",
		"metadata.operating_role": "ifttr_main_gateway",
		"metadata.fixed_ipv4": "192.168.1.1",
		"metadata.ssid": "redacted",
		"metadata.cpu_model": "not-allowed",
	},
	0,
	[]
)
assert.equal(ontImport.errors.includes("包含不允许保存的敏感字段 metadata.ssid"), true)
assert.equal(ontImport.errors.includes("字段 metadata.cpu_model 不属于光猫 / ONT 严格模板"), true)
assert.deepEqual(normalizeMetadata({ lan_port_count: "4", lan_2500_count: "1", lan_1000_count: "3" }, "ont"), {
	lan_port_count: 4,
	lan_2500_count: 1,
	lan_1000_count: 3,
})

const importSource = readFileSync(new URL("./asset-import.ts", import.meta.url), "utf8")
assert.equal(importSource.includes("validateAssetImportMetadata"), true)

const templateSource = readFileSync(new URL("./asset-import-templates.ts", import.meta.url), "utf8")
const ontTemplateStart = templateSource.indexOf('name: "V271-20"')
const ontTemplateEnd = templateSource.indexOf("\n\t{", ontTemplateStart + 1)
const ontTemplate = templateSource.slice(ontTemplateStart, ontTemplateEnd)
assert.equal(ontTemplate.includes('type: "ont"'), true)
assert.equal(ontTemplate.includes('"metadata.operating_role": "ifttr_main_gateway"'), true)
assert.equal(ontTemplate.includes('"metadata.wifi_5_enabled": "enabled"'), true)
assert.equal(ontTemplate.includes("metadata.ssid"), false)

const ont = {
	id: "ont-1",
	user: "user-1",
	name: "测试 ONT",
	type: "ont",
	status: "active",
	vendor: "华为",
	model: "V271-20",
	location: "家 / 弱电箱",
	metadata: { operating_role: "ifttr_main_gateway", pon_standard: "10G-EPON", pon_sn: "TEST00000001" },
	created: "2026-07-19 00:00:00.000Z",
	updated: "2026-07-19 00:00:00.000Z",
} as unknown as AssetRecord

const csv = buildAssetExportCsv([ont], new Set())
const snapshot = buildAssetCenterSnapshot({
	exportedAt: new Date("2026-07-19T00:00:00.000Z"),
	assets: [ont],
	assetInterfaces: [],
	assetRelations: [],
	assetLocations: [],
	assetMaintenance: [],
	assetAttachments: [],
})
for (const output of [csv, snapshot]) {
	assert.equal(output.includes("ifttr_main_gateway"), true)
	assert.equal(output.includes("10G-EPON"), true)
	assert.equal(output.includes("TEST00000001"), true)
	for (const forbidden of ["wifi_password", "ssid", "credential"]) assert.equal(output.includes(forbidden), false)
}

const physicalPreview = buildImportPreviewRow(
	{ name: "测试主机", type: "mini_pc", "metadata.fixed_ipv6": "2001:db8::10" },
	0,
	[]
)
assert.equal(physicalPreview.form.metadata.fixed_ipv6, undefined)
assert.equal(physicalPreview.warnings.includes("已忽略历史字段 metadata.fixed_ipv6"), true)

const internetPreview = buildImportPreviewRow(
	{ name: "家庭宽带", type: "internet", vendor: "中国联通", "metadata.public_ipv6": "2001:db8::20" },
	0,
	[]
)
assert.equal(internetPreview.form.metadata.public_ipv6, "2001:db8::20")

const historicalIpv6Asset = {
	...ont,
	id: "historical-ipv6",
	metadata: { ...ont.metadata, fixed_ipv6: "2001:db8::30", public_ipv6: "2001:db8::40" },
} as AssetRecord
const sanitizedCsv = buildAssetExportCsv([historicalIpv6Asset], new Set())
const sanitizedSnapshot = buildAssetCenterSnapshot({
	exportedAt: new Date("2026-07-19T00:00:00.000Z"),
	assets: [historicalIpv6Asset],
	assetInterfaces: [],
	assetRelations: [],
	assetLocations: [],
	assetMaintenance: [],
	assetAttachments: [],
})
assert.equal(sanitizedCsv.includes("fixed_ipv6"), false)
assert.equal(sanitizedSnapshot.includes("fixed_ipv6"), false)
assert.equal(sanitizedSnapshot.includes("public_ipv6"), true)

assert.equal(templateSource.includes("metadata.fixed_ipv6"), false)

const templateExamples = JSON.parse(buildAssetImportJsonExample()) as {
	type: string
	metadata?: Record<string, string>
}[]
const internetExample = templateExamples.find((item) => item.type === "internet")
const switchExample = templateExamples.find((item) => item.type === "switch")
assert.equal("public_ipv6" in (switchExample?.metadata ?? {}), false)
assert.equal("cpu_model" in (switchExample?.metadata ?? {}), false)
assert.equal("has_public_ip" in (internetExample?.metadata ?? {}), false)
assert.equal("port_count" in (switchExample?.metadata ?? {}), false)

console.log("asset import and export contract passed")
