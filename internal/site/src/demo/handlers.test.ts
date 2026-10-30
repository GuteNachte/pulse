import assert from "node:assert/strict"
import { setupServer } from "msw/node"
import { demoHandlers } from "./handlers.ts"

const server = setupServer(...demoHandlers)
server.listen({ onUnhandledRequest: "error" })

try {
	const assetsResponse = await fetch("http://demo.local/api/collections/assets/records?page=1&perPage=20")
	assert.equal(assetsResponse.status, 200)
	const assets = (await assetsResponse.json()) as { totalItems: number; items: { id: string }[] }
	assert.equal(assets.totalItems, 12)
	assert.ok(assets.items.some((item) => item.id === "demo-nas"))

	const nasResponse = await fetch("http://demo.local/api/collections/assets/records/demo-nas")
	assert.equal(nasResponse.status, 200)
	const nas = (await nasResponse.json()) as { name: string }
	assert.equal(nas.name, "Atlas NAS")

	const systemsResponse = await fetch("http://demo.local/api/pulse/systems/summary")
	assert.equal(systemsResponse.status, 200)
	const systems = (await systemsResponse.json()) as { items: unknown[] }
	assert.equal(systems.items.length, 3)

	const dashboardResponse = await fetch("http://demo.local/api/pulse/dashboard/summary")
	assert.equal(dashboardResponse.status, 200)
	assert.deepEqual(await dashboardResponse.json(), {
		containers: { total: 6, running: 5, stopped: 1 },
		websites: { total: 3, up: 2, down: 1, unknown: 0 },
	})

	const backupsResponse = await fetch("http://demo.local/api/backups")
	assert.equal(backupsResponse.status, 200)
	const backups = (await backupsResponse.json()) as { items: unknown[] }
	assert.equal(backups.items.length, 3)

	const websitesResponse = await fetch("http://demo.local/api/pulse/website-monitors?page=1&perPage=50")
	assert.equal(websitesResponse.status, 200)
	const websites = (await websitesResponse.json()) as { items: unknown[]; counts: Record<string, number> }
	assert.equal(websites.items.length, 3)
	assert.deepEqual(websites.counts, { all: 3, up: 2, down: 1, unknown: 0, stale: 0 })

	for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
		const response = await fetch("http://demo.local/api/collections/assets/records/demo-nas", { method })
		assert.equal(response.status, 405)
		assert.equal(((await response.json()) as { code: string }).code, "demo_read_only")
	}

	const unknownResponse = await fetch("http://demo.local/api/pulse/unknown")
	assert.equal(unknownResponse.status, 404)
	assert.equal(((await unknownResponse.json()) as { code: string }).code, "demo_not_found")
} finally {
	server.close()
}

console.log("demo handlers contract passed")
