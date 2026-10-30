import assert from "node:assert/strict"
import test from "node:test"
import { loadWebsiteEndpointAssets } from "./endpoint-assets-query.ts"

test("loads only endpoint assets and monitor-form fields", async () => {
	let options: Record<string, unknown> | undefined
	const assets = await loadWebsiteEndpointAssets(
		{
			getFullList(nextOptions) {
				options = nextOptions
				return Promise.resolve([{ id: "endpoint-1", name: "家庭门户", type: "web_endpoint" }] as never)
			},
		},
		'type = "web_endpoint"'
	)

	assert.equal(assets[0]?.id, "endpoint-1")
	assert.deepEqual(options, {
		filter: 'type = "web_endpoint"',
		sort: "name",
		fields: "id,name,type,notes,role,location,metadata",
		requestKey: null,
	})
})
