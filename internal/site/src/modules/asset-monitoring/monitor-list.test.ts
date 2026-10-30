import assert from "node:assert/strict"
import test from "node:test"
import type { AssetMonitorListItem } from "@/types"
import {
	countMonitoredBindings,
	filterMonitorItems,
	getAgentMetrics,
	getWebsiteMetrics,
	metricTone,
	splitMonitorItems,
} from "./monitor-list.ts"

function item(partial: {
	assetId: string
	state: AssetMonitorListItem["state"]
	binding?: boolean
	provider?: "agent" | "website"
	name?: string
}): AssetMonitorListItem {
	return {
		asset: { id: partial.assetId, name: partial.name ?? partial.assetId, type: "mini_pc" },
		provider: partial.provider ?? "agent",
		state: partial.state,
		binding: partial.binding === false ? null : ({ id: `binding-${partial.assetId}` } as never),
		summary: null,
	} as unknown as AssetMonitorListItem
}

const items = [
	item({ assetId: "host-bound", state: "healthy" }),
	item({ assetId: "host-pending", state: "pending" }),
	item({ assetId: "web-unbound", state: "unbound", binding: false, provider: "website" }),
	item({ assetId: "host-unbound", state: "unbound", binding: false }),
	item({ assetId: "router", state: "unsupported", binding: false }),
]

test("split keeps only bound items as monitored and unbound monitorables in the collapsed group", () => {
	const { monitored, unbound } = splitMonitorItems(items)
	assert.deepEqual(
		monitored.map((entry) => entry.asset.id),
		["host-bound", "host-pending"]
	)
	assert.deepEqual(
		unbound.map((entry) => entry.asset.id),
		["web-unbound", "host-unbound"]
	)
})

test("unsupported assets are excluded from both groups", () => {
	const { monitored, unbound } = splitMonitorItems(items)
	assert.equal(
		monitored.some((entry) => entry.state === "unsupported"),
		false
	)
	assert.equal(
		unbound.some((entry) => entry.state === "unsupported"),
		false
	)
})

test("filter applies state, provider and search to the given group", () => {
	const filtered = filterMonitorItems(items, { search: "", stateFilter: "healthy", providerFilter: "all" })
	assert.deepEqual(
		filtered.map((entry) => entry.asset.id),
		["host-bound"]
	)

	const agents = filterMonitorItems(items, { search: "", stateFilter: "all", providerFilter: "agent" })
	assert.deepEqual(
		agents.map((entry) => entry.asset.id),
		["host-bound", "host-pending", "host-unbound", "router"]
	)

	const searched = filterMonitorItems(items, { search: "web", stateFilter: "all", providerFilter: "all" })
	assert.deepEqual(
		searched.map((entry) => entry.asset.id),
		["web-unbound"]
	)
})

test("monitored count sums the four binding states", () => {
	assert.equal(countMonitoredBindings({ pending: 2, healthy: 1, error: 0, paused: 3 }), 6)
})

test("agent metrics read cpu/mem/disk/gpu and speeds from the summary", () => {
	const agent = item({ assetId: "agent", state: "healthy" }) as AssetMonitorListItem
	agent.summary = { cpu: 11.5, mem: 34, disk: 22.1, gpu: 4.8, gpu_supported: true, upload: 1200, download: 4500 }
	const metrics = getAgentMetrics(agent)
	assert.deepEqual(metrics, { cpu: 11.5, mem: 34, disk: 22.1, gpu: 4.8, upload: 1200, download: 4500 })
})

test("agent metrics hide gpu when unsupported and drop malformed summaries", () => {
	const noGpu = item({ assetId: "nas", state: "healthy" }) as AssetMonitorListItem
	noGpu.summary = { cpu: 5, mem: 40, disk: 30, gpu: 0, gpu_supported: false, upload: 10, download: 20 }
	assert.deepEqual(getAgentMetrics(noGpu), { cpu: 5, mem: 40, disk: 30, gpu: null, upload: 10, download: 20 })

	const missing = item({ assetId: "partial", state: "healthy" }) as AssetMonitorListItem
	missing.summary = { cpu: 5 }
	assert.equal(getAgentMetrics(missing), null)

	const website = item({ assetId: "web", state: "unbound", binding: false, provider: "website" })
	assert.equal(getAgentMetrics(website), null)
})

test("website metrics read uptime and latency", () => {
	const site = item({ assetId: "site", state: "healthy", provider: "website" }) as AssetMonitorListItem
	site.summary = { uptime_24h: 99.9, last_latency_ms: 85 }
	assert.deepEqual(getWebsiteMetrics(site), { uptime24h: 99.9, latencyMs: 85 })
	assert.equal(getWebsiteMetrics(item({ assetId: "host", state: "healthy" })), null)
})

test("metric tone thresholds follow 60 and 85 percent", () => {
	assert.equal(metricTone(0), "ok")
	assert.equal(metricTone(59.9), "ok")
	assert.equal(metricTone(60), "warn")
	assert.equal(metricTone(84.9), "warn")
	assert.equal(metricTone(85), "crit")
	assert.equal(metricTone(100), "crit")
})
