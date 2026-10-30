import assert from "node:assert/strict"
import test from "node:test"
import { createMonitorFormFromEndpointAsset } from "./asset-form.ts"
import type { AssetRecord } from "../../../types.ts"

const endpointAsset = (overrides: Partial<AssetRecord> = {}) =>
	({
		id: "endpoint-1",
		user: "user-1",
		name: "家庭门户",
		type: "web_endpoint",
		location: "家 / 书房",
		role: "家庭服务",
		notes: "局域网仪表盘",
		metadata: {},
		created: "",
		updated: "",
		collectionId: "",
		collectionName: "assets",
		...overrides,
	}) as AssetRecord

test("website endpoint asset creates internal and external monitor targets with stable defaults", () => {
	const form = createMonitorFormFromEndpointAsset(
		endpointAsset({
			metadata: {
				internal_url: "http://pulse.local",
				external_url: "https://pulse.example.com",
			},
		}),
		{ system: "system-1" }
	)

	assert.equal(form.asset, "endpoint-1")
	assert.equal(form.system, "system-1")
	assert.equal(form.name, "家庭门户")
	assert.equal(form.description, "局域网仪表盘")
	assert.equal(form.group, "家 / 书房")
	assert.equal(form.icon_source, "internal")
	assert.equal(form.icon_url, "http://pulse.local/favicon.ico")
	assert.deepEqual(form.targets, [
		{ id: "internal-ipv4", kind: "internal-ipv4", protocol: "http://", address: "pulse.local/" },
		{ id: "external-ipv4", kind: "external-ipv4", protocol: "https://", address: "pulse.example.com/" },
	])
})

test("website endpoint asset creates an IPv6 target from its fallback URL and preserves edited defaults", () => {
	const form = createMonitorFormFromEndpointAsset(
		endpointAsset({
			metadata: { url: "https://[2408:8207::1]", endpoint_scope: "外网" },
		}),
		{
			base: {
				asset: "",
				description: "",
				enabled: false,
				expected_content: "Pulse",
				group: "",
				icon_source: "custom",
				icon_url: "https://icon.example/icon.png",
				interval_seconds: 60,
				name: "",
				system: "",
				targets: [],
				timeout_seconds: 4,
			},
		}
	)

	assert.equal(form.icon_source, "external")
	assert.equal(form.icon_url, "https://[2408:8207::1]/favicon.ico")
	assert.equal(form.enabled, false)
	assert.equal(form.interval_seconds, 60)
	assert.equal(form.timeout_seconds, 4)
	assert.deepEqual(form.targets, [
		{ id: "external-ipv6", kind: "external-ipv6", protocol: "https://", address: "[2408:8207::1]/" },
	])
})
